# Antimatter Dimensions Mobile

This project builds an installable Android APK from the upstream MIT-licensed Antimatter Dimensions source code.

Upstream repository: `IvarK/AntimatterDimensionsSourceCode`  
Pinned upstream commit: `8ae221fcb07db667b3d04114c2b977175966611d`

The APK contains the game assets locally and runs them through Android's secure WebView asset origin. No server is required after installation.

## Mobile changes

- Fullscreen Android shell without browser controls
- Bottom navigation replacing the desktop sidebar
- Touch-sized controls and purchase buttons
- Stacked dimension cards on narrow screens
- Scrollable active subtab bar
- Responsive modals and grids
- Persistent local game storage
- Save import through the Android file picker
- Save export through Android's document picker
- Portrait-first layout with landscape support

## Building

The GitHub Actions workflow clones the pinned upstream source, runs the official release build, injects the mobile stylesheet, bundles the result into the Android project, and creates a debug-signed installable APK.

The upstream game and assets remain licensed under the upstream MIT license. This repository only adds the Android packaging and mobile layout layer.
