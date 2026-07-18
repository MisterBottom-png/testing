from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


screen = Path("drum-kit-android/feature-kit/src/main/java/com/vitautas/drumkit/feature/kit/DrumKitScreen.kt")
replace_once(
    screen,
    "import androidx.compose.foundation.layout.Row\n",
    "import androidx.compose.foundation.layout.Row\n"
    "import androidx.compose.foundation.layout.WindowInsets\n"
    "import androidx.compose.foundation.layout.WindowInsetsSides\n",
    "window inset imports",
)
replace_once(
    screen,
    "import androidx.compose.foundation.layout.padding\n",
    "import androidx.compose.foundation.layout.only\n"
    "import androidx.compose.foundation.layout.padding\n"
    "import androidx.compose.foundation.layout.safeDrawing\n"
    "import androidx.compose.foundation.layout.windowInsetsPadding\n",
    "window inset extension imports",
)
replace_once(
    screen,
    "    val recorder = remember { PerformanceRecorder() }\n",
    "    val recorder = remember { PerformanceRecorder() }\n"
    "    val topSafeInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)\n"
    "    val bottomSafeInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal)\n",
    "safe inset definitions",
)
replace_once(
    screen,
    "                .align(Alignment.TopStart)\n                .padding(start = 8.dp, top = 6.dp),",
    "                .align(Alignment.TopStart)\n"
    "                .windowInsetsPadding(topSafeInsets)\n"
    "                .padding(start = 8.dp, top = 6.dp),",
    "kit selector insets",
)
replace_once(
    screen,
    "                .align(Alignment.TopEnd)\n                .padding(end = 8.dp, top = 6.dp),",
    "                .align(Alignment.TopEnd)\n"
    "                .windowInsetsPadding(topSafeInsets)\n"
    "                .padding(end = 8.dp, top = 6.dp),",
    "record mixer insets",
)
replace_once(
    screen,
    "                    .align(Alignment.TopEnd)\n                    .padding(end = 8.dp, top = 64.dp)",
    "                    .align(Alignment.TopEnd)\n"
    "                    .windowInsetsPadding(topSafeInsets)\n"
    "                    .padding(end = 8.dp, top = 64.dp)",
    "settings panel insets",
)
replace_once(
    screen,
    "                    .align(Alignment.BottomCenter)\n                    .background(Color(0xcc000000), MaterialTheme.shapes.small)",
    "                    .align(Alignment.BottomCenter)\n"
    "                    .windowInsetsPadding(bottomSafeInsets)\n"
    "                    .background(Color(0xcc000000), MaterialTheme.shapes.small)",
    "audio unavailable insets",
)
replace_once(
    screen,
    "                    .align(Alignment.BottomCenter)\n                    .background(Color(0x99000000), MaterialTheme.shapes.small)",
    "                    .align(Alignment.BottomCenter)\n"
    "                    .windowInsetsPadding(bottomSafeInsets)\n"
    "                    .background(Color(0x99000000), MaterialTheme.shapes.small)",
    "diagnostics insets",
)

agents = Path("drum-kit-android/AGENTS.md")
replace_once(
    agents,
    "- Landscape-only immersive activity",
    "- Immersive, resizable activity optimized for landscape and adaptive to current orientation and window size",
    "AGENTS activity status",
)
replace_once(agents, "- Android SDK 37", "- Android SDK 37 from the Android 17 preview channel", "AGENTS SDK channel")
replace_once(agents, "- Kotlin 2.4.x through Android Gradle Plugin built-in Kotlin support", "- Kotlin 2.4.10 through Android Gradle Plugin built-in Kotlin support", "AGENTS Kotlin version")
replace_once(
    agents,
    "The instrument surface should occupy approximately 90% of the usable landscape screen. Controls must not cover playable instruments.",
    "The instrument surface should occupy approximately 90% of the usable window and remain optimized for landscape. Controls must not cover playable instruments.",
    "AGENTS adaptive window guidance",
)
replace_once(
    agents,
    "- Safe-area and display-cutout handling in immersive landscape mode",
    "- Safe-area and display-cutout handling in immersive edge-to-edge mode",
    "AGENTS safe-area guidance",
)

mapping = Path("drum-kit-android/docs/source-mapping.md")
replace_once(
    mapping,
    "- Fullscreen landscape presentation",
    "- Immersive resizable presentation optimized for landscape",
    "source mapping presentation",
)
replace_once(
    mapping,
    "- Compact kit selector in the upper-left corner",
    "- Compact kit selector in the upper-left safe drawing area",
    "source mapping top-left safe area",
)
replace_once(
    mapping,
    "- Compact recording and mixer controls in the upper-right corner",
    "- Compact recording and mixer controls in the upper-right safe drawing area",
    "source mapping top-right safe area",
)

print("Final modernization cleanup applied")
