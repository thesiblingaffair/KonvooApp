/**
 * Expo Config Plugin: Enable 16KB page size support for Android
 * 
 * Required by Google Play Store for apps targeting Android 15+ (API 35).
 * Adds android.support16KBPages=true to gradle.properties and sets
 * extractNativeLibs=false in AndroidManifest.xml.
 */
const { withDangerousMod, withAndroidManifest } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function with16KBPages(config) {
  // Step 1: Add gradle.properties flag
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const gradlePropsPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle.properties"
      );

      let contents = "";
      if (fs.existsSync(gradlePropsPath)) {
        contents = fs.readFileSync(gradlePropsPath, "utf-8");
      }

      // Add 16KB page support if not already present
      if (!contents.includes("android.support16KBPages")) {
        contents += "\n# Enable 16KB page size support (Play Store requirement)\nandroid.support16KBPages=true\n";
        fs.writeFileSync(gradlePropsPath, contents);
        console.log("✅ Added 16KB page size support to gradle.properties");
      }

      return config;
    },
  ]);

  // Step 2: Set extractNativeLibs=false in AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];

    if (application) {
      application.$["android:extractNativeLibs"] = "false";
      console.log("✅ Set extractNativeLibs=false in AndroidManifest.xml");
    }

    return config;
  });

  return config;
}

module.exports = with16KBPages;
