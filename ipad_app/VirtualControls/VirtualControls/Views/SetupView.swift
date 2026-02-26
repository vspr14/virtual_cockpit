import SwiftUI

struct SetupView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var backend: BackendService
    @State private var isVerifying = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Text("iPad Joy Setup")
                .font(.largeTitle)

            VStack(alignment: .leading, spacing: 12) {
                Text("PC Base URL")
                TextField("http://192.168.0.10:5000", text: $appState.baseURLString)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .disableAutocorrection(true)
                    .textFieldStyle(.roundedBorder)
                Text("PIN")
                SecureField("1234", text: $appState.pin)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.horizontal, 40)

            if let message = errorMessage {
                Text(message)
                    .foregroundColor(.red)
            }

            Button {
                Haptics.shared.tap()
                Task {
                    await verify()
                }
            } label: {
                if isVerifying {
                    ProgressView()
                } else {
                    Text("Connect")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 40)
        }
    }

    private func verify() async {
        isVerifying = true
        errorMessage = nil
        backend.updateBaseURL(from: appState.baseURLString)
        do {
            let ok = try await backend.verifyPin(pin: appState.pin)
            if ok {
                appState.isConnected = true
            } else {
                errorMessage = "PIN verification failed"
                appState.isConnected = false
            }
        } catch {
            errorMessage = "Failed to reach backend"
            appState.isConnected = false
        }
        isVerifying = false
    }
}

