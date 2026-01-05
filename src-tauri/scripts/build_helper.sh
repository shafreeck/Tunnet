#!/bin/bash
set -e

# Navigate to src-tauri
cd src-tauri

# Determine target architecture
TARGET_ARCH=$(uname -m)
if [ "$TARGET_ARCH" == "arm64" ]; then
    TARGET="aarch64-apple-darwin"
else
    TARGET="x86_64-apple-darwin"
fi

echo "Building tunnet-helper for $TARGET..."

# Ensure resources directory exists
mkdir -p resources

# Create a placeholder file to satisfy tauri_build check (chicken-and-egg problem)
if [ ! -f "resources/tunnet-helper" ]; then
    touch "resources/tunnet-helper"
fi

# Build the helper binary
cargo build --bin tunnet-helper --release --target $TARGET

# Ensure resources directory exists
mkdir -p resources

# Copy the binary to resources/tunnet-helper
# Note: The installer expects the binary name to be 'tunnet-helper'
cp "target/$TARGET/release/tunnet-helper" "resources/tunnet-helper"
chmod +x "resources/tunnet-helper"

echo "Successfully built and copied tunnet-helper to resources/tunnet-helper"
