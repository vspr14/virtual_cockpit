import Foundation
import SwiftUI

final class AppState: ObservableObject {
    @Published var baseURLString: String
    @Published var pin: String
    @Published var activeProfileName: String?
    @Published var profile: Profile?

    @Published var throttleValue: Double
    @Published var flapsValue: Double
    @Published var spoilersValue: Double
    @Published var brakesValue: Double
    @Published var rudderValue: Double
    @Published var joystickX: Double
    @Published var joystickY: Double

    @Published var tdTargetDate: Date?
    @Published var tdFired: Bool

    @Published var isConnected: Bool
    @Published var lastError: String?

    init() {
        baseURLString = ""
        pin = ""
        activeProfileName = nil
        profile = nil
        throttleValue = 0
        flapsValue = 0
        spoilersValue = 0
        brakesValue = 0
        rudderValue = 0.5
        joystickX = 0.5
        joystickY = 0.5
        tdTargetDate = nil
        tdFired = false
        isConnected = false
        lastError = nil
    }

    var hasConfiguredBackend: Bool {
        !baseURLString.isEmpty && !pin.isEmpty
    }
}

