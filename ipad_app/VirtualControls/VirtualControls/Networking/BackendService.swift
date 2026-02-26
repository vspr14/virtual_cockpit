import Foundation
import SwiftUI
import Combine

struct ControlPayload: Codable {
    let type: String
    let value: Double?
    let reverse: Bool?
    let cam_id: Int?
    let state: String?
    let button: Int?
    let val_x: Double?
    let val_y: Double?
    let profile: String?
}

struct LVarPayload: Codable {
    let key: String
    let value: Double?
    let delta: Double?
    let profile: String?
}

struct OfpResponse: Codable {
    struct Metars: Codable {
        let origin: String?
        let destination: String?
    }

    let pdf_url: String
    let metars: Metars?
    let origin_icao: String?
    let destination_icao: String?
}

struct MetarResponse: Codable {
    struct Metars: Codable {
        let origin: String?
        let destination: String?
    }

    let metars: Metars
}

@MainActor
final class BackendService: ObservableObject {
    @Published var baseURL: URL?

    private let session: URLSession

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        session = URLSession(configuration: configuration)
    }

    func updateBaseURL(from string: String) {
        baseURL = URL(string: string)
    }

    private func makeURL(path: String, queryItems: [URLQueryItem]? = nil) throws -> URL {
        guard let base = baseURL else {
            throw URLError(.badURL)
        }
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        components?.path = path
        if let items = queryItems {
            components?.queryItems = items
        }
        guard let url = components?.url else {
            throw URLError(.badURL)
        }
        return url
    }

    private func makeJSONRequest<T: Encodable>(url: URL, body: T) throws -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }

    func verifyPin(pin: String) async throws -> Bool {
        let url = try makeURL(path: "/verify_pin")
        struct Body: Encodable {
            let pin: String
        }
        let request = try makeJSONRequest(url: url, body: Body(pin: pin))
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if http.statusCode == 200 {
            struct Result: Decodable {
                let ok: Bool
            }
            let result = try JSONDecoder().decode(Result.self, from: data)
            return result.ok
        }
        return false
    }

    func setSession(pin: String, profile: String) async throws {
        let url = try makeURL(path: "/session")
        struct Body: Encodable {
            let pin: String
            let profile: String
        }
        let request = try makeJSONRequest(url: url, body: Body(pin: pin, profile: profile))
        _ = try await session.data(for: request)
    }

    func sendControl(_ payload: ControlPayload) async throws {
        let url = try makeURL(path: "/update_sim")
        let request = try makeJSONRequest(url: url, body: payload)
        _ = try await session.data(for: request)
    }

    func setLVar(key: String, value: Double, profile: String?) async throws {
        let url = try makeURL(path: "/lvars")
        let payload = LVarPayload(key: key, value: value, delta: nil, profile: profile)
        let request = try makeJSONRequest(url: url, body: payload)
        _ = try await session.data(for: request)
    }

    func stepLVar(key: String, delta: Double, profile: String?) async throws {
        let url = try makeURL(path: "/lvars/step")
        let payload = LVarPayload(key: key, value: nil, delta: delta, profile: profile)
        let request = try makeJSONRequest(url: url, body: payload)
        _ = try await session.data(for: request)
    }

    func fetchProfile(name: String) async throws -> Profile {
        let path = "/profiles/\(name).json"
        let url = try makeURL(path: path)
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode(Profile.self, from: data)
    }

    func fetchOfp() async throws -> OfpResponse {
        let url = try makeURL(path: "/ofp")
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode(OfpResponse.self, from: data)
    }

    func fetchMetar(origin: String, destination: String) async throws -> MetarResponse {
        let items = [
            URLQueryItem(name: "origin", value: origin),
            URLQueryItem(name: "destination", value: destination)
        ]
        let url = try makeURL(path: "/metar", queryItems: items)
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode(MetarResponse.self, from: data)
    }
}

