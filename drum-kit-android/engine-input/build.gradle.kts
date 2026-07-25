plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "com.vitautas.drumkit.input"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = true
    }
}

kotlin {
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

dependencies {
    implementation(project(":core-model"))
    implementation(libs.androidx.annotation)

    testImplementation(libs.junit)
}
