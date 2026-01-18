window.PROFILE = {
    name: "Fenix A320",
    ui: {
        camera_config: [
            { id: 1, name: "Captain"},
            { id: 2, name: "Left Engine"},
            { id: 3, name: "Left Wing"},
            { id: 4, name: "Right Engine"},
            { id: 5, name: "Right Wing"},
            { id: 6, name: "EFB"},
            { id: 7, name: "FMC"},
            { id: 8, name: "Overhead"}
        ],
        flap_detents: [
            { index: 0, label: "0", val: 0.0 },
            { index: 1, label: "1",  val: 0.25 },
            { index: 2, label: "2",  val: 0.5 },
            { index: 3, label: "3", val: 0.75 },
            { index: 4, label: "FULL", val: 1 }
        ],
        throttle_detents: [
            { label: "CLB", val: 0.70 },
            { label: "FLX/MCT", val: 0.85 },
            { label: "TO/GA", val: 1 }
        ],
        control_sensitivity: 1,
        control_response: 1.6,
        throttle_detent_snap: 0.05,
        reverse_behavior: {
            spool_down_ms: 0,
            idle_floor: 0.007,
            idle_rev: 0.0065,
            idle_bump_up: 0.05,
            idle_bump_ms: 150,
            idle_bump_down: 0.0005
        },
        arm_spoilers_button: true
    },
    mappings: {
        vjoy: {
            PARKING_BRAKE: 1,
            REVERSE_TOGGLE: 2,
            IDLE_BUTTON: 3,
            ARM_SPOILERS: 35,
            GEAR_UP: 4,
            GEAR_DOWN: 4,
            CAM_UP: 5,
            CAM_DOWN: 6,
            CAM_MOVE_MODE: 8,
            CAM_BASE: 10
        }
    },
    commands: {
        throttle: (payload) => {
            const reverseBehavior = window.PROFILE?.ui?.reverse_behavior;
            const idleFloor = reverseBehavior?.idle_floor ?? 0.007;
            const idleReverse = reverseBehavior?.idle_rev ?? 0.0069;
            const val = Number(payload.value || 0);
            const reverse = !!payload.reverse;
            const mapped = reverse ? (idleReverse * (1 - val)) : Math.max(val, idleFloor);
            return { ...payload, value: mapped };
        }
    },
    backend: {
        spoiler_formula: (val) => val,
        flap_axis_mapping: (val) => (1 - val) * 32767,
        arm_spoiler_value: 0.11
    }
};
