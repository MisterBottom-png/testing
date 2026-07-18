plugins {
    alias(libs.plugins.kotlin.jvm)
}

kotlin {
    jvmToolchain(17)
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

sourceSets {
    main {
        kotlin.srcDir("src/main/java")
    }
    test {
        kotlin.srcDir("src/test/java")
    }
}

dependencies {
    testImplementation(libs.junit)
}
