import SwiftUI

struct CockpitView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var backend: BackendService

    let profileName: String

    @State private var localProfile: Profile?
    @State private var isLoading = false
    @State private var loadError: String?

    @StateObject private var tdManager = TDTimerManager()
    @State private var fenixAutopilotOn = false
    @State private var persistenceTimer: Timer?
    @State private var centerTab: CenterTab = .cameras
    @State private var isReverse = false
    @State private var parkingBrakeOn = true
    @State private var spoilersArmed = false
    @State private var gearIsDown = true
    @State private var idleBlinkState = false
    @State private var idleBlinkTimer: Timer?
    @State private var activeCameraId: Int? = 1


    private enum CenterTab {
        case cameras
        case ofp
    }

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
        .navigationBarBackButtonHidden(true)
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

        return GeometryReader { geometry in
            HStack(alignment: .top, spacing: 15) {
                VStack(spacing: 0) {
                    Spacer()
                    tdSection
                        .padding(.bottom, 30)
                    joystickSection
                        .frame(width: 180, height: 180)
                    Spacer()
                        .frame(height: 120)
                }
                .frame(width: 200, height: geometry.size.height)

                VStack(spacing: 8) {
                    HStack(spacing: 10) {
                        Button("CAMERAS") {
                            centerTab = .cameras
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(centerTab == .cameras ? Color(white: 0.12) : Color(white: 0.17))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(centerTab == .cameras ? Color.blue : Color(white: 0.23), lineWidth: 2)
                        )
                        .foregroundColor(.white)
                        .font(.system(size: 13))
                        .cornerRadius(10)

                        Button("OFP") {
                            centerTab = .ofp
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(centerTab == .ofp ? Color(white: 0.12) : Color(white: 0.17))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(centerTab == .ofp ? Color.blue : Color(white: 0.23), lineWidth: 2)
                        )
                        .foregroundColor(.white)
                        .font(.system(size: 13))
                        .cornerRadius(10)
                    }
                    .frame(height: 38)

                    if centerTab == .cameras {
                        VStack(spacing: 8) {
                            camerasSection(profile: profile)
                                .frame(height: 90)
                                .padding(.bottom, 12)
                            pedestalSection(profile: profile)
                                .frame(maxHeight: .infinity)
                            rudderSection
                        }
                        .frame(maxHeight: .infinity)
                    } else {
                        OfpMetarView()
                            .frame(maxHeight: .infinity)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                VStack(spacing: 16) {
                    Text("THROTTLE")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .frame(maxWidth: .infinity, alignment: .center)
                    throttleSection(profile: profile, geometry: geometry)
                }
                .frame(width: 180)
                .padding(15)
                .padding(.bottom, 20)
                .background(Color(red: 22/255, green: 22/255, blue: 24/255))
                .cornerRadius(20)
            }
            .padding(10)
            .background(Color.black.edgesIgnoringSafeArea(.all))
        }
    }

    private var tdSection: some View {
        VStack(alignment: .center, spacing: 12) {
            if profileName == "fenix_a320" {
                HStack(spacing: 4) {
                    Text(tdManager.utcNow, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).second(.twoDigits))
                        .environment(\.timeZone, TimeZone(abbreviation: "UTC")!)
                    Text("UTC")
                }
                .font(.system(size: 18, design: .monospaced))
                .foregroundColor(Color(white: 0.7))
            }
            TDInputView(tdManager: tdManager, profileName: profileName)
        }
        .padding(.bottom, 24)
    }

    private var joystickSection: some View {
        VStack(spacing: 8) {
            Text("FLIGHT STICK")
                .font(.caption)
                .foregroundColor(.gray)
            JoystickView(
                x: $appState.joystickX,
                y: $appState.joystickY
            ) { x, y in
                let curvedX = applyControlCurve(x, profile: localProfile ?? appState.profile)
                let curvedY = applyControlCurve(y, profile: localProfile ?? appState.profile)
                Task {
                    await sendFlightControls(x: curvedX, y: curvedY)
                }
            }
        }
    }

    private func pedestalSection(profile: Profile?) -> some View {
        HStack(spacing: 20) {
            GearLever(isDown: $gearIsDown) {
                Haptics.shared.tap()
                gearIsDown.toggle()
                Task {
                    await sendGearCommand()
                }
            }
            .frame(width: 80)

            VCard(label: "FLAPS", detents: profile?.ui?.flap_detents, sliderRotation: 90, leftPadding: 30, currentValue: appState.flapsValue) {
                VerticalSlider(value: $appState.flapsValue, rotation: 90, snapToDetents: profile?.ui?.flap_detents) { isEditing in
                    if !isEditing {
                        Haptics.shared.detent()
                    }
                    Task {
                        await sendAxis(type: "flaps_axis", value: appState.flapsValue)
                    }
                }
                .offset(x: 15) // Moves the slider itself to the right
            } bottomButton: {
                Spacer()
                    .frame(height: 45)
            }
            .frame(width: 150)

            VCard(label: "SPOIL", detents: nil, sliderRotation: 90, currentValue: appState.spoilersValue) {
                VerticalSlider(value: $appState.spoilersValue, rotation: 90) { _ in
                    if spoilersArmed && appState.spoilersValue > 0.05 {
                        spoilersArmed = false
                    }
                    Haptics.shared.detent()
                    Task {
                        await sendAxis(type: "spoilers", value: appState.spoilersValue)
                    }
                }
            } bottomButton: {
                Button(spoilersArmed ? "ARMED" : "ARM SPOILERS") {
                    Haptics.shared.tap()
                    spoilersArmed.toggle()
                    if spoilersArmed {
                        animateSpoilersToZero()
                    }
                    Task {
                        await sendArmSpoilers(profile: profile)
                        if spoilersArmed {
                            try? await Task.sleep(nanoseconds: 300_000_000)
                            await sendAxis(type: "spoilers", value: 0)
                        }
                    }
                }
                .frame(width: 130, height: 45)
                .background(spoilersArmed ? Color.blue : Color.clear)
                .foregroundColor(spoilersArmed ? .white : .blue)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.blue, lineWidth: 2)
                )
                .cornerRadius(10)
                .font(.system(size: 13))
            }
            .frame(width: 150)

            VCard(label: "BRAKE", detents: nil, sliderRotation: -90, currentValue: appState.brakesValue) {
                VerticalSlider(value: $appState.brakesValue, rotation: -90) { _ in
                    Haptics.shared.detent()
                    Task {
                        await sendAxis(type: "brakes", value: appState.brakesValue)
                    }
                }
            } bottomButton: {
                Button("PARKING BRAKE") {
                    Haptics.shared.tap()
                    parkingBrakeOn.toggle()
                    Task {
                        await sendParkingBrake(profile: profile)
                    }
                }
                .frame(width: 130, height: 45)
                .background(parkingBrakeOn ? Color.red : Color.clear)
                .foregroundColor(parkingBrakeOn ? .white : .red)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.red, lineWidth: 2)
                )
                .cornerRadius(10)
                .font(.system(size: 13))
            }
            .frame(width: 150)

            VStack {
                Spacer()
                Button {
                    Haptics.shared.tap()
                    Task {
                        await handleAutopilot(profile: profile)
                    }
                } label: {
                    VStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(fenixAutopilotOn ? Color.green : Color(white: 0.1))
                            .frame(width: 36, height: 5)
                        Text("A/P")
                            .font(.system(size: 12))
                    }
                    .frame(width: 60, height: 60)
                    .background(Color(white: 0.17))
                    .foregroundColor(.white)
                    .overlay(
                        Rectangle()
                            .stroke(Color(white: 0.23), lineWidth: 2)
                    )
                }
                Spacer()
            }
            .frame(width: 70)
        }
        .frame(height: 400)
    }

    private func camerasSection(profile: Profile?) -> some View {
        let cameras = profile?.ui?.camera_config ?? []
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
            ForEach(cameras) { camera in
                Button(camera.name) {
                    Haptics.shared.tap()
                    activeCameraId = camera.id
                    Task {
                        await sendCamera(id: camera.id)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 35)
                .background(Color(red: 44/255, green: 44/255, blue: 46/255))
                .foregroundColor(.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(activeCameraId == camera.id ? Color.blue : Color(red: 58/255, green: 58/255, blue: 60/255), lineWidth: activeCameraId == camera.id ? 2 : 1)
                )
                .cornerRadius(8)
                .font(.system(size: 11))
                .textCase(.uppercase)
            }
        }
    }

    private func throttleSection(profile: Profile?, geometry: GeometryProxy) -> some View {
        let trackHeight = geometry.size.height * 0.55
        let thumbHeight: CGFloat = 55
        
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                if let detents = profile?.ui?.throttle_detents {
                    let minDetent = detents.map(\.val).min() ?? 0
                    let activeDetent: Profile.ThrottleDetent? = {
                        if isReverse || appState.throttleValue < minDetent {
                            return nil
                        }
                        return detents.min(by: { abs($0.val - appState.throttleValue) < abs($1.val - appState.throttleValue) })
                    }()
                    
                    GeometryReader { labelGeometry in
                        ZStack(alignment: .topTrailing) {
                            ForEach(detents) { detent in
                                let usableHeight = trackHeight - thumbHeight
                                let thumbCenterY = (1.0 - detent.val) * usableHeight + thumbHeight / 2
                                let topPosition = thumbCenterY + 60
                                
                                HStack(spacing: 8) {
                                    Text(detent.label)
                                        .font(.system(size: 14))
                                        .foregroundColor(detent.label == activeDetent?.label ? Color(red: 0, green: 122/255, blue: 1) : Color(white: 0.27))
                                    Circle()
                                        .frame(width: 6, height: 6)
                                        .foregroundColor(.clear)
                                }
                                .frame(width: 80, alignment: .trailing)
                                .offset(y: topPosition)
                            }
                        }
                    }
                    .frame(width: 80)
                    .padding(.trailing, 10)
                }
                ZStack {
                    RoundedRectangle(cornerRadius: 27)
                        .fill(Color.black)
                        .frame(width: 54, height: trackHeight)
                    ThrottleSlider(value: $appState.throttleValue, profile: profile) { _ in
                        let snapped = snapThrottle(value: appState.throttleValue, profile: profile)
                        appState.throttleValue = snapped
                        Haptics.shared.detent()
                        Task {
                            await sendThrottle(value: snapped, reverse: isReverse)
                        }
                    }
                    .frame(width: 54, height: trackHeight)
                }
                .frame(maxWidth: .infinity)
            }
            .frame(maxHeight: .infinity)

            HStack {
                Spacer()
                Button("IDLE") {
                    Haptics.shared.tap()
                    animateThrottleToIdle()
                }
                .frame(width: 95)
                .padding(.vertical, 10)
                .background(idleBlinkState ? Color.white : Color(white: 0.27))
                .foregroundColor(idleBlinkState ? .black : .white)
                .cornerRadius(10)
                .font(.system(size: 14))
                Spacer()
            }
            .padding(.bottom, 20)

            Button(isReverse ? "REVERSE ON" : "REVERSE") {
                Haptics.shared.tap()
                Task {
                    await toggleReverse(profile: profile)
                }
            }
            .frame(width: 95)
            .padding(.vertical, 10)
            .background(isReverse ? Color.orange : Color(white: 0.17))
            .foregroundColor(isReverse ? .black : .white)
            .cornerRadius(10)
            .font(.system(size: 14))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
    }

    private var rudderSection: some View {
        VStack(spacing: 35) {
            Text("RUDDER CONTROL")
                .font(.caption)
                .foregroundColor(.gray)
            SpringySlider(value: $appState.rudderValue, centerValue: 0.5) { value in
                Haptics.shared.detent()
                Task {
                    let curved = applyControlCurve(value, profile: localProfile ?? appState.profile)
                    await sendAxis(type: "rudder", value: curved)
                }
            }
            .frame(height: 28)
        }
        .padding(.horizontal, 10)
        .padding(.top, 15)
        .padding(.bottom, 25)
        .background(Color(red: 22/255, green: 22/255, blue: 24/255))
        .cornerRadius(20)
    }

    private func snap(value: Double, detents: [Profile.FlapDetent]?) -> Double {
        guard let detents = detents, detents.isEmpty == false else {
            return value
        }
        let target = detents.min(by: { abs($0.val - value) < abs($1.val - value) })
        return target?.val ?? value
    }

    private func snapThrottle(value: Double, profile: Profile?) -> Double {
        if isReverse { return value }
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
        var isDefault = true
        if let saved = StatePersistence.shared.loadControls(), saved.profile == profileName {
            let matchesDefault = saved.flaps == 0 && saved.throttle == 0 && saved.spoilers == 0 && saved.brakes == 0 && abs(saved.rudder - 0.5) < 0.0001
            if !matchesDefault {
                appState.flapsValue = saved.flaps
                appState.throttleValue = saved.throttle
                appState.spoilersValue = saved.spoilers
                appState.brakesValue = saved.brakes
                appState.rudderValue = saved.rudder
                isDefault = false
            }
        }
        
        if isDefault {
            appState.flapsValue = 0
            appState.throttleValue = 0
            appState.spoilersValue = 0
            appState.brakesValue = 0
            appState.rudderValue = 0.5
            parkingBrakeOn = true
            spoilersArmed = false
            gearIsDown = true
            activeCameraId = 1
            isReverse = false
        }
        
        Task {
            await sendAxis(type: "flaps_axis", value: appState.flapsValue)
            await sendThrottle(value: appState.throttleValue, reverse: isReverse)
            await sendAxis(type: "spoilers", value: appState.spoilersValue)
            await sendAxis(type: "brakes", value: appState.brakesValue)
            await sendAxis(type: "rudder", value: appState.rudderValue)
            
            if isDefault {
                if let camId = activeCameraId {
                    await sendCamera(id: camId)
                }
                await sendGearCommand()
                await sendParkingBrake(profile: localProfile ?? appState.profile)
            }
        }
    }

    private func loadProfileIfNeeded() async {
        if localProfile != nil {
            return
        }
        isLoading = true
        do {
            backend.updateBaseURL(from: appState.baseURLString)
            try? await backend.setSession(pin: "1234", profile: profileName)
            
            let loaded = try await backend.fetchProfile(name: profileName)
            await MainActor.run {
                appState.activeProfileName = profileName
                appState.profile = loaded
                localProfile = loaded
                appState.isConnected = true
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
        let mapped = mapThrottle(value: value, reverse: reverse, profile: localProfile ?? appState.profile)
        let payload = ControlPayload(
            type: "throttle",
            value: mapped,
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
            state: gearIsDown ? "DOWN" : "UP",
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

    private func sendArmSpoilers(profile: Profile?) async {
        if profile?.ui?.arm_spoilers_button == true {
            let buttonIndex = profile?.mappings?.vjoy?.ARM_SPOILERS
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
        } else {
            let payload = ControlPayload(
                type: "arm_spoilers",
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
                fenixAutopilotOn = false
                try await backend.setLVar(key: "ap_disconnect", value: 1, profile: profileName)
                try await Task.sleep(nanoseconds: 50_000_000)
                try await backend.setLVar(key: "ap_disconnect", value: 0, profile: profileName)
                try await Task.sleep(nanoseconds: 50_000_000)
                try await backend.setLVar(key: "ap_state_off", value: 0, profile: profileName)
            } else {
                fenixAutopilotOn = true
                try await backend.stepLVar(key: "ap_engage", delta: 1, profile: profileName)
            }
        } catch {
        }
    }

    private func applyControlCurve(_ value: Double, profile: Profile?) -> Double {
        let response = profile?.ui?.control_response ?? 1
        let sensitivity = profile?.ui?.control_sensitivity ?? 1
        let delta = value - 0.5
        let sign = delta >= 0 ? 1.0 : -1.0
        let magnitude = pow(abs(delta) * 2, response) / 2
        let curved = 0.5 + sign * magnitude
        let adjusted = 0.5 + (curved - 0.5) * sensitivity
        return min(max(adjusted, 0), 1)
    }

    private func mapThrottle(value: Double, reverse: Bool, profile: Profile?) -> Double {
        guard let reverseBehavior = profile?.ui?.reverse_behavior else {
            return value
        }
        if reverse {
            let idleReverse = reverseBehavior.idle_rev
            let mapped = idleReverse * (1 - value)
            return mapped
        } else {
            let idleFloor = reverseBehavior.idle_floor
            return max(value, idleFloor)
        }
    }

    private func animateSpoilersToZero() {
        let startValue = appState.spoilersValue
        let duration: TimeInterval = 0.3
        let startTime = Date()

        let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { timer in
            let elapsed = Date().timeIntervalSince(startTime)
            let progress = min(elapsed / duration, 1.0)
            
            // easeOutCubic
            let ease = 1.0 - pow(1.0 - progress, 3)
            appState.spoilersValue = startValue - startValue * ease
            
            if progress >= 1.0 {
                timer.invalidate()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
    }

    private func animateThrottleToIdle() {
        let profile = localProfile ?? appState.profile
        let targetValue = isReverse ? (profile?.ui?.reverse_behavior?.idle_rev ?? 0) : (profile?.ui?.reverse_behavior?.idle_floor ?? 0)
        let startValue = appState.throttleValue
        let duration: TimeInterval = 0.3
        let startTime = Date()

        // Send network command immediately like web
        Task {
            if profile?.ui?.reverse_behavior != nil {
                try? await sendThrottle(value: targetValue, reverse: isReverse)
            } else {
                try? await sendIdleCommand()
            }
        }
        
        // Blink logic matching web implementation (6 toggles, 500ms intervals)
        var blinkCount = 1
        idleBlinkState = true
        idleBlinkTimer?.invalidate()
        idleBlinkTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { timer in
            idleBlinkState.toggle()
            blinkCount += 1
            if blinkCount >= 6 {
                timer.invalidate()
                idleBlinkState = false
            }
        }

        // Visual animation loop like requestAnimationFrame
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { timer in
            let elapsed = Date().timeIntervalSince(startTime)
            let progress = min(elapsed / duration, 1.0)
            
            // easeOutCubic
            let ease = 1.0 - pow(1.0 - progress, 3)
            appState.throttleValue = startValue + (targetValue - startValue) * ease
            
            if progress >= 1.0 {
                timer.invalidate()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
    }

    private func toggleReverse(profile: Profile?) async {
        guard let reverseBehavior = profile?.ui?.reverse_behavior else {
            isReverse.toggle()
            return
        }
        if isReverse {
            let up = reverseBehavior.idle_bump_up
            let floor = reverseBehavior.idle_floor
            let ms = reverseBehavior.idle_bump_ms
            
            appState.throttleValue = up
            try? await sendThrottle(value: up, reverse: false)
            
            try? await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
            
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) {
                appState.throttleValue = floor
            }
            try? await sendThrottle(value: floor, reverse: false)
            isReverse = false
        } else {
            let down = reverseBehavior.idle_bump_down
            let ms = reverseBehavior.idle_bump_ms
            
            withAnimation(.linear(duration: 0.1)) {
                appState.throttleValue = 0
            }
            
            try? await sendThrottle(value: down, reverse: true)
            try? await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
            try? await sendThrottle(value: 0, reverse: true)
            isReverse = true
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
                    .fill(Color.black)
                    .overlay(
                        Circle()
                            .stroke(Color(white: 0.2), lineWidth: 2)
                    )
                Circle()
                    .fill(Color(white: 0.93))
                    .overlay(
                        Circle()
                            .stroke(Color(white: 0.27), lineWidth: 4)
                    )
                    .frame(width: size / 2.7, height: size / 2.7)
                    .shadow(color: Color.black.opacity(0.6), radius: 8, x: 0, y: 8)
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
                                let normY = 0.5 + Double(offset.height / (radius * 2))
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

struct VCard<Content: View, BottomButton: View>: View {
    let label: String
    let detents: [Profile.FlapDetent]?
    let sliderRotation: Double
    let leftPadding: CGFloat
    let currentValue: Double
    @ViewBuilder let content: Content
    @ViewBuilder let bottomButton: BottomButton

    init(label: String, detents: [Profile.FlapDetent]?, sliderRotation: Double = 0, leftPadding: CGFloat = 0, currentValue: Double = 0, @ViewBuilder content: () -> Content, @ViewBuilder bottomButton: () -> BottomButton) {
        self.label = label
        self.detents = detents
        self.sliderRotation = sliderRotation
        self.leftPadding = leftPadding
        self.currentValue = currentValue
        self.content = content()
        self.bottomButton = bottomButton()
    }

    var body: some View {
        VStack(spacing: 0) {
            Text(label)
                .font(.caption)
                .foregroundColor(.gray)
                .padding(.top, 15)
            ZStack {
                content
                if let detents = detents {
                    let activeDetent = detents.min(by: { abs($0.val - currentValue) < abs($1.val - currentValue) })
                    GeometryReader { geometry in
                        let trackHeight = geometry.size.height
                        let thumbHeight: CGFloat = 45
                        let usableHeight = trackHeight - thumbHeight
                        
                        ZStack(alignment: .topLeading) {
                            ForEach(detents) { detent in
                                let thumbCenterY = CGFloat(detent.val) * usableHeight + thumbHeight / 2
                                let topPosition = thumbCenterY - 8
                                
                                HStack(spacing: 8) {
                                    Text(detent.label)
                                        .font(.system(size: 14))
                                        .foregroundColor(detent.id == activeDetent?.id ? Color(red: 0, green: 122/255, blue: 1) : Color(white: 0.27))
                                    Circle()
                                        .frame(width: 6, height: 6)
                                        .foregroundColor(detent.id == activeDetent?.id ? Color(red: 0, green: 122/255, blue: 1) : .clear)
                                        .shadow(color: detent.id == activeDetent?.id ? Color(red: 0, green: 122/255, blue: 1) : .clear, radius: 8)
                                }
                                .frame(width: 65, alignment: .trailing)
                                .offset(x: leftPadding - 35, y: topPosition)
                            }
                        }
                    }
                }
            }
            .frame(height: 380)
            .padding(.vertical, 10)
            bottomButton
                .padding(.bottom, 15)
        }
        .background(Color(red: 22/255, green: 22/255, blue: 24/255))
        .cornerRadius(20)
    }
}

struct GearLever: View {
    @Binding var isDown: Bool
    var onTap: () -> Void

    var body: some View {
        VStack {
            Text("GEAR")
                .font(.caption)
                .foregroundColor(.gray)
                .padding(.top, 20)
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.black)
                    .frame(width: 12, height: 150)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(white: 0.2), lineWidth: 2)
                    )
                VStack {
                    if isDown {
                        Spacer()
                    }
                    VStack(spacing: 0) {
                        Rectangle()
                            .fill(LinearGradient(
                                gradient: Gradient(colors: [Color(white: 0.27), Color(white: 0.53), Color(white: 0.27)]),
                                startPoint: .leading,
                                endPoint: .trailing
                            ))
                            .frame(width: 8, height: 45)
                        RoundedRectangle(cornerRadius: 6)
                            .fill(
                                RadialGradient(
                                    gradient: Gradient(colors: [Color.white, Color(white: 0.86)]),
                                    center: .init(x: 0.5, y: 0.4),
                                    startRadius: 0,
                                    endRadius: 25
                                )
                            )
                            .frame(width: 50, height: 32)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(Color(white: 0.1), lineWidth: 3)
                            )
                            .shadow(color: Color.black.opacity(0.8), radius: 5, x: 0, y: 5)
                            .offset(y: -15)
                    }
                    if !isDown {
                        Spacer()
                    }
                }
                .frame(height: 150)
                .animation(.spring(response: 0.4, dampingFraction: 0.6), value: isDown)
            }
            .padding(.vertical, 15)
            .onTapGesture {
                onTap()
            }
            Spacer()
        }
        .frame(height: 400)
    }
}

struct TDInputView: View {
    @ObservedObject var tdManager: TDTimerManager
    let profileName: String
    @State private var selectedDate: Date = Date()

    var body: some View {
        VStack(alignment: .center, spacing: 12) {
            if profileName == "fenix_a320" {
                DatePicker("", selection: $selectedDate, displayedComponents: .hourAndMinute)
                    .labelsHidden()
                    .colorScheme(.dark)
                    .environment(\.timeZone, TimeZone(abbreviation: "UTC")!)
                    .environment(\.locale, Locale(identifier: "en_GB"))
                    .background(Color(white: 0.17))
                    .cornerRadius(8)
                
                Button("T/D Timer") {
                    Haptics.shared.tap()
                    tdManager.toggleTimer(targetTime: selectedDate)
                }
                .frame(width: 120, height: 40)
                .background(tdManager.isActive ? Color.green : Color.clear)
                .foregroundColor(tdManager.isActive ? .white : .green)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.green, lineWidth: 2)
                )
                .cornerRadius(10)
                .font(.system(size: 13))

                if tdManager.fired {
                    Text("ToD Reached")
                        .foregroundColor(Color.green)
                        .font(.system(size: 14, weight: .bold))
                }
            }
        }
        .onAppear {
            tdManager.start()
            tdManager.restore()
            if let target = tdManager.targetDate {
                selectedDate = target
            }
        }
    }
}
