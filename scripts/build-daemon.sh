#!/bin/sh
# Builds daemon/presence_host against the Discord Social SDK unpacked in vendor/ (not in git).
set -e
cd "$(dirname "$0")/.."
S=vendor/discord-social-sdk/discord_social_sdk
clang++ -std=c++17 -O2 -I"$S/include" daemon/presence_host.cpp -L"$S/lib/release" -ldiscord_partner_sdk \
  -Wl,-rpath,@executable_path/../$S/lib/release -o daemon/presence_host
