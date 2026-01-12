#!/bin/bash

# Prometheus Extension Packaging Script
# This script creates a clean ZIP file for Chrome Web Store submission

EXT_NAME="prometheus-extension-v$(grep -o '"version": "[^"]*' manifest.json | cut -d'"' -f4)"
ZIP_FILE="${EXT_NAME}.zip"

echo "📦 Packaging version $(grep -o '"version": "[^"]*' manifest.json | cut -d'"' -f4)..."

# Create a temporary directory for the build
mkdir -p dist

# List of files/folders to include
CP_ITEMS=(
  "manifest.json"
  "popup.html"
  "popup.js"
  "options.html"
  "options.js"
  "background.js"
  "content.js"
  "content-styles.css"
  "styles.css"
  "auth.js"
  "firebase.js"
  "gemini.js"
  "config.js"
  "html2canvas.min.js"
  "icons"
  "assets"
)

# Copy items to dist
for item in "${CP_ITEMS[@]}"; do
  if [ -e "$item" ]; then
    cp -r "$item" dist/
  else
    echo "⚠️ Warning: $item not found, skipping."
  fi
done

# Remove any .DS_Store or other garbage
find dist -name ".DS_Store" -delete

# Create the ZIP from the dist folder
cd dist
zip -r "../$ZIP_FILE" ./*
cd ..

# Cleanup
rm -rf dist

echo "✅ Created $ZIP_FILE"
echo "Ready for upload to Chrome Web Store Developer Dashboard."
