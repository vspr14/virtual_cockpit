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
            'arm_spoiler_value': 0.11
        },
        'handlers': {}
    }
}

def get_profile(aircraft_name):
    return PROFILES.get(aircraft_name, PROFILES['pmdg_777'])
