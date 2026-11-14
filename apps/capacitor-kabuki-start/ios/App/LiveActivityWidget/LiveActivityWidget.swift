import ActivityKit
import LiveActivityModel
import SwiftUI
import WidgetKit

// Draws the Live Activities the page starts through the LiveActivity plugin:
// on the Lock Screen and in the Dynamic Island. Apple runs this in its own
// process, so it links only LiveActivityModel, never Capacitor.

@main
struct LiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        LiveActivityWidget()
    }
}

struct LiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveActivityAttributes.self) { context in
            // The Lock Screen, and the banner on a phone without the island.
            VStack(alignment: .leading, spacing: 6) {
                Label(context.attributes.title, systemImage: "theatermasks.fill")
                    .font(.headline)
                Text(context.state.status)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let progress = context.state.progress {
                    ProgressView(value: progress)
                        .tint(.orange)
                }
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "theatermasks.fill")
                        .foregroundStyle(.orange)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let progress = context.state.progress {
                        Text(progress, format: .percent.precision(.fractionLength(0)))
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title)
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.status)
                            .font(.subheadline)
                        if let progress = context.state.progress {
                            ProgressView(value: progress)
                                .tint(.orange)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "theatermasks.fill")
                    .foregroundStyle(.orange)
            } compactTrailing: {
                if let progress = context.state.progress {
                    Text(progress, format: .percent.precision(.fractionLength(0)))
                        .foregroundStyle(.orange)
                } else {
                    Text(context.attributes.title.prefix(1))
                }
            } minimal: {
                if let progress = context.state.progress {
                    Gauge(value: progress) {
                        Image(systemName: "theatermasks.fill")
                    }
                    .gaugeStyle(.accessoryCircularCapacity)
                    .tint(.orange)
                } else {
                    Image(systemName: "theatermasks.fill")
                        .foregroundStyle(.orange)
                }
            }
        }
    }
}
