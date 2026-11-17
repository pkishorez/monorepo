// swift-tools-version: 5.9
import PackageDescription

// `cap sync` names this package and its plugin product after the npm name,
// @kestack/capacitor-live-activity: KestackCapacitorLiveActivity.
let package = Package(
    name: "KestackCapacitorLiveActivity",
    platforms: [.iOS(.v15)],
    products: [
        // The plugin, which the app links through CapApp-SPM.
        .library(
            name: "KestackCapacitorLiveActivity",
            targets: ["LiveActivityPlugin"]),
        // The activity's one definition, which the app's widget extension
        // links on its own: no Capacitor, so it is safe in an extension.
        .library(
            name: "LiveActivityModel",
            targets: ["LiveActivityModel"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "LiveActivityModel",
            path: "ios/Sources/LiveActivityModel"),
        .target(
            name: "LiveActivityPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "LiveActivityModel"
            ],
            path: "ios/Sources/LiveActivityPlugin")
    ]
)
