/**
 * Expo Config Plugin: Copy adi-registration.properties to Android assets
 * 
 * Required for Google Play Console developer verification.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withAdiRegistration(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets"
      );

      // Ensure assets directory exists
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      // Copy the registration file
      const src = path.join(projectRoot, "assets", "adi-registration.properties");
      const dest = path.join(assetsDir, "adi-registration.properties");

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log("✅ Copied adi-registration.properties to Android assets");
      } else {
        console.warn("⚠️ adi-registration.properties not found in assets/");
      }

      return config;
    },
  ]);
}

module.exports = withAdiRegistration;
