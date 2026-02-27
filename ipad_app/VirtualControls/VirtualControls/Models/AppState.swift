import Foundation
import SwiftUI
import Combine

final class AppState: ObservableObject {
    @Published var baseURLString: String = "http://192.168.1.235:5000"
    @Published var pin: String = ""
    @Published var activeProfileName: String?
    @Published var profile: Profile?

    @Published var throttleValue: Double = 0
    @Published var flapsValue: Double = 0
    @Published var spoilersValue: Double = 0
    @Published var brakesValue: Double = 0
    @Published var rudderValue: Double = 0.5
    @Published var joystickX: Double = 0.5
    @Published var joystickY: Double = 0.5

    @Published var tdTargetDate: Date?
    @Published var tdFired: Bool = false

    @Published var isConnected: Bool = false
    @Published var lastError: String?

    var hasConfiguredBackend: Bool {
        isConnected
    }
}

