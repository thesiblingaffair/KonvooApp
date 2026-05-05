#!/usr/bin/env node
/**
 * patches/fix-expo-av.js
 * 
 * Fixes expo-av@14.0 CMake build failure on Expo SDK 52 + RN 0.76.
 * 
 * Instead of trying to fix the broken CMake config, we replace the
 * entire CMakeLists.txt with a minimal valid file that skips the
 * C++ build. Audio recording and playback are 100% Kotlin/Java.
 */
const fs = require("fs");
const path = require("path");

const cmakePath = path.join(
  __dirname, "..", "node_modules", "expo-av", "android", "CMakeLists.txt"
);

if (!fs.existsSync(cmakePath)) {
  console.log("⚠️  expo-av CMakeLists.txt not found — skipping patch");
  process.exit(0);
}

const content = fs.readFileSync(cmakePath, "utf-8");
if (content.includes("# PATCHED by fix-expo-av.js")) {
  console.log("✅ expo-av CMakeLists.txt already patched");
  process.exit(0);
}

// Replace with minimal valid CMakeLists.txt — no C++ build, no ReactAndroid dependency
fs.writeFileSync(cmakePath, `# PATCHED by fix-expo-av.js — skips broken C++ build
# Audio.Recording and Audio.Sound are Kotlin/Java — no native code needed
cmake_minimum_required(VERSION 3.4.1)
`);

console.log("✅ Patched expo-av CMakeLists.txt — replaced with minimal (audio works without C++)");
