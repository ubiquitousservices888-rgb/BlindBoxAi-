plugins {
    id("com.android.application")
}

android {
    namespace = "com.ubiquitous.blindboxwallpaper"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ubiquitous.blindboxwallpaper"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
    }
}
