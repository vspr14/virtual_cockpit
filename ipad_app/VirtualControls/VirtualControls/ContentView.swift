import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        AircraftSelectionView()
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
        .environmentObject(BackendService())
}
