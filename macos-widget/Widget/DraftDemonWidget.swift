import WidgetKit
import SwiftUI

// Colors live in Shared/Theme.swift (compiled into both targets).

// MARK: - Timeline
struct DDEntry: TimelineEntry {
    let date: Date
    let data: WidgetResponse?
}

struct DDProvider: TimelineProvider {
    func placeholder(in context: Context) -> DDEntry { DDEntry(date: .now, data: nil) }

    func getSnapshot(in context: Context, completion: @escaping (DDEntry) -> Void) {
        Task { completion(DDEntry(date: .now, data: await DraftDemonAPI.fetch())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DDEntry>) -> Void) {
        Task {
            let data = await DraftDemonAPI.fetch()
            let entry = DDEntry(date: .now, data: data)
            // Refresh ~ every 15 min (the system throttles widget refreshes).
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - Pieces
struct InkubusBadge: View {
    let mood: String
    let size: CGFloat
    var body: some View {
        Image(mood == "angry" ? "InkubusAngry" : "InkubusNeutral")
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: size * 0.18, style: .continuous)
                    .stroke(mood == "angry" ? Color.ddBad : Color.ddAccent, lineWidth: 2)
            )
    }
}

struct GoalRing: View {
    let pct: Int
    let wrote: Int
    let goal: Int
    let deficit: Bool
    let diameter: CGFloat
    var body: some View {
        ZStack {
            Circle().stroke(Color.ddRing, lineWidth: diameter * 0.1)
            Circle()
                .trim(from: 0, to: CGFloat(min(max(pct, 0), 100)) / 100)
                .stroke(deficit ? Color.ddBad : Color.ddAccent,
                        style: StrokeStyle(lineWidth: diameter * 0.1, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(wrote)").font(.system(size: diameter * 0.26, weight: .bold)).foregroundStyle(Color.ddText)
                Text("/ \(goal)").font(.system(size: diameter * 0.13)).foregroundStyle(Color.ddText2)
            }
        }
        .frame(width: diameter, height: diameter)
    }
}

// MARK: - Views
struct DDWidgetView: View {
    @Environment(\.widgetFamily) var family
    var entry: DDEntry

    var body: some View {
        Group {
            if let r = entry.data, r.empty != true, let s = r.state {
                switch family {
                case .systemMedium: medium(r, s)
                default: small(r, s)
                }
            } else {
                offline
            }
        }
        .environment(\.colorScheme, .dark)   // our background is always dark
        .containerBackground(for: .widget) {
            LinearGradient(colors: [Color(hex: 0x33261d), Color(hex: 0x1f1813)],
                           startPoint: .top, endPoint: .bottom)
        }
        .widgetURL(URL(string: "draftdemon://open"))
    }

    // small ~ square
    func small(_ r: WidgetResponse, _ s: WidgetState) -> some View {
        VStack(spacing: 7) {
            HStack {
                InkubusBadge(mood: r.mood ?? "happy", size: 34)
                Spacer()
                Text("\(s.streak)🔥").font(.caption).bold().foregroundStyle(Color.ddFlame)
            }
            GoalRing(pct: s.dayPct, wrote: s.wroteToday, goal: s.dailyGoal, deficit: s.inDeficit, diameter: 74)
            Text(s.inDeficit ? "Write to recover" : s.phaseName)
                .font(.system(size: 10)).foregroundStyle(Color.ddText2).lineLimit(1)
        }
    }

    // medium ~ 2:1
    func medium(_ r: WidgetResponse, _ s: WidgetState) -> some View {
        HStack(spacing: 16) {
            VStack(spacing: 8) {
                InkubusBadge(mood: r.mood ?? "happy", size: 82)
                Text("\(s.streak)🔥 day\(s.streak == 1 ? "" : "s")")
                    .font(.caption).bold().foregroundStyle(Color.ddFlame)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(r.title ?? "Inkubus").font(.headline).foregroundStyle(Color.ddText).lineLimit(1)
                Text(s.inDeficit ? "⚠ Below your locked total — write to recover." : s.task)
                    .font(.caption).foregroundStyle(Color.ddText2).lineLimit(2)
                Spacer(minLength: 2)
                HStack(spacing: 12) {
                    GoalRing(pct: s.dayPct, wrote: s.wroteToday, goal: s.dailyGoal, deficit: s.inDeficit, diameter: 58)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("today's goal").font(.system(size: 10)).foregroundStyle(Color.ddText2)
                        Text("\(s.overallPct)% of book").font(.caption).bold().foregroundStyle(Color.ddText)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    var offline: some View {
        VStack(spacing: 8) {
            InkubusBadge(mood: "happy", size: 56)
            Text("Open Inkubus").font(.caption).bold().foregroundStyle(Color.ddText)
            Text("Start the app to sync").font(.system(size: 10)).foregroundStyle(Color.ddText2)
        }
    }
}

// MARK: - Widget
struct DraftDemonWidget: Widget {
    let kind = "DraftDemonWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DDProvider()) { entry in
            DDWidgetView(entry: entry)
        }
        .configurationDisplayName("Inkubus")
        .description("Today's writing goal, your streak, and Inkubus's mood.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
