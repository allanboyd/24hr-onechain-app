import type { CapacitorConfig } from '@capacitor/cli';

// Android/iOS shell for the field app (giver, driver, receiver). The web build in dist/ is bundled into the APK.
const config: CapacitorConfig = {
  appId: 'com.btwglobal.field',
  appName: 'BTW Field',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: {
    // Keeps background location updates flowing past 5 minutes (@capacitor-community/background-geolocation README).
    useLegacyBridge: true,
    // Allow the debug build to reach a plain-http API on the LAN / emulator host (10.0.2.2). Release builds use https.
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 900, launchAutoHide: true, backgroundColor: '#062953', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { style: 'DARK', backgroundColor: '#062953', overlaysWebView: false },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    // Route fetch/XHR through native HTTP so uploads keep working while the app is in the background.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
