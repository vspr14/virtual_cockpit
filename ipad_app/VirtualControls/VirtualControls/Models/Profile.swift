import Foundation

struct Profile: Codable, Identifiable {
    struct CameraConfig: Codable, Identifiable {
        let id: Int
        let name: String
    }

    struct FlapDetent: Codable, Identifiable {
        let index: Int
        let label: String
        let val: Double

        var id: Int {
            index
        }
    }

    struct ThrottleDetent: Codable, Identifiable {
        let label: String
        let val: Double

        var id: String {
            label
        }
    }

    struct ReverseBehavior: Codable {
        let spool_down_ms: Int
        let idle_floor: Double
        let idle_rev: Double
        let idle_bump_up: Double
        let idle_bump_ms: Int
        let idle_bump_down: Double
    }

    struct UIConfig: Codable {
        let camera_config: [CameraConfig]?
        let flap_detents: [FlapDetent]?
        let throttle_detents: [ThrottleDetent]?
        let control_sensitivity: Double?
        let control_response: Double?
        let throttle_detent_snap: Double?
        let reverse_behavior: ReverseBehavior?
        let arm_spoilers_button: Bool?
    }

    struct VJoyMappings: Codable {
        let PARKING_BRAKE: Int?
        let REVERSE_TOGGLE: Int?
        let IDLE_BUTTON: Int?
        let ARM_SPOILERS: Int?
        let GEAR_UP: Int?
        let GEAR_DOWN: Int?
        let AUTOPILOT: Int?
        let CAM_UP: Int?
        let CAM_DOWN: Int?
        let CAM_MOVE_MODE: Int?
        let CAM_BASE: Int?
    }

    struct Mappings: Codable {
        let vjoy: VJoyMappings?
    }

    let name: String
    let ui: UIConfig?
    let mappings: Mappings?

    var id: String {
        name
    }
}

