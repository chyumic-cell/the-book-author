import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.michaelpolevoy.thebookauthor",
  appName: "The Book Author",
  webDir: "android-shell",
  server: {
    url: "https://the-book-author.vercel.app",
    cleartext: false,
  },
  android: {
    backgroundColor: "#f4f7fb",
  },
};

export default config;
