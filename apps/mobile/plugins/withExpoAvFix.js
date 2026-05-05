/**
 * Fix expo-av CMake build issue
 * 
 * expo-av@14.0 references ReactAndroid::reactnativejni but doesn't
 * call find_package(ReactAndroid) first. This plugin patches the
 * CMakeLists.txt to add the missing find_package call.
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withExpoAvFix(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const cmakePath = path.join(
        config.modRequest.projectRoot,
        "node_modules",
        "expo-av",
        "android",
        "CMakeLists.txt"
      );

      if (fs.existsSync(cmakePath)) {
        let content = fs.readFileSync(cmakePath, "utf-8");

        // Only patch if find_package(ReactAndroid) is missing
        if (!content.includes("find_package(ReactAndroid")) {
          // Add find_package before the add_library call that references ReactAndroid
          content = content.replace(
            /project\(([^)]+)\)/,
            `project($1)\n\nfind_package(ReactAndroid REQUIRED CONFIG)`
          );
          fs.writeFileSync(cmakePath, content);
          console.log("✅ Patched expo-av CMakeLists.txt with find_package(ReactAndroid)");
        } else {
          console.log("✅ expo-av CMakeLists.txt already has find_package(ReactAndroid)");
        }
      } else {
        console.log("⚠️ expo-av CMakeLists.txt not found — skipping patch");
      }

      return config;
    },
  ]);
};
