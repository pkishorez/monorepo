#if canImport(ActivityKit)
import ActivityKit
import Foundation

/// A Live Activity the page starts: a fixed title, and a status line and
/// progress it updates. The plugin starts it and the app's widget extension
/// draws it; iOS matches the two by this type, so both link this one
/// definition.
@available(iOS 16.1, *)
public struct LiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var status: String
        /// 0 to 1, or nil for no progress bar.
        public var progress: Double?

        public init(status: String, progress: Double?) {
            self.status = status
            self.progress = progress
        }
    }

    public var title: String

    public init(title: String) {
        self.title = title
    }
}
#endif
