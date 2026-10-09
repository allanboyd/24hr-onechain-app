// pnpm android:sync | android:build | android:open
// Builds the field web bundle, copies it into the Capacitor Android project and (for build) produces a debug APK.
// Uses the toolchain from scripts/setup-android.sh unless JAVA_HOME / ANDROID_HOME are already set.
// API target for the phone build:  VITE_API=http VITE_API_URL=http://<LAN-IP>:3101/v1 pnpm android:build
//   (Android emulator: http://10.0.2.2:3101/v1). Without VITE_API the APK runs on the built-in mock data.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const cmd = process.argv[2] ?? 'build';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const field = path.join(root, 'apps/field');
const env = { ...process.env };
env.JAVA_HOME ??= path.join(homedir(), '.local/opt/jdk-21');
env.ANDROID_HOME ??= path.join(homedir(), 'Android/Sdk');
env.PATH = `${path.join(env.JAVA_HOME, 'bin')}:${env.PATH}`;
if (!existsSync(path.join(env.JAVA_HOME, 'bin/java')) || !existsSync(env.ANDROID_HOME)) {
  console.error('Android toolchain not found. Run: bash scripts/setup-android.sh'); process.exit(1);
}
const run = (bin, args, cwd = field) => { const r = spawnSync(bin, args, { cwd, env, stdio: 'inherit' }); if (r.status) process.exit(r.status); };

if (cmd === 'open') { run('npx', ['cap', 'open', 'android']); process.exit(0); }
run('pnpm', ['tokens'], root);
run('npx', ['vite', 'build']);
run('npx', ['cap', 'sync', 'android']);
if (cmd === 'build') {
  run('./gradlew', ['assembleDebug', '--console=plain', '-q'], path.join(field, 'android'));
  const apk = path.join(field, 'android/app/build/outputs/apk/debug/app-debug.apk');
  console.log(`\nAPK: ${apk} (${(statSync(apk).size / 1048576).toFixed(1)} MB)`);
  console.log('Install on a phone (USB debugging on):  $ANDROID_HOME/platform-tools/adb install -r ' + path.relative(root, apk));
}
