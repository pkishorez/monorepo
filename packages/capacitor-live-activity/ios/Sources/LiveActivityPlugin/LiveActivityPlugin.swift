import Foundation
import UIKit
import Capacitor
import ActivityKit
import LiveActivityModel

/// The page's Live Activities: start, update, end and list them. iOS 16.2 and
/// later; below that, isSupported says no and the rest reject.
///
/// The app's Info.plist needs NSSupportsLiveActivities, and the app needs a
/// widget extension that draws LiveActivityAttributes, or iOS starts the
/// activity and shows nothing.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        // A line per running activity when the app leaves the screen, which
        // is when the activity moves to the Dynamic Island: CI reads it.
        NotificationCenter.default.addObserver(
            self, selector: #selector(didEnterBackground),
            name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities need iOS 16.2 or later.", "UNSUPPORTED")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are turned off for this app.", "UNSUPPORTED")
            return
        }
        guard let title = call.getString("title"), let status = call.getString("status") else {
            call.reject("start needs a title and a status.")
            return
        }
        let state = LiveActivityAttributes.ContentState(status: status, progress: progress(call))
        do {
            let activity = try Activity.request(
                attributes: LiveActivityAttributes(title: title),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil)
            CAPLog.print("[live-activity] started \(activity.id) \(activity.activityState)")
            call.resolve(["id": activity.id])
        } catch {
            call.reject("iOS refused the Live Activity: \(error.localizedDescription)", "REFUSED", error)
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities need iOS 16.2 or later.", "UNSUPPORTED")
            return
        }
        guard let id = call.getString("id"), let status = call.getString("status") else {
            call.reject("update needs an id and a status.")
            return
        }
        guard let activity = Activity<LiveActivityAttributes>.activities.first(where: { $0.id == id }) else {
            call.reject("No Live Activity has the id \(id).", "NOT_FOUND")
            return
        }
        let state = LiveActivityAttributes.ContentState(status: status, progress: progress(call))
        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.reject("Live Activities need iOS 16.2 or later.", "UNSUPPORTED")
            return
        }
        guard let id = call.getString("id") else {
            call.reject("end needs an id.")
            return
        }
        // Ending one that is gone already is not an error: it has ended.
        guard let activity = Activity<LiveActivityAttributes>.activities.first(where: { $0.id == id }) else {
            call.resolve()
            return
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            call.resolve()
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["activities": []])
            return
        }
        call.resolve(["activities": Activity<LiveActivityAttributes>.activities.map { activity in
            ["id": activity.id, "state": "\(activity.activityState)"]
        }])
    }

    @objc private func didEnterBackground() {
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<LiveActivityAttributes>.activities {
            CAPLog.print("[live-activity] background \(activity.id) \(activity.activityState)")
        }
    }

    /// The call's progress, kept within 0 to 1, or nil when it has none.
    private func progress(_ call: CAPPluginCall) -> Double? {
        call.getDouble("progress").map { min(max($0, 0), 1) }
    }
}
