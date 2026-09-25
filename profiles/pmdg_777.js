/**
 * PMDG 777 — flight surfaces via vJoy; exterior lights via PMDG SDK L:Vars / events (data/lvars.json).
 */
window.__lvarProfile = "pmdg_777";
window.PROFILE = {
    name: "PMDG 777",
    ui: {
        mobiflight_mip_controls: true,
        mobiflight_skip_lvar_types: ['gear_command', 'spoilers', 'arm_spoilers', 'brakes', 'parking_brake'],
        camera_config: [
            { id: 1, name: "Captain" },
            { id: 2, name: "Left Engine" },
            { id: 3, name: "Left Wing" },
            { id: 4, name: "Right Engine" },
            { id: 5, name: "Right Wing" },
            { id: 6, name: "EFB" },
            { id: 7, name: "FMC" },
            { id: 8, name: "Overhead" },
            { id: 9, name: "MCP" },
            { id: 10, name: "Custom" }
        ],
        flap_detents: [
            { index: 0, label: "UP", val: 0.0 },
            { index: 1, label: "1", val: 0.16 },
            { index: 2, label: "5", val: 0.33 },
            { index: 3, label: "15", val: 0.50 },
            { index: 4, label: "20", val: 0.66 },
            { index: 5, label: "25", val: 0.83 },
            { index: 6, label: "30", val: 1.0 }
        ],
        throttle_detents: [],
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
        }
    },
    mappings: {
        vjoy: {
            PARKING_BRAKE: 1,
            REVERSE_TOGGLE: 2,
            IDLE_BUTTON: 3,
            GEAR_UP: 4,
            GEAR_DOWN: 4,
            CAM_UP: 6,
            CAM_DOWN: 7,
            CAM_MOVE_MODE: 8,
            CAM_BASE: 10
        }
    },
    commands: {
        throttle: (payload) => {
            const reverseBehavior = window.PROFILE?.ui?.reverse_behavior;
            const idleFloor = reverseBehavior?.idle_floor ?? 0.007;
            const idleReverse = reverseBehavior?.idle_rev ?? 0.0065;
            const val = Number(payload.value || 0);
            const reverse = !!payload.reverse;
            const mapped = reverse ? (idleReverse * (1 - val)) : Math.max(val, idleFloor);
            return { ...payload, value: mapped };
        }
    },
    backend: {
        spoiler_formula: (val) => val == 0 ? 0 : (0.33 + val),
        flap_axis_mapping: (val) => (1 - val) * 32767,
        arm_spoiler_value: 0.11
    }
};
