# Field app on Android (Capacitor)

The field app (`apps/field`) is the same Svelte build that runs in the browser, wrapped by **Capacitor 7.6** into a native Android app.

- **App id:** `com.btwglobal.field`
- **App name:** "BTW Field"
- **Why Capacitor 7:** Capacitor 8's CLI needs Node ≥ 22, and this repo is on Node 20.16. Moving to 8 later is a dependency bump plus `npx cap migrate`.

## One-time setup
```bash
bash scripts/setup-android.sh     # JDK 21 → ~/.local/opt/jdk-21, Android SDK 35/36 → ~/Android/Sdk (~1.1 GB)
```
The first APK build also downloads Gradle and its dependencies into `~/.gradle`, about 2 GB.

## Build and install
```bash
pnpm android:build                                   # debug APK running on the built-in mock data
VITE_API=http VITE_API_URL=http://192.168.1.50:3101/v1 pnpm android:build   # talk to the API on this PC (use its LAN IP)
VITE_API=http VITE_API_URL=http://10.0.2.2:3101/v1 pnpm android:build       # Android emulator → host machine
$ANDROID_HOME/platform-tools/adb install -r apps/field/android/app/build/outputs/apk/debug/app-debug.apk
```
- The APK is written to `apps/field/android/app/build/outputs/apk/debug/app-debug.apk`.
- `pnpm android:sync` copies the web build into `android/` without compiling, for use with Android Studio.
- `pnpm android:open` opens the project in Android Studio, which is not installed on this machine.
- **CI:** `.github/workflows/android.yml` builds the same APK on every change to the field app. Run it manually with an `api_url` input to bake in an API address.
- **Plain HTTP:** debug builds allow plain `http://` so they can reach a LAN or emulator API (`app/src/debug/AndroidManifest.xml`). Release builds must use https.

## Native services
Screens call only `apps/field/src/native/index.ts`, which follows the contract in `docs/04-build-plan.md` §5. Every call has a browser fallback, so the same code runs in `pnpm dev:field` and in the mockups.

| Service | Android | Browser fallback |
|---|---|---|
| `getPosition` | @capacitor/geolocation (asks for permission) | `navigator.geolocation` |
| `startTracking` / `stopTracking` | @capacitor-community/background-geolocation, see below | `watchPosition` |
| `takePhoto` | @capacitor/camera | File picker with `capture=environment` |
| `registerPush` | @capacitor/push-notifications (FCM), see below | No-op |
| `network` | @capacitor/network | `online`/`offline` events |
| `secureStore` | @capacitor/preferences: app-private SharedPreferences. Move tokens to an encrypted store before production. | `localStorage` |
| `haptic` | @capacitor/haptics | `navigator.vibrate` |

**`startTracking`:**
- Runs as a foreground service with the notification "BTW Field · trip in progress" and a 100 m distance filter.
- Checks geofences on the phone: the next 2–3 checkpoints only, firing `enter` and `exit`, with 15% exit hysteresis for GPS jitter at borders.
- Sends a `ping` at most every 5 minutes, so tracking uses about 1 MB of data a day.

**Photos** are compressed on the phone to 1600 px and 70% JPEG before they are queued.

**Push** only registers when the app is built with `VITE_PUSH=1` **and** `android/app/google-services.json` exists (Firebase project). Without Firebase, calling `register()` crashes Android apps, so push is off by default and alerts arrive by SMS and in-app.

## Permissions (`android/app/src/main/AndroidManifest.xml`)
Granted at the moment a feature first needs them:
- Location (fine and coarse), plus a foreground service of type location
- Notifications, needed on Android 13+ for the "sharing location" notice
- Camera
- Network state and vibrate

`ACCESS_BACKGROUND_LOCATION` is deliberately **not** requested. The foreground service covers a trip while the app is in the background, and avoids Google Play's extra background-location review.

## Icons and splash
- **Launcher icons and splash screens:** generated from `packages/ui/src/assets/brand/` by `npx @capacitor/assets generate --android --assetPath resources`. The source files are copied into `apps/field/resources/`.
- **Notification icon:** `res/drawable-*/ic_stat_btw.png`, a white monogram.
- **After the brand assets change:** run `python3 docs/brand/build_brand.py`, copy the files into `resources/`, then re-run the generate command.
