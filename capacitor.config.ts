import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pl.casn.app',
  appName: 'CASN',
  webDir: 'out', // zostaje, ale nieużywane przy ładowaniu zdalnego URL
  server: {
    url: 'https://casn.pl', // 🔹 produkcyjny adres Twojej strony Next.js
    cleartext: false,       // wymuś HTTPS
    androidScheme: 'https', // schemat w WebView
  },
  android: {
    allowMixedContent: false // zabezpieczenie przed mixed content
  }
};

export default config;
