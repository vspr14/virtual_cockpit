import Foundation
import Combine

@MainActor
final class TDTimerManager: ObservableObject {
    @Published var utcNow: Date = Date()
    @Published var targetDate: Date?
    @Published var fired: Bool = false

    private var timerCancellable: AnyCancellable?

    func start() {
        timerCancellable?.cancel()
        timerCancellable = Timer
            .publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] date in
                guard let self = self else {
                    return
                }
                self.utcNow = date
                self.checkFire()
            }
    }

    func stop() {
        timerCancellable?.cancel()
        timerCancellable = nil
    }

    func setTarget(date: Date) {
        targetDate = date
        fired = false
        persist()
    }

    private func checkFire() {
        guard let target = targetDate, fired == false else {
            return
        }
        if utcNow >= target {
            fired = true
            persist()
        }
    }

    func restore() {
        if let saved = StatePersistence.shared.loadTDState() {
            targetDate = saved.targetDate
            fired = saved.fired
        }
    }

    private func persist() {
        if let target = targetDate {
            let state = SavedTDState(targetDate: target, fired: fired)
            StatePersistence.shared.saveTDState(state)
        }
    }
}

