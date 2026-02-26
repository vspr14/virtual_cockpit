import SwiftUI

struct AircraftSelectionView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var backend: BackendService
    @State private var isLoading = false
    @State private var loadError: String?

    private struct Aircraft: Identifiable {
        let id: String
        let title: String
    }

    private let aircraft: [Aircraft] = [
        Aircraft(id: "fenix_a320", title: "Fenix A320"),
        Aircraft(id: "fenix_a350", title: "Fenix A350"),
        Aircraft(id: "pmdg_737", title: "PMDG 737"),
        Aircraft(id: "pmdg_777", title: "PMDG 777")
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Select Aircraft")
                    .font(.largeTitle)

                if let error = loadError {
                    Text(error)
                        .foregroundColor(.red)
                }

                ForEach(aircraft) { item in
                    NavigationLink {
                        CockpitView(profileName: item.id)
                    } label: {
                        Text(item.title)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isLoading)
                }

                if appState.isConnected {
                    Text("Connected")
                        .foregroundColor(.green)
                } else {
                    Text("Not connected")
                        .foregroundColor(.red)
                }

                Spacer()
            }
            .padding(40)
            .navigationTitle("iPad Joy")
        }
    }
}

