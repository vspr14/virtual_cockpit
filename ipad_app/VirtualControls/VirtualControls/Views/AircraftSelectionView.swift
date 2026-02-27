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
            ZStack {
                Color(red: 5/255, green: 5/255, blue: 5/255)
                    .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 0) {
                    Text("Select Aircraft")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.bottom, 30)

                    if let error = loadError {
                        Text(error)
                            .foregroundColor(.red)
                            .padding(.bottom, 20)
                    }

                    VStack(spacing: 16) {
                        ForEach(aircraft) { item in
                            NavigationLink {
                                CockpitView(profileName: item.id)
                            } label: {
                                Text(item.title.uppercased())
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 20)
                                    .background(Color(red: 28/255, green: 28/255, blue: 30/255))
                                    .cornerRadius(14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(Color(red: 58/255, green: 58/255, blue: 60/255), lineWidth: 2)
                                    )
                            }
                            .disabled(isLoading)
                        }
                    }
                    .frame(maxWidth: 400)
                    .padding(.horizontal, 40)
                }
            }
        }
    }
}

