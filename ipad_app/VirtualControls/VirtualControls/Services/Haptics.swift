import CoreHaptics
import UIKit

final class Haptics {
    static let shared = Haptics()

    private let impactGenerator = UIImpactFeedbackGenerator(style: .light)

    func tap() {
        impactGenerator.impactOccurred()
    }

    func detent() {
        impactGenerator.impactOccurred(intensity: 1.0)
    }
}

