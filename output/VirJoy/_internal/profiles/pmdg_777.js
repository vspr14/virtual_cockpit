window.PROFILE = {
    name: "PMDG 777",
    ui: {
        camera_config: [
            { id: 1, name: "Captain"},
            { id: 2, name: "Left Engine"},
            { id: 3, name: "Left Wing"},
            { id: 4, name: "Right Engine"},
            { id: 5, name: "Right Wing"},
            { id: 6, name: "EFB"},
            { id: 7, name: "FMC"},
            { id: 8, name: "Overhead"},
            { id: 9, name: "MCP"}
        ],
        flap_detents: [
            { index: 0, label: "UP", val: 0.0 },
            { index: 1, label: "1",  val: 0.16 },
            { index: 2, label: "5",  val: 0.33 },
            { index: 3, label: "15", val: 0.50 },
            { index: 4, label: "20", val: 0.66 },
            { index: 5, label: "25", val: 0.83 },
            { index: 6, label: "30", val: 1.0 }
        ]
    },
    mappings: {
        vjoy: {
            PARKING_BRAKE: 1,
            REVERSE_TOGGLE: 2,
            IDLE_BUTTON: 3,
            GEAR_UP: 4,
            GEAR_DOWN: 4,
            CAM_UP: 5,
            CAM_DOWN: 6,
            CAM_MOVE_MODE: 8,
            CAM_BASE: 10
        }
    },
    commands: {},
    backend: {
        spoiler_formula: (val) => val == 0 ? 0 : (0.33 + val),
        flap_axis_mapping: (val) => (1 - val) * 32767,
        arm_spoiler_value: 0.11
    }
};
