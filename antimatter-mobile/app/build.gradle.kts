plugins {
    id("com.android.application")
}

android {
    namespace = "com.vitautas.antimattermobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.vitautas.antimattermobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
