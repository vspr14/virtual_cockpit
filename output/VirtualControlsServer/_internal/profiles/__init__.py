PROFILES = {
    'pmdg_777': {
        'name': 'PMDG 777',
        'backend': {
            'spoiler_formula': lambda val: 0 if val == 0 else (0.33 + val),
            'flap_axis_mapping': lambda val: (1 - val) * 32767,
            'arm_spoiler_value': 0.11
        },
        'handlers': {}
    },
    'pmdg_737': {
        'name': 'PMDG 737',
        'backend': {
            'spoiler_formula': lambda val: 0 if val == 0 else (0.33 + val),
            'flap_axis_mapping': lambda val: (1 - val) * 32767,
            'arm_spoiler_value': 0.11
        },
        'handlers': {}
    },
    'fenix_a320': {
        'name': 'Fenix A320',
        'backend': {
            'spoiler_formula': lambda val: val,
            'flap_axis_mapping': lambda val: (1 - val) * 32767,
            'arm_spoiler_value': 0.11,
            'brake_invert': True,
        },
        'handlers': {}
    },
    'fenix_a350': {
        'name': 'Fenix A350',
        'backend': {
            'spoiler_formula': lambda val: val,
            'flap_axis_mapping': lambda val: (1 - val) * 32767,
            'arm_spoiler_value': 0.11,
            'brake_invert': True,
        },
        'handlers': {}
    },
    'ini_a350': {
        'name': 'iniBuilds A350',
        'backend': {
            'spoiler_formula': lambda val: val,
            'flap_axis_mapping': lambda val: (1 - val) * 32767,
            'arm_spoiler_value': 0.11,
            'brake_axes': ('X',),
            'brake_deadzone': 0.04,
            'brake_gamma': 1.28,
            'brake_axis_max': 0.93,
        },
        'handlers': {}
    }
}

def get_profile(aircraft_name):
    return PROFILES.get(aircraft_name, PROFILES['pmdg_777'])
