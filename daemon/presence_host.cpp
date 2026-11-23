// One Discord Social SDK client for one user, driven by worker/rich-presence.ts over stdin.
// Env: DISCORD_APP_ID. Input lines are tab-separated:
//   token <access_token>                        sign in (first time) or swap in a refreshed token
//   set <name> <details> <details_url> <state> <state_url> <image> <image_url> <hover> <start> <end> [<label> <url>]...
//                                               show "Watching <name>"; empty fields are left out;
//                                               start/end are unix seconds, 0 = none; up to 2 buttons
//   clear                                       remove the activity
// End of input clears the activity and exits. Output lines: "status <s>", "ok", "fail <why>", "error <why>".
// Exit codes: 0 done, 2 bad setup, 3 gave up after a network error (retry), 4 token refused (refresh first).
#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdlib>
#include <deque>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <thread>
#include <vector>

struct Wanted {
  std::string name, details, detailsUrl, state, stateUrl, image, imageUrl, hover;
  std::vector<std::pair<std::string, std::string>> buttons;  // label, url
  uint64_t start = 0, end = 0;
};

// Shared with the detached stdin reader, so they must outlive main's stack.
static std::mutex mu;
static std::deque<std::string> inbox;
static std::atomic<bool> eof{false};

// Strict unsigned parse: rejects empty, negative and non-numeric input instead of throwing or wrapping.
static bool parseU64(const std::string& s, uint64_t& out) {
  if (s.empty() || s[0] < '0' || s[0] > '9') return false;
  char* end = nullptr;
  errno = 0;
  out = std::strtoull(s.c_str(), &end, 10);
  return errno == 0 && *end == '\0';
}

static std::vector<std::string> split(const std::string& line) {
  std::vector<std::string> out;
  std::stringstream ss(line);
  std::string part;
  while (std::getline(ss, part, '\t')) out.push_back(part);
  return out;
}

int main() {
  const char* app = std::getenv("DISCORD_APP_ID");
  uint64_t appId = 0;
  if (!app || !parseU64(app, appId)) { std::cout << "error missing DISCORD_APP_ID" << std::endl; return 2; }

  std::thread reader([&] {
    std::string line;
    while (std::getline(std::cin, line)) { std::lock_guard<std::mutex> g(mu); inbox.push_back(line); }
    eof = true;
  });
  reader.detach();

  auto client = std::make_shared<discordpp::Client>();
  client->SetApplicationId(appId);
  client->AddLogCallback([](std::string msg, discordpp::LoggingSeverity) { std::cerr << "[sdk] " << msg; },
                         discordpp::LoggingSeverity::Error);

  bool ready = false, connecting = false, quit = false;
  int exitCode = 0;
  std::optional<Wanted> wanted;  // nullopt = no activity
  bool dirty = false;            // wanted changed since the last apply
  std::optional<std::chrono::steady_clock::time_point> retryAt;  // a failed update is sent again then

  auto apply = [&] {
    dirty = false;
    if (!wanted) {
      client->ClearRichPresence();
      std::cout << "ok" << std::endl;
      return;
    }
    discordpp::Activity a;
    a.SetType(discordpp::ActivityTypes::Watching);
    // The header reads "Watching <name>" (the device); the title is the details line so it can be a link.
    a.SetName(wanted->name);
    a.SetStatusDisplayType(discordpp::StatusDisplayTypes::Details);
    if (!wanted->details.empty()) a.SetDetails(wanted->details);
    if (!wanted->detailsUrl.empty()) a.SetDetailsUrl(wanted->detailsUrl);
    if (!wanted->state.empty()) a.SetState(wanted->state);
    if (!wanted->stateUrl.empty()) a.SetStateUrl(wanted->stateUrl);
    if (!wanted->image.empty()) {
      discordpp::ActivityAssets assets;
      assets.SetLargeImage(wanted->image);
      assets.SetLargeText(wanted->hover.empty() ? wanted->name : wanted->hover);
      if (!wanted->imageUrl.empty()) assets.SetLargeUrl(wanted->imageUrl);
      a.SetAssets(assets);
    }
    for (const auto& [label, url] : wanted->buttons) {
      discordpp::ActivityButton b;
      b.SetLabel(label);
      b.SetUrl(url);
      a.AddButton(b);
    }
    if (wanted->start || wanted->end) {
      discordpp::ActivityTimestamps ts;
      if (wanted->start) ts.SetStart(wanted->start);
      if (wanted->end) ts.SetEnd(wanted->end);
      a.SetTimestamps(ts);
    }
    client->UpdateRichPresence(std::move(a), [&](discordpp::ClientResult r) {
      std::cout << (r.Successful() ? "ok" : "fail " + r.Error()) << std::endl;
      if (!r.Successful()) retryAt = std::chrono::steady_clock::now() + std::chrono::seconds(15);
    });
  };

  client->SetStatusChangedCallback([&](discordpp::Client::Status s, discordpp::Client::Error e, int32_t detail) {
    std::cout << "status " << discordpp::Client::StatusToString(s) << std::endl;
    ready = s == discordpp::Client::Status::Ready;
    // After a reconnect the activity is gone on Discord's side: send it again.
    if (ready) dirty = true;
    if (e != discordpp::Client::Error::None)
      std::cout << "error " << discordpp::Client::ErrorToString(e) << " " << detail << std::endl;
    // The SDK retries network blips itself (Reconnecting); only a final Disconnected ends this host.
    // Gateway close 4004 means the token was refused.
    if (s == discordpp::Client::Status::Disconnected && connecting) {
      exitCode = detail == 4004 ? 4 : 3;
      quit = true;
    }
  });

  auto handle = [&](const std::string& line) {
    auto f = split(line);
    if (f.empty()) return;
    if (f[0] == "token" && f.size() == 2) {
      client->UpdateToken(discordpp::AuthorizationTokenType::Bearer, f[1], [&](discordpp::ClientResult r) {
        if (!r.Successful()) { std::cout << "error token " << r.Error() << std::endl; exitCode = 4; quit = true; return; }
        if (!connecting) { connecting = true; client->Connect(); }
      });
    } else if (f[0] == "set" && f.size() >= 11 && f.size() <= 15 && f.size() % 2 == 1) {
      Wanted w{f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8]};
      for (size_t i = 11; i + 1 < f.size(); i += 2) w.buttons.emplace_back(f[i], f[i + 1]);
      if (!parseU64(f[9], w.start) || !parseU64(f[10], w.end)) { std::cout << "error bad timestamps" << std::endl; return; }
      wanted = w;
      dirty = true;
    } else if (f[0] == "clear") {
      wanted.reset();
      dirty = true;
    } else {
      std::cout << "error bad command" << std::endl;
    }
  };

  while (!quit) {
    // Read eof before draining: a line pushed just before eof is then always in this batch.
    bool ended = eof;
    std::deque<std::string> batch;
    { std::lock_guard<std::mutex> g(mu); batch.swap(inbox); }
    for (auto& line : batch) handle(line);
    if (retryAt && std::chrono::steady_clock::now() >= *retryAt) { retryAt.reset(); dirty = true; }
    if (ready && dirty) apply();
    if (ended) break;
    discordpp::RunCallbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  // Leave nothing behind: clear, give the request a moment to go out, then disconnect.
  if (ready) {
    client->ClearRichPresence();
    auto until = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (std::chrono::steady_clock::now() < until) {
      discordpp::RunCallbacks();
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    client->Disconnect();
  }
  return exitCode;
}
