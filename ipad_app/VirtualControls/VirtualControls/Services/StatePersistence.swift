import Foundation

struct SavedControlState: Codable {
    let profile: String
    let flaps: Double
    let throttle: Double
    let spoilers: Double
    let brakes: Double
    let rudder: Double
}

struct SavedTDState: Codable {
    let targetDate: Date
    let fired: Bool
}

final class StatePersistence {
    static let shared = StatePersistence()

    private let controlsKey = "ipadjoy_controls_state"
    private let tdKey = "ipadjoy_td_state"

    func saveControls(_ state: SavedControlState) {
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: controlsKey)
        }
    }

    func loadControls() -> SavedControlState? {
        guard let data = UserDefaults.standard.data(forKey: controlsKey) else {
            return nil
        }
        return try? JSONDecoder().decode(SavedControlState.self, from: data)
    }

    func saveTDState(_ state: SavedTDState) {
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: tdKey)
        }
    }

    func loadTDState() -> SavedTDState? {
        guard let data = UserDefaults.standard.data(forKey: tdKey) else {
            return nil
        }
        return try? JSONDecoder().decode(SavedTDState.self, from: data)
    }
}

