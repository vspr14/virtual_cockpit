import SwiftUI
import WebKit

struct OfpMetarView: View {
    @EnvironmentObject private var backend: BackendService
    @State private var ofp: OfpResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button("Refresh OFP") {
                    Task {
                        await loadOfp()
                    }
                }
                Button("Refresh METAR") {
                    Task {
                        await refreshMetar()
                    }
                }
            }
            .buttonStyle(.bordered)

            if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
            }

            if isLoading {
                ProgressView()
            } else if let ofp = ofp {
                if let url = URL(string: ofp.pdf_url) {
                    OfpWebView(url: url)
                }
                if let metars = ofp.metars {
                    VStack(alignment: .leading, spacing: 8) {
                        if let origin = metars.origin {
                            Text("Origin METAR")
                                .bold()
                            Text(origin)
                                .font(.system(size: 12, design: .monospaced))
                        }
                        if let destination = metars.destination {
                            Text("Destination METAR")
                                .bold()
                            Text(destination)
                                .font(.system(size: 12, design: .monospaced))
                        }
                    }
                    .padding()
                }
            }
        }
        .padding()
        .task {
            await loadOfp()
        }
    }

    private func loadOfp() async {
        isLoading = true
        errorMessage = nil
        do {
            let result = try await backend.fetchOfp()
            await MainActor.run {
                ofp = result
                isLoading = false
            }
        } catch {
            await MainActor.run {
                errorMessage = "Failed to load OFP"
                isLoading = false
            }
        }
    }

    private func refreshMetar() async {
        guard let current = ofp else {
            return
        }
        let origin = current.origin_icao ?? ""
        let destination = current.destination_icao ?? ""
        do {
            let metar = try await backend.fetchMetar(origin: origin, destination: destination)
            var updated = current
            let merged = OfpResponse.Metars(origin: metar.metars.origin, destination: metar.metars.destination)
            updated = OfpResponse(pdf_url: current.pdf_url, metars: merged, origin_icao: current.origin_icao, destination_icao: current.destination_icao)
            await MainActor.run {
                ofp = updated
            }
        } catch {
        }
    }
}

struct OfpWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        WKWebView()
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.load(URLRequest(url: url))
    }
}

