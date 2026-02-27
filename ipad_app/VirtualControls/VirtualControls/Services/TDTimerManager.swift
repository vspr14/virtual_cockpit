import Foundation
import Combine
import UserNotifications
import AudioToolbox

@MainActor
final class TDTimerManager: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published var utcNow: Date = Date()
    @Published var targetDate: Date?
    @Published var fired: Bool = false
    @Published var isActive: Bool = false

    private var timerCancellable: AnyCancellable?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        requestNotificationPermission()
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if granted {
                print("Notification permission granted")
            }
        }
    }

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

    func toggleTimer(targetTime: Date) {
        if isActive {
            // Turn off
            isActive = false
            targetDate = nil
            fired = false
            cancelNotification()
            persist()
        } else {
            // Turn on
            isActive = true
            targetDate = targetTime
            fired = false
            scheduleNotification(for: targetTime)
            persist()
        }
    }

    private func scheduleNotification(for date: Date) {
        let content = UNMutableNotificationContent()
        content.title = "Virtual Cockpit"
        content.body = "Top of Descent Reached!"
        content.sound = UNNotificationSound.default

        // We use an absolute date matching the target
        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let request = UNNotificationRequest(identifier: "td_alarm", content: content, trigger: trigger)
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Error scheduling notification: \(error)")
            }
        }
    }

    private func cancelNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["td_alarm"])
    }

    private func checkFire() {
        guard let target = targetDate, isActive, fired == false else {
            return
        }
        if utcNow >= target {
            fired = true
            isActive = false
            triggerAudioAlarm()
            persist()
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
                self?.fired = false
                self?.persist()
            }
        }
    }

    private func triggerAudioAlarm() {
        let content = UNMutableNotificationContent()
        content.title = "Top of Descent Reached!"
        content.body = "It is time to descend."
        content.sound = UNNotificationSound.default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(identifier: "td_alarm_now", content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
        
        // Play an explicit loud system alarm sound immediately for the foreground case
        AudioServicesPlayAlertSound(1005)
    }

    func restore() {
        if let saved = StatePersistence.shared.loadTDState() {
            targetDate = saved.targetDate
            fired = saved.fired
            // If we restored a target date that hasn't fired yet, consider it active
            if let target = targetDate, !fired, target > Date() {
                isActive = true
            } else if fired {
                isActive = false
            }
        }
    }

    private func persist() {
        if let target = targetDate {
            let state = SavedTDState(targetDate: target, fired: fired)
            StatePersistence.shared.saveTDState(state)
        } else {
            // Default empty state to clear it out
            let state = SavedTDState(targetDate: Date(), fired: true)
            StatePersistence.shared.saveTDState(state)
        }
    }
}


