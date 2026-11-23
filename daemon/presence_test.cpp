// One-user Social SDK test: sign in with a Discord OAuth access token and set a "Watching" activity.
// Env: DISCORD_APP_ID, DISCORD_ACCESS_TOKEN. Args: details state image_url start_unix end_unix seconds
#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <thread>

int main(int argc, char** argv) {
  if (argc < 7) { std::cerr << "usage: presence_test details state image start end seconds\n"; return 2; }
  const char* app = std::getenv("DISCORD_APP_ID");
  const char* token = std::getenv("DISCORD_ACCESS_TOKEN");
  if (!app || !token) { std::cerr << "missing env\n"; return 2; }

  auto client = std::make_shared<discordpp::Client>();
  client->SetApplicationId(std::stoull(app));
  client->AddLogCallback([](std::string msg, discordpp::LoggingSeverity) { std::cerr << "[sdk] " << msg; },
                         discordpp::LoggingSeverity::Warning);

  std::atomic<bool> done{false};
  int exitCode = 1;
  auto setPresence = [&]() {
    discordpp::Activity a;
    a.SetType(discordpp::ActivityTypes::Watching);
    a.SetStatusDisplayType(discordpp::StatusDisplayTypes::Details);
    a.SetDetails(std::string(argv[1]));
    a.SetState(std::string(argv[2]));
    discordpp::ActivityAssets assets;
    assets.SetLargeImage(std::string(argv[3]));
    a.SetAssets(assets);
    discordpp::ActivityTimestamps ts;
    ts.SetStart(std::stoull(argv[4]));
    ts.SetEnd(std::stoull(argv[5]));
    a.SetTimestamps(ts);
    client->UpdateRichPresence(std::move(a), [&](discordpp::ClientResult r) {
      std::cout << (r.Successful() ? "presence set" : "presence failed: " + r.Error()) << std::endl;
      exitCode = r.Successful() ? 0 : 1;
    });
  };

  client->SetStatusChangedCallback([&](discordpp::Client::Status s, discordpp::Client::Error e, int32_t detail) {
    std::cout << "status: " << discordpp::Client::StatusToString(s) << std::endl;
    if (s == discordpp::Client::Status::Ready) setPresence();
    if (e != discordpp::Client::Error::None) {
      std::cout << "error: " << discordpp::Client::ErrorToString(e) << " " << detail << std::endl;
      done = true;
    }
  });

  client->UpdateToken(discordpp::AuthorizationTokenType::Bearer, token, [&](discordpp::ClientResult r) {
    if (!r.Successful()) { std::cout << "token rejected: " << r.Error() << std::endl; done = true; return; }
    client->Connect();
  });

  auto until = std::chrono::steady_clock::now() + std::chrono::seconds(std::stoi(argv[6]));
  while (!done && std::chrono::steady_clock::now() < until) {
    discordpp::RunCallbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
  return exitCode;
}
