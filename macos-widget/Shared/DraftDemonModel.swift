import Foundation
import SwiftUI

// Shared Draft Demon colors — this file is compiled into BOTH the app and the
// widget targets, so the theme is available everywhere.
extension Color {
    init(hex: UInt) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255)
    }
    static let ddAccent = Color(hex: 0xff7a18)
    static let ddBad    = Color(hex: 0xe5331b)
    static let ddRing   = Color(hex: 0x5a4636)   // lighter track so the ring reads
    static let ddFlame  = Color(hex: 0xffab40)
    static let ddText   = Color(hex: 0xf4ece4)   // explicit light text (don't rely on .primary)
    static let ddText2  = Color(hex: 0xc7b6a8)   // light warm secondary
}

// Mirrors the JSON returned by the Draft Demon backend's GET /api/widget.
// JSONDecoder uses .convertFromSnakeCase, so daily_goal -> dailyGoal etc.

struct WidgetResponse: Codable {
    let empty: Bool?
    let title: String?
    let mood: String?          // "happy" | "angry"
    let state: WidgetState?
}

struct WidgetState: Codable {
    let dailyGoal: Int
    let wroteToday: Int
    let dayPct: Int
    let overallPct: Int
    let streak: Int
    let task: String
    let phaseName: String
    let inDeficit: Bool
}

enum DraftDemonAPI {
    static let endpoint = URL(string: "http://localhost:8741/api/widget")!

    /// Fetches the current widget snapshot from the local backend.
    /// Returns nil if the backend (the Draft Demon app) isn't running.
    static func fetch() async -> WidgetResponse? {
        var req = URLRequest(url: endpoint)
        req.timeoutInterval = 8
        req.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let dec = JSONDecoder()
            dec.keyDecodingStrategy = .convertFromSnakeCase
            return try dec.decode(WidgetResponse.self, from: data)
        } catch {
            return nil
        }
    }
}
