val configuredAbis = providers.gradleProperty("drumKitAbis")
    .map { value ->
        value.split(',')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .ifEmpty { error("drumKitAbis must contain at least one ABI") }
    }
    .orElse(listOf("arm64-v8a", "armeabi-v7a", "x86_64"))

val configuredCmakeVersion = providers.gradleProperty("drumKitCmakeVersion")
    .orElse("3.22.1")

plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "com.vitautas.drumkit.audio"
    compileSdk = 37
    buildToolsVersion = "37.0.0"
    ndkVersion = "29.0.14206865"

    defaultConfig {
        minSdk = 26
        externalNativeBuild {
            cmake {
                arguments += "-DANDROID_STL=c++_shared"
                cppFlags += listOf("-std=c++20", "-Wall", "-Wextra", "-Werror")
            }
        }
        ndk {
            abiFilters += configuredAbis.get()
        }
    }

    androidResources {
        noCompress += "pcm"
    }

    buildFeatures {
        prefab = true
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = configuredCmakeVersion.get()
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = true
        // The normal ABI set includes x86_64. CI may intentionally narrow a downloadable debug APK to arm64.
        disable += "ChromeOsAbiSupport"
    }
}

kotlin {
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

dependencies {
    implementation(project(":core-model"))
    implementation(libs.oboe)

    testImplementation(libs.junit)
}
