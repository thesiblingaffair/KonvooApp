/**
 * Expo Config Plugin: Truecaller SDK for Android
 *
 * Adds:
 * - Truecaller callback activity to AndroidManifest.xml
 * - Truecaller app key meta-data
 * - Internet permission (already present)
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const TRUECALLER_APP_KEY = "YOUR_TRUECALLER_APP_KEY"; // Replace after registering at https://developer.truecaller.com

function withTruecaller(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) return config;

    // Add Truecaller meta-data for app key
    if (!application["meta-data"]) application["meta-data"] = [];

    const hasKey = application["meta-data"].some(
      (m) => m.$?.["android:name"] === "com.truecaller.android.sdk.PartnerKey"
    );

    if (!hasKey) {
      application["meta-data"].push({
        $: {
          "android:name": "com.truecaller.android.sdk.PartnerKey",
          "android:value": TRUECALLER_APP_KEY,
        },
      });
    }

    // Add Truecaller callback activity
    if (!application.activity) application.activity = [];

    const hasActivity = application.activity.some(
      (a) => a.$?.["android:name"] === "com.truecaller.android.sdk.TruecallerWebView"
    );

    if (!hasActivity) {
      application.activity.push({
        $: {
          "android:name": "com.truecaller.android.sdk.TruecallerWebView",
          "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
        },
      });
    }

    console.log("✅ Truecaller SDK configured in AndroidManifest.xml");
    return config;
  });
}

module.exports = withTruecaller;
