import SwiftUI
import WidgetKit

@main
struct DraftDemonCompanionApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    @State private var status = "—"

    var body: some View {
        VStack(spacing: 16) {
            Image("InkubusNeutral").resizable().scaledToFit()
                .frame(width: 120, height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.ddAccent, lineWidth: 2))

            Text("Inkubus Widget").font(.title2).bold()
            Text("Add the widget from the desktop/Notification Center gallery.\nKeep the Inkubus app running so the widget can sync.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .font(.callout)

            Button("Reload widget now") {
                WidgetCenter.shared.reloadAllTimelines()
            }
            .buttonStyle(.borderedProminent)
            .tint(.ddAccent)

            Button("Test backend connection") {
                Task {
                    let r = await DraftDemonAPI.fetch()
                    status = r == nil ? "❌ Backend not reachable (is Inkubus running?)"
                                       : "✅ Connected — \(r?.title ?? "project") loaded"
                }
            }
            Text(status).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(32)
        .frame(width: 360)
    }
}
