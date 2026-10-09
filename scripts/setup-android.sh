#!/usr/bin/env bash
# Usage: bash scripts/setup-android.sh   (then `pnpm android:build`; scripts/android.mjs finds this toolchain automatically)
# Installs JDK 21 (Temurin) and Android SDK command-line tools into the user's home. Idempotent.
set -euo pipefail
JDK_DIR="$HOME/.local/opt/jdk-21"; SDK="$HOME/Android/Sdk"; DL="$HOME/.cache/btw-toolchain"
mkdir -p "$HOME/.local/opt" "$SDK/cmdline-tools" "$DL"
if [ ! -x "$JDK_DIR/bin/java" ]; then
  curl -fsSL -o "$DL/jdk21.tgz" "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$JDK_DIR" && tar -xzf "$DL/jdk21.tgz" -C "$JDK_DIR" --strip-components=1
fi
export JAVA_HOME="$JDK_DIR" PATH="$JDK_DIR/bin:$PATH"
java -version 2>&1 | head -1
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl -fsSL -o "$DL/cmdtools.zip" "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
  rm -rf "$DL/cmdline-tools" && (cd "$DL" && unzip -q -o cmdtools.zip) && rm -rf "$SDK/cmdline-tools/latest" && mv "$DL/cmdline-tools" "$SDK/cmdline-tools/latest"
fi
SM="$SDK/cmdline-tools/latest/bin/sdkmanager"
(yes || true) | "$SM" --sdk_root="$SDK" --licenses >/dev/null || true
"$SM" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0" "platforms;android-35" "build-tools;35.0.0" >/dev/null
"$SM" --sdk_root="$SDK" --list_installed | sed -n '1,20p'
echo "DONE: JAVA_HOME=$JDK_DIR ANDROID_HOME=$SDK"
