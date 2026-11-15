"""Single source of truth for what SOLARIS 5.0 can and cannot compute (served at /api/v5/capabilities)."""
from .gasdata import MECHANISMS

STATUS = ('IMPLEMENTED', 'PARTIAL', 'ILLUSTRATIVE', 'NOT IMPLEMENTED')

FIDELITY_LEVELS = [
    {'level': 0, 'name': 'Conceptual illustration', 'status': 'ILLUSTRATIVE',
     'summary': 'Legacy Cosmic Flame Lab comparative shapes. Educational only; never a prediction.'},
    {'level': 1, 'name': 'Thermochemistry and reactors', 'status': 'IMPLEMENTED',
     'summary': 'Cantera equilibrium (HP/UV/TP) and homogeneous constant-pressure / constant-volume reactors with detailed kinetics.'},
    {'level': 2, 'name': '1-D reference flames', 'status': 'IMPLEMENTED',
     'summary': 'Cantera freely propagating premixed flame and counterflow diffusion flame with grid refinement and convergence reporting.'},
    {'level': 3, 'name': 'Transient 2-D reacting flow', 'status': 'IMPLEMENTED',
     'summary': 'SOLARIS low-Mach variable-density laminar solver, axisymmetric or planar, CH4 or H2 jet with one-step chemistry, open or sealed, steady or time-varying acceleration.'},
    {'level': 4, 'name': '3-D research CFD', 'status': 'NOT IMPLEMENTED',
     'summary': 'No 3-D reacting-flow solver is included. No 3-D flame result is produced or implied.'},
]

