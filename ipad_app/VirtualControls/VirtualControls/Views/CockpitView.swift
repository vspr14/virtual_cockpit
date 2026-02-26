import SwiftUI

struct CockpitView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var backend: BackendService

    let profileName: String

    @State private var localProfile: Profile?
    @State private var isLoading = false
    @State private var loadError: String?

    @State private var tdManager = TDTimerManager()
    @State private var fenixAutopilotOn = false
    @State private var persistenceTimer: Timer?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error = loadError {
                Text(error)
            } else {
                content
            }
        }
        .task {
            await loadProfileIfNeeded()
        }
        .onDisappear {
            persistenceTimer?.invalidate()
            persistenceTimer = nil
            saveControlsState()
        }
    }

    private var content: some View {
        let profile = localProfile ?? appState.profile

        return NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 16) {
                        HStack(alignment: .top, spacing: 16) {
                            VStack(spacing: 16) {
                                tdSection
                                joystickSection
                            }
                            VStack(spacing: 16) {
                                flapsSpoilersBrakesSection(profile: profile)
                                gearParkingAutopilotSection(profile: profile)
                                camerasSection(profile: profile)
                            }
                            VStack(spacing: 16) {
                                throttleSection(profile: profile)
                            }
                        }
                        rudderSection
                    }
                    .padding()
                    .frame(minWidth: geometry.size.width)
                }
            }
            .toolbar {
                NavigationLink("OFP") {
                    OfpMetarView()
                }
            }
        }
    }

    private var tdSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("UTC")
            Text(tdManager.utcNow, style: .time)
                .monospacedDigit()
            TDInputView(tdManager: tdManager, profileName: profileName)
        }
    }

    private var joystickSection: some View {
        JoystickView(
            x: $appState.joystickX,
            y: $appState.joystickY
        ) { x, y in
            Task {
                await sendFlightControls(x: x, y: y)
            }
        }
        .frame(width: 260, height: 260)
    }

    private func flapsSpoilersBrakesSection(profile: Profile?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SliderWithLabel(
                title: "Flaps",
                value: $appState.flapsValue,
                detents: profile?.ui?.flap_detents
            ) { snapped in
                Task {
                    await sendAxis(type: "flaps_axis", value: snapped)
                }
            }
            SliderWithLabel(
                title: "Spoilers",
                value: $appState.spoilersValue,
                detents: nil
            ) { newValue in
                Task {
                    await sendAxis(type: "spoilers", value: newValue)
                }
            }
            SliderWithLabel(
                title: "Brakes",
                value: $appState.brakesValue,
                detents: nil
            ) { newValue in
                Task {
                    await sendAxis(type: "brakes", value: newValue)
                }
            }
        }
    }

    private func gearParkingAutopilotSection(profile: Profile?) -> some View {
        HStack(spacing: 12) {
            Button("Gear") {
                Haptics.shared.tap()
                Task {
                    await sendGearCommand()
                }
            }
            Button("Parking Brake") {
                Haptics.shared.tap()
                Task {
                    await sendParkingBrake(profile: profile)
                }
            }
            Button("A/P") {
                Haptics.shared.tap()
                Task {
                    await handleAutopilot(profile: profile)
                }
            }
        }
        .buttonStyle(.borderedProminent)
    }

    private func camerasSection(profile: Profile?) -> some View {
        let cameras = profile?.ui?.camera_config ?? []
        return VStack(alignment: .leading, spacing: 8) {
            Text("Cameras")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                ForEach(cameras) { camera in
                    Button(camera.name) {
                        Task {
                            await sendCamera(id: camera.id)
                        }
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private func throttleSection(profile: Profile?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Throttle")
                Spacer()
                Button("IDLE") {
                    Haptics.shared.tap()
                    Task {
                        await sendIdleCommand()
                    }
                }
            }
            Slider(value: $appState.throttleValue, in: 0...1, onEditingChanged: { _ in
                let snapped = snapThrottle(value: appState.throttleValue, profile: profile)
                appState.throttleValue = snapped
                Haptics.shared.detent()
                Task {
                    await sendThrottle(value: snapped, reverse: false)
                }
            })
        }
    }

    private var rudderSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Rudder")
            Slider(value: $appState.rudderValue, in: 0...1, onEditingChanged: { _ in
                Haptics.shared.detent()
                Task {
                    await sendAxis(type: "rudder", value: appState.rudderValue)
                }
            })
        }
        .padding(.horizontal)
    }

    private func snapFlaps(value: Double, detents: [Profile.FlapDetent]?) -> Double {
        guard let detents = detents, detents.isEmpty == false else {
            return value
        }
        let target = detents.min(by: { abs($0.val - value) < abs($1.val - value) })
        return target?.val ?? value
    }

    private func snapThrottle(value: Double, profile: Profile?) -> Double {
        guard let detents = profile?.ui?.throttle_detents, detents.isEmpty == false else {
            return value
        }
        let snap = profile?.ui?.throttle_detent_snap ?? 0.05
        if let target = detents.first(where: { abs($0.val - value) <= snap }) {
            return target.val
        }
        return value
    }

    private func startPersistenceTimer() {
        persistenceTimer?.invalidate()
        persistenceTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            saveControlsState()
        }
    }

    private func saveControlsState() {
        guard let profile = appState.activeProfileName else {
            return
        }
        let state = SavedControlState(
            profile: profile,
            flaps: appState.flapsValue,
            throttle: appState.throttleValue,
            spoilers: appState.spoilersValue,
            brakes: appState.brakesValue,
            rudder: appState.rudderValue
        )
        StatePersistence.shared.saveControls(state)
    }

    private func restoreControlsIfNeeded() {
        guard let saved = StatePersistence.shared.loadControls() else {
            return
        }
        if saved.profile != profileName {
            return
        }
        let isDefault = saved.flaps == 0 && saved.throttle == 0 && saved.spoilers == 0 && saved.brakes == 0 && abs(saved.rudder - 0.5) < 0.0001
        if isDefault {
            return
        }
        appState.flapsValue = saved.flaps
        appState.throttleValue = saved.throttle
        appState.spoilersValue = saved.spoilers
        appState.brakesValue = saved.brakes
        appState.rudderValue = saved.rudder
        Task {
            await sendAxis(type: "flaps_axis", value: saved.flaps)
            await sendAxis(type: "throttle", value: saved.throttle)
            await sendAxis(type: "spoilers", value: saved.spoilers)
            await sendAxis(type: "brakes", value: saved.brakes)
            await sendAxis(type: "rudder", value: saved.rudder)
        }
    }

    private func loadProfileIfNeeded() async {
        if localProfile != nil {
            return
        }
        isLoading = true
        do {
            let loaded = try await backend.fetchProfile(name: profileName)
            await MainActor.run {
                appState.activeProfileName = profileName
                appState.profile = loaded
                localProfile = loaded
                isLoading = false
                restoreControlsIfNeeded()
                startPersistenceTimer()
            }
        } catch {
            await MainActor.run {
                loadError = "Failed to load profile"
                isLoading = false
            }
        }
    }

    private func sendAxis(type: String, value: Double) async {
        let payload = ControlPayload(
            type: type,
            value: value,
            reverse: nil,
            cam_id: nil,
            state: nil,
            button: nil,
            val_x: nil,
            val_y: nil,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func sendThrottle(value: Double, reverse: Bool) async {
        let payload = ControlPayload(
            type: "throttle",
            value: value,
            reverse: reverse,
            cam_id: nil,
            state: nil,
            button: nil,
            val_x: nil,
            val_y: nil,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func sendFlightControls(x: Double, y: Double) async {
        let payload = ControlPayload(
            type: "flight_controls",
            value: nil,
            reverse: nil,
            cam_id: nil,
            state: nil,
            button: nil,
            val_x: x,
            val_y: y,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func sendGearCommand() async {
        let payload = ControlPayload(
            type: "gear_command",
            value: nil,
            reverse: nil,
            cam_id: nil,
            state: nil,
            button: nil,
            val_x: nil,
            val_y: nil,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func sendParkingBrake(profile: Profile?) async {
        let buttonIndex = profile?.mappings?.vjoy?.PARKING_BRAKE
        let payload = ControlPayload(
            type: "vjoy_button",
            value: nil,
            reverse: nil,
            cam_id: nil,
            state: nil,
            button: buttonIndex,
            val_x: nil,
            val_y: nil,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func sendCamera(id: Int) async {
        let payload = ControlPayload(
            type: "camera",
            value: nil,
            reverse: nil,
            cam_id: id,
            state: nil,
            button: nil,
            val_x: nil,
            val_y: nil,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func sendIdleCommand() async {
        let payload = ControlPayload(
            type: "idle_command",
            value: nil,
            reverse: nil,
            cam_id: nil,
            state: nil,
            button: nil,
            val_x: nil,
            val_y: nil,
            profile: appState.activeProfileName
        )
        do {
            try await backend.sendControl(payload)
        } catch {
        }
    }

    private func handleAutopilot(profile: Profile?) async {
        if profileName == "fenix_a320" {
            await handleFenixAutopilot()
        } else {
            let buttonIndex = profile?.mappings?.vjoy?.AUTOPILOT
            let payload = ControlPayload(
                type: "vjoy_button",
                value: nil,
                reverse: nil,
                cam_id: nil,
                state: nil,
                button: buttonIndex,
                val_x: nil,
                val_y: nil,
                profile: appState.activeProfileName
            )
            do {
                try await backend.sendControl(payload)
            } catch {
            }
        }
    }

    private func handleFenixAutopilot() async {
        do {
            if fenixAutopilotOn {
                try await backend.setLVar(key: "ap_disconnect", value: 1, profile: profileName)
                try await Task.sleep(nanoseconds: 50_000_000)
                try await backend.setLVar(key: "ap_disconnect", value: 0, profile: profileName)
                try await Task.sleep(nanoseconds: 50_000_000)
                try await backend.setLVar(key: "ap_state_off", value: 0, profile: profileName)
                fenixAutopilotOn = false
            } else {
                try await backend.stepLVar(key: "ap_engage", delta: 1, profile: profileName)
                fenixAutopilotOn = true
            }
        } catch {
        }
    }
}

struct JoystickView: View {
    @Binding var x: Double
    @Binding var y: Double
    var onChange: (Double, Double) -> Void

    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height)
            let radius = size / 2
            ZStack {
                Circle()
                    .fill(Color.gray.opacity(0.2))
                Circle()
                    .fill(Color.blue)
                    .frame(width: size / 3, height: size / 3)
                    .offset(dragOffset)
                    .gesture(
                        DragGesture()
                            .updating($dragOffset) { value, state, _ in
                                var offset = value.translation
                                let distance = sqrt(offset.width * offset.width + offset.height * offset.height)
                                if distance > radius {
                                    let scale = radius / distance
                                    offset = CGSize(width: offset.width * scale, height: offset.height * scale)
                                }
                                state = offset
                                let normX = 0.5 + Double(offset.width / (radius * 2))
                                let normY = 0.5 - Double(offset.height / (radius * 2))
                                x = max(0, min(1, normX))
                                y = max(0, min(1, normY))
                                onChange(x, y)
                            }
                            .onEnded { _ in
                                x = 0.5
                                y = 0.5
                                onChange(0.5, 0.5)
                            }
                    )
            }
        }
    }
}

struct SliderWithLabel: View {
    let title: String
    @Binding var value: Double
    let detents: [Profile.FlapDetent]?
    var onChange: (Double) -> Void

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text(title)
                Spacer()
                Text(String(format: "%.2f", value))
                    .monospacedDigit()
            }
            Slider(value: $value, in: 0...1, onEditingChanged: { _ in
                let snapped = snap(value: value)
                value = snapped
                Haptics.shared.detent()
                onChange(snapped)
            })
        }
    }

    private func snap(value: Double) -> Double {
        guard let detents = detents, detents.isEmpty == false else {
            return value
        }
        let target = detents.min(by: { abs($0.val - value) < abs($1.val - value) })
        return target?.val ?? value
    }
}

struct TDInputView: View {
    @ObservedObject var tdManager: TDTimerManager
    let profileName: String
    @State private var hhmm: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if profileName == "fenix_a320" {
                Text("TD Time UTC (HH:MM)")
                TextField("12:34", text: $hhmm)
                    .keyboardType(.numbersAndPunctuation)
                    .textFieldStyle(.roundedBorder)
                Button("Set TD") {
                    if let date = parseHHMM(hhmm) {
                        tdManager.setTarget(date: date)
                    }
                }
                if let target = tdManager.targetDate {
                    Text(target, style: .time)
                        .monospacedDigit()
                }
                if tdManager.fired {
                    Text("TD reached")
                        .foregroundColor(.yellow)
                }
            }
        }
        .onAppear {
            tdManager.start()
            tdManager.restore()
        }
    }

    private func parseHHMM(_ text: String) -> Date? {
        let components = text.split(separator: ":")
        if components.count != 2 {
            return nil
        }
        guard let hour = Int(components[0]), let minute = Int(components[1]) else {
            return nil
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        var dateComponents = calendar.dateComponents([.year, .month, .day], from: Date())
        dateComponents.hour = hour
        dateComponents.minute = minute
        if let date = calendar.date(from: dateComponents) {
            if date <= Date() {
                if let nextDay = calendar.date(byAdding: .day, value: 1, to: date) {
                    return nextDay
                }
            }
            return date
        }
        return nil
    }
}

