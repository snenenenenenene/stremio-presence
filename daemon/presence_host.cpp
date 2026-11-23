// One Discord Social SDK client for one user, driven by worker/rich-presence.ts over stdin.
// Env: DISCORD_APP_ID. Input lines are tab-separated:
//   token <access_token>                        sign in (first time) or swap in a refreshed token
//   set <details> <state> <image> <start> <end> show "Watching"; start/end are unix seconds, 0 = none
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
  std::string details, state, image;
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
    a.SetStatusDisplayType(discordpp::StatusDisplayTypes::Details);
    a.SetDetails(wanted->details);
    if (!wanted->state.empty()) a.SetState(wanted->state);
    if (!wanted->image.empty()) {
      discordpp::ActivityAssets assets;
      assets.SetLargeImage(wanted->image);
      assets.SetLargeText(wanted->details);
      a.SetAssets(assets);
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
    } else if (f[0] == "set" && f.size() == 6) {
      Wanted w{f[1], f[2], f[3]};
      if (!parseU64(f[4], w.start) || !parseU64(f[5], w.end)) { std::cout << "error bad timestamps" << std::endl; return; }
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