MATRIX = [
    ('World Builder', 'Gas-mixture editor (mole/volume/mass basis, dry/wet humidity, explicit normalisation)', 'IMPLEMENTED', 'Ideal-gas mixtures of N2, O2, Ar, CO2, H2O, He, H2, CH4, CO.'),
    ('World Builder', 'Mixture thermodynamic and transport properties', 'IMPLEMENTED', 'Cantera NASA-7 thermo and mixture-averaged transport; ideal gas; 50-3500 K.'),
    ('World Builder', 'Hydrostatic atmosphere profiles', 'IMPLEMENTED', 'Layered temperature profile, inverse-square gravity, uniform composition; no weather, no photochemistry.'),
    ('World Builder', 'Earth / Mars reference atmospheres', 'IMPLEMENTED', 'Earth: US Standard Atmosphere 1976 layers to 86 km. Mars: simplified mean surface state with single lapse rate (approximation).'),
    ('World Builder', 'Moon surface', 'PARTIAL', 'Treated as vacuum (surface-bounded exosphere is not a continuum gas). Combustion only inside a pressurised chamber.'),
    ('World Builder', 'Custom world (local sandbox)', 'IMPLEMENTED', 'User mass, radius, composition, pressure, temperature; hydrostatic profile. No climate or habitability claims.'),
    ('World Builder', 'Custom world inserted into Solar-System dynamics', 'NOT IMPLEMENTED', 'Custom bodies are local sandboxes only; they do not perturb ephemerides.'),
    ('World Builder', 'Constant-acceleration lab and rotating habitat', 'PARTIAL', 'Uniform effective acceleration incl. centripetal term at one radius; Coriolis effects on the flame are not modelled.'),
    ('Flame Laboratory', 'Equilibrium and homogeneous reactors (Level 1)', 'IMPLEMENTED', 'GRI-Mech 3.0 (+He inert) or h2o2; CH4, H2, CO fuels.'),
    ('Flame Laboratory', '1-D premixed and counterflow flames (Level 2)', 'IMPLEMENTED', 'Steady, adiabatic, no radiation or soot; non-convergence reported as such.'),
    ('Flame Laboratory', 'Transient 2-D jet flame, open or sealed (Level 3)', 'IMPLEMENTED', 'Laminar, one-step chemistry (CH4 or H2), optional optically-thin gray loss; first-order time accuracy; budget residuals reported.'),
    ('Flame Laboratory', 'Liquid / solid fuels, soot, detailed radiation, turbulence', 'NOT IMPLEMENTED', 'No droplet, wick, pyrolysis, soot or turbulence model.'),
    ('Flame Laboratory', 'Flammability / extinction limits', 'NOT IMPLEMENTED', 'No universal oxygen threshold is used. A run is classified only for its own resolved conditions.'),
    ('Flame Laboratory', '3-D reacting flow (Level 4)', 'NOT IMPLEMENTED', 'Not available.'),
    ('Flame Laboratory', 'Legacy Cosmic Flame Lab', 'ILLUSTRATIVE', 'Level 0 comparative illustration, clearly labelled.'),
    ('Flight Laboratory', 'Legacy Saturn V ascent baseline', 'IMPLEMENTED', 'Original physics.mjs unchanged: 3-DOF, RK4, approximate atmosphere/aero, programmed pitch. Reproducible regression baseline, not a certified reconstruction.'),
    ('Flight Laboratory', 'General N-body propagation with JPL ephemerides', 'IMPLEMENTED', 'Translational 3-DOF, adaptive Dormand-Prince 5(4), Sun + planets + Moon point masses from a cached JPL Horizons (DE441) table 2026-2032, Earth J2 optional.'),
    ('Flight Laboratory', 'Finite burns, staging, mass and delta-v accounting, events', 'IMPLEMENTED', 'Constant-thrust/Isp engines, attitude laws (prograde, retrograde, inertial-fixed), bisection event location.'),
    ('Flight Laboratory', 'Atmospheric drag with rotating atmosphere and wind', 'PARTIAL', 'Exponential/USSA76 density, constant ballistic coefficient, co-rotating atmosphere + uniform wind. No lift, no aero-heating certification.'),
    ('Flight Laboratory', 'Lambert transfer planning', 'IMPLEMENTED', 'Single-revolution universal-variable Lambert solver for initial guesses; verified by propagation.'),
    ('Flight Laboratory', '6-DOF rigid-body dynamics', 'PARTIAL', 'Torque-free and thrust-vector-offset rigid body with quaternion attitude for the hypothetical demonstrator only. No aerodynamic moments, slosh or flexible modes.'),
    ('Flight Laboratory', 'Solar radiation pressure, relativity, non-spherical gravity beyond Earth J2', 'NOT IMPLEMENTED', 'Not modelled.'),
    ('Flight Laboratory', 'Landing, re-entry heating, guidance optimisation', 'NOT IMPLEMENTED', 'Not modelled.'),
    ('Coupling', 'Flight -> sealed chamber one-way coupling', 'IMPLEMENTED', 'Vehicle specific force (and rotation terms) mapped to chamber frame and applied as time-varying body acceleration in Level 3.'),
    ('Coupling', 'Two-way coupling (chamber affects vehicle)', 'NOT IMPLEMENTED', 'Chamber mass/energy does not act on the vehicle.'),
    ('Coupling', 'g-jitter / vibration spectra', 'NOT IMPLEMENTED', 'Only the rigid-body quasi-steady acceleration is transferred.'),
    ('Evidence', 'Simulation Passport, run manifests, hashes, exports', 'IMPLEMENTED', 'Every stored run carries model, assumptions, numerics, versions, input hash and benchmark status.'),
    ('Evidence', 'NASA experiment source browsing (SOLARIS 4.0)', 'IMPLEMENTED', 'Unchanged source CSVs; comparisons are regime-level only unless geometry and conditions match.'),
    ('Evidence', 'Validation of generated flame fields against NASA measurements', 'NOT IMPLEMENTED', 'The bundled NASA tables do not contain matching field data; no such validation is claimed.'),
]


def _registry():
    try:
        from .environment import registry
    except ImportError:
        from sim.environment import registry
    return registry()['species']


def capabilities() -> dict:
    return {'fidelity_levels': FIDELITY_LEVELS, 'statuses': STATUS,
            'matrix': [{'area': a, 'capability': c, 'status': s, 'limits': l} for a, c, s, l in MATRIX],
            'mechanisms': MECHANISMS,
            'level3_fuels': ['CH4', 'H2'],
            'species': ['N2', 'O2', 'Ar', 'CO2', 'H2O', 'He', 'H2', 'CH4', 'CO'],
            'species_registry': _registry()}
