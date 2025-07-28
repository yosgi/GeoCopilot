#!/bin/bash

# Publish script for GeoCopilot npm package

echo "🚀 Publishing GeoCopilot..."

# Build the library
echo "📦 Building library..."
npm run build:lib

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ dist directory not found!"
    exit 1
fi

# Check if we're logged into npm
npm whoami
if [ $? -ne 0 ]; then
    echo "❌ Not logged into npm. Please run 'npm login' first."
    exit 1
fi

# Publish to npm
echo "📤 Publishing to npm..."
npm publish

if [ $? -eq 0 ]; then
    echo "✅ Successfully published GeoCopilot to npm!"
    echo "📋 Package: https://www.npmjs.com/package/GeoCopilot"
else
    echo "❌ Failed to publish package!"
    exit 1
fi 