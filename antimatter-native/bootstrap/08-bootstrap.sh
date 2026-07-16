#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/theme"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/theme/AntimatterTheme.kt" <<'__AD_FILE_8_0__'
package com.vitautas.antimatter.nativegame.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.vitautas.antimatter.core.model.ProgressLayer

@Immutable
data class LayerPalette(
    val background: Color,
    val backgroundDeep: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val accent: Color,
    val accentSecondary: Color,
    val glow: Color,
    val danger: Color,
    val success: Color,
)

fun paletteFor(layer: ProgressLayer): LayerPalette = when (layer) {
    ProgressLayer.ANTIMATTER -> LayerPalette(
        background = Color(0xFF060812),
        backgroundDeep = Color(0xFF010208),
        surface = Color(0xD9141726),
        surfaceRaised = Color(0xEE1B2033),
        accent = Color(0xFF86E6FF),
        accentSecondary = Color(0xFF8A92FF),
        glow = Color(0x6686E6FF),
        danger = Color(0xFFFF6B84),
        success = Color(0xFF74F0B2),
    )
    ProgressLayer.INFINITY -> LayerPalette(
        background = Color(0xFF07110C),
        backgroundDeep = Color(0xFF010604),
        surface = Color(0xD913241C),
        surfaceRaised = Color(0xEE183126),
        accent = Color(0xFF86FFB2),
        accentSecondary = Color(0xFF52D7A2),
        glow = Color(0x6686FFB2),
        danger = Color(0xFFFF7389),
        success = Color(0xFFA8FFD0),
    )
    ProgressLayer.ETERNITY -> LayerPalette(
        background = Color(0xFF120819),
        backgroundDeep = Color(0xFF050107),
        surface = Color(0xD9251630),
        surfaceRaised = Color(0xEE321D3F),
        accent = Color(0xFFE59AFF),
        accentSecondary = Color(0xFFB880FF),
        glow = Color(0x66E59AFF),
        danger = Color(0xFFFF729E),
        success = Color(0xFFC4FFDA),
    )
    ProgressLayer.REALITY -> LayerPalette(
        background = Color(0xFF151006),
        backgroundDeep = Color(0xFF050300),
        surface = Color(0xD92A2415),
        surfaceRaised = Color(0xEE39301A),
        accent = Color(0xFFFFD36D),
        accentSecondary = Color(0xFFFF9E6D),
        glow = Color(0x66FFD36D),
        danger = Color(0xFFFF735F),
        success = Color(0xFFBDFF9D),
    )
    ProgressLayer.CELESTIALS -> LayerPalette(
        background = Color(0xFF100B16),
        backgroundDeep = Color(0xFF030104),
        surface = Color(0xD9231930),
        surfaceRaised = Color(0xEE30213F),
        accent = Color(0xFFFFB8F2),
        accentSecondary = Color(0xFF8EEBFF),
        glow = Color(0x66FFB8F2),
        danger = Color(0xFFFF6D91),
        success = Color(0xFFA8FFD5),
    )
}

private val GameTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Black,
        fontSize = 40.sp,
        lineHeight = 44.sp,
        letterSpacing = (-1.2).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 23.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.2.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.3.sp,
    ),
)

@Composable
fun AntimatterTheme(
    layer: ProgressLayer,
    content: @Composable (LayerPalette) -> Unit,
) {
    val palette = paletteFor(layer)
    val scheme: ColorScheme = darkColorScheme(
        primary = palette.accent,
        onPrimary = Color(0xFF071018),
        secondary = palette.accentSecondary,
        onSecondary = Color(0xFF080A12),
        background = palette.background,
        onBackground = Color(0xFFF4F6FF),
        surface = palette.surface,
        onSurface = Color(0xFFF4F6FF),
        surfaceVariant = palette.surfaceRaised,
        onSurfaceVariant = Color(0xFFBEC5DA),
        error = palette.danger,
        onError = Color(0xFF240007),
        outline = Color(0xFF3C455C),
    )
    MaterialTheme(colorScheme = scheme, typography = GameTypography) { content(palette) }
}

__AD_FILE_8_0__

mkdir -p "$ROOT/app/src/main/res/drawable"
cat > "$ROOT/app/src/main/res/drawable/ic_launcher_foreground.xml" <<'__AD_FILE_8_1__'
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#07101F" android:pathData="M0,0h108v108h-108z" />
    <path android:fillColor="#5BE7FF" android:pathData="M54,13a41,41 0,1 0,0 82a41,41 0,1 0,0 -82M54,24a30,30 0,1 1,0 60a30,30 0,1 1,0 -60" />
    <path android:fillColor="#D990FF" android:pathData="M54,31l17,40h-9l-4,-10h-16l-4,10h-9zM50,53h8l-4,-11z" />
</vector>

__AD_FILE_8_1__

mkdir -p "$ROOT/app/src/main/res/values"
cat > "$ROOT/app/src/main/res/values/colors.xml" <<'__AD_FILE_8_2__'
<resources>
    <color name="transparent">#00000000</color>
</resources>

__AD_FILE_8_2__

mkdir -p "$ROOT/app/src/main/res/values"
cat > "$ROOT/app/src/main/res/values/strings.xml" <<'__AD_FILE_8_3__'
<resources>
    <string name="app_name">Antimatter Dimensions</string>
</resources>

__AD_FILE_8_3__

mkdir -p "$ROOT/app/src/main/res/values"
cat > "$ROOT/app/src/main/res/values/themes.xml" <<'__AD_FILE_8_4__'
<resources>
    <style name="Theme.AntimatterNative" parent="android:style/Theme.Material.NoActionBar">
        <item name="android:windowActionModeOverlay">true</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowFullscreen">false</item>
        <item name="android:windowBackground">#05070F</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">#05070F</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
        <item name="android:fontFamily">sans</item>
    </style>

    <style name="Theme.AntimatterNative.Starting" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#05070F</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/Theme.AntimatterNative</item>
    </style>
</resources>

__AD_FILE_8_4__

mkdir -p "$ROOT/app/src/main/res/xml"
cat > "$ROOT/app/src/main/res/xml/backup_rules.xml" <<'__AD_FILE_8_5__'
<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <include domain="sharedpref" path="." />
    <include domain="database" path="." />
</full-backup-content>

__AD_FILE_8_5__

mkdir -p "$ROOT/app/src/main/res/xml"
cat > "$ROOT/app/src/main/res/xml/data_extraction_rules.xml" <<'__AD_FILE_8_6__'
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <include domain="sharedpref" path="." />
        <include domain="database" path="." />
    </cloud-backup>
    <device-transfer>
        <include domain="sharedpref" path="." />
        <include domain="database" path="." />
    </device-transfer>
</data-extraction-rules>

__AD_FILE_8_6__

mkdir -p "$ROOT/."
cat > "$ROOT/build.gradle.kts" <<'__AD_FILE_8_7__'
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("com.android.library") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}

__AD_FILE_8_7__

mkdir -p "$ROOT/core/model"
cat > "$ROOT/core/model/build.gradle.kts" <<'__AD_FILE_8_8__'
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vitautas.antimatter.core.model"
    compileSdk = 35

    defaultConfig { minSdk = 26 }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    testImplementation(kotlin("test"))
}

__AD_FILE_8_8__

mkdir -p "$ROOT/core/model/src/main"
cat > "$ROOT/core/model/src/main/AndroidManifest.xml" <<'__AD_FILE_8_9__'
<manifest />

__AD_FILE_8_9__
