"""EnvironmentSpec: validated gas mixtures, local environments and hydrostatic profiles.

Units are SI throughout.  Local chamber frame: +z is "up" (opposite to the effective body
acceleration of a resting chamber on a surface); acceleration vectors are the *effective
body acceleration* felt by the gas, a_eff = g_local - a_chamber (zero in free fall).
"""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from . import SCHEMA_VERSION
from .errors import SimError
from .gasdata import (G0, P_STD, R_U, SPECIES, SPECIES_INFO, mixture_properties, molar_mass,
                      saturation_pressure_co2, saturation_pressure_water)

SUM_TOLERANCE = 1e-6       # |sum - 1| accepted without an explicit normalise action
P_MAX_IDEAL = 2.0e6        # Pa: above this the ideal-gas EOS is flagged as degraded
P_MAX_SUPPORTED = 1.0e7    # Pa: above this the request is rejected
T_MIN, T_MAX = 50.0, 3500.0


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=True)


class Humidity(Strict):
    mode: Literal['none', 'relative_humidity'] = 'none'
    relative_humidity: float | None = Field(None, description='0-1, relative to saturation over liquid water at T')


class Composition(Strict):
    basis: Literal['mole', 'volume', 'mass'] = 'mole'
    species: dict[str, float]
    humidity: Humidity = Humidity()


class Body(Strict):
    name: str = 'custom'
    mu_m3_s2: float
    radius_m: float
    rotation_rate_rad_s: float = 0.0
    reference_gravity_m_s2: float | None = Field(None, description='If set, g(z) = g_ref (R/(R+z))^2 replaces mu/r^2 (USSA76 convention)')
    fictional: bool = False


class Layer(Strict):
    base_altitude_m: float
    lapse_k_per_m: float


class Profile(Strict):
    type: Literal['none', 'layers'] = 'none'
    layers: list[Layer] = []
    geopotential: bool = False
    top_altitude_m: float | None = None
    source: str = ''


class Acceleration(Strict):
    mode: Literal['body', 'explicit', 'rotating', 'free_fall'] = 'explicit'
    vector_m_s2: list[float] = [0.0, 0.0, -G0]
    omega_rad_s: float | None = None
    radius_m: float | None = None


class Boundary(Strict):
    type: Literal['open', 'prescribed_flow', 'sealed'] = 'open'
    volume_m3: float | None = None
    ventilation_m_s: float = 0.0


class EnvironmentSpec(Strict):
    schema_version: str = SCHEMA_VERSION
    kind: Literal['earth_reference', 'mars_reference', 'moon_surface', 'custom_world', 'sealed_chamber',
                  'spacecraft_cabin', 'interplanetary_vacuum', 'accel_lab', 'rotating_habitat']
    name: str = Field('Unnamed environment', max_length=120)
    composition: Composition
    pressure_pa: float
    temperature_k: float
    altitude_m: float = 0.0
    wind_m_s: list[float] = [0.0, 0.0, 0.0]
    acceleration: Acceleration = Acceleration()
    body: Body | None = None
    boundary: Boundary = Boundary()
    profile: Profile = Profile()
    source: str = Field('', max_length=600)
    notes: str = Field('', max_length=600)


# ---------------------------------------------------------------- mixtures
def _finite(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def inspect_mixture(comp: Composition) -> dict:
    """Non-throwing summary used by the live editor: total, residual and per-field problems."""
    problems = []
    if not comp.species:
        problems.append({'code': 'empty_mixture', 'field': 'composition.species', 'message': 'The mixture has no species.'})
    for k, v in comp.species.items():
        if k not in SPECIES:
            problems.append({'code': 'unknown_species', 'field': f'composition.species.{k}', 'message': f'{k} is not in the species registry.'})
        if not _finite(v):
            problems.append({'code': 'non_finite_fraction', 'field': f'composition.species.{k}', 'message': f'{k} fraction must be a finite number.'})
        elif v < 0:
            problems.append({'code': 'negative_fraction', 'field': f'composition.species.{k}', 'message': f'{k} fraction is negative.'})
    vals = [v for v in comp.species.values() if _finite(v)]
    total = math.fsum(vals) if vals else 0.0
    if not problems and total <= 0:
        problems.append({'code': 'empty_mixture', 'field': 'composition.species', 'message': 'All fractions are zero.'})
    return {'basis': comp.basis, 'total': total, 'residual': total - 1.0, 'tolerance': SUM_TOLERANCE,
            'within_tolerance': abs(total - 1.0) <= SUM_TOLERANCE, 'problems': problems}


def normalize_mixture(comp: Composition) -> dict:
    """Explicit user action: scale all fractions by 1/total. Returns before/after."""
    info = inspect_mixture(comp)
    if info['problems']:
        p = info['problems'][0]
        raise SimError(p['code'], p['message'], field=p['field'], recovery='Fix the listed fraction before normalising.')
    after = {k: v / info['total'] for k, v in comp.species.items()}
    return {'before': dict(comp.species), 'after': after, 'scale_factor': 1.0 / info['total'],
            'total_before': info['total'], 'basis': comp.basis}


def resolve_mixture(comp: Composition, T: float, p: float) -> dict:
    """Validate and convert to wet mole fractions. Never renormalises a materially invalid input."""
    info = inspect_mixture(comp)
    if info['problems']:
        q = info['problems'][0]
        raise SimError(q['code'], q['message'], field=q['field'], expected='finite fraction >= 0 of a registered species',
                       recovery='Correct the highlighted entry.')
    if not info['within_tolerance']:
        raise SimError('mixture_not_normalized',
                       f"Fractions sum to {info['total']:.9g} (residual {info['residual']:+.3e}); tolerance is {SUM_TOLERANCE:g}.",
                       field='composition.species', expected='sum = 1 within 1e-6',
                       recovery='Edit the fractions or use the explicit "Normalize mixture" action and review the change.')
    sp = {k: v / info['total'] for k, v in comp.species.items() if v > 0}
    if comp.basis == 'mass':
        n = {k: v / molar_mass(k) for k, v in sp.items()}
        tot = math.fsum(n.values())
        x = {k: v / tot for k, v in n.items()}
    else:  # 'volume' is the ideal-gas volume fraction, identical to mole fraction
        x = dict(sp)
    hum = {'mode': comp.humidity.mode}
    if comp.humidity.mode == 'relative_humidity':
        rh = comp.humidity.relative_humidity
        if rh is None or not _finite(rh) or not 0 <= rh <= 1:
            raise SimError('invalid_humidity', 'Relative humidity must be between 0 and 1.', field='composition.humidity.relative_humidity',
                           expected='0 <= RH <= 1 (fraction)', recovery='Enter RH as a fraction, e.g. 0.4 for 40 %.')
        if x.get('H2O', 0) > 0:
            raise SimError('humidity_double_count', 'The composition already contains H2O while a relative humidity is also specified.',
                           field='composition.humidity', expected='dry composition + RH, or wet composition with humidity mode "none"',
                           recovery='Remove H2O from the dry composition or set humidity mode to "none".')
        psat = saturation_pressure_water(T)
        if psat is None:
            raise SimError('humidity_out_of_range', f'Saturation pressure over liquid water is only available for 273.16-647 K (T = {T} K).',
                           field='temperature_k', recovery='Use humidity mode "none" and enter the H2O fraction explicitly.')
        if p <= 0:
            raise SimError('humidity_in_vacuum', 'Relative humidity is undefined at zero pressure.', field='pressure_pa')
        xw = rh * psat / p
        if xw >= 1:
            raise SimError('humidity_exceeds_pressure', f'Water partial pressure {rh*psat:.1f} Pa is not below total pressure {p:.1f} Pa.',
                           field='composition.humidity.relative_humidity', recovery='Lower RH or temperature, or raise pressure.')
        x = {k: v * (1 - xw) for k, v in x.items()}
        if xw > 0:
            x['H2O'] = xw
        hum.update(relative_humidity=rh, saturation_pressure_pa=psat, water_mole_fraction=xw,
                   rule='x_H2O = RH * p_sat(T) / p ; dry fractions scaled by (1 - x_H2O)')
    return {'mole_fractions': x, 'submitted': dict(comp.species), 'submitted_basis': comp.basis,
            'sum_submitted': info['total'], 'humidity': hum}


# ---------------------------------------------------------------- environments
def body_gravity(body: Body, z: float) -> float:
    r = body.radius_m + z
    if body.reference_gravity_m_s2 is not None:
        return body.reference_gravity_m_s2 * (body.radius_m / r) ** 2
    return body.mu_m3_s2 / (r * r)


def effective_acceleration(spec: EnvironmentSpec) -> dict:
    a = spec.acceleration
    if a.mode == 'free_fall':
        return {'vector_m_s2': [0.0, 0.0, 0.0], 'magnitude_m_s2': 0.0, 'model': 'Free fall: gravitational and inertial acceleration cancel in the chamber frame; gravity gradient and residual accelerations are not modelled.'}
    if a.mode == 'body':
        if spec.body is None:
            raise SimError('missing_body', 'Acceleration mode "body" needs body.mu_m3_s2 and body.radius_m.', field='body')
        g = body_gravity(spec.body, spec.altitude_m)
        return {'vector_m_s2': [0.0, 0.0, -g], 'magnitude_m_s2': g,
                'model': ('g = g_ref (R / r)^2 with the stated reference surface gravity g_ref (effective gravity at the reference latitude)' if spec.body.reference_gravity_m_s2 is not None
                          else 'g = mu / r^2 (spherical body; the centrifugal reduction from body rotation and oblateness are omitted)')}
    if a.mode == 'rotating':
        if not (a.omega_rad_s and a.radius_m) or a.omega_rad_s <= 0 or a.radius_m <= 0:
            raise SimError('invalid_rotation', 'Rotating habitat needs omega_rad_s > 0 and radius_m > 0.', field='acceleration')
        if a.omega_rad_s > 2 * math.pi:
            raise SimError('unsupported_rotation', 'Spin rates above 1 rev/s are outside the supported envelope (Coriolis terms dominate; they are not solved).',
                           field='acceleration.omega_rad_s', expected='<= 6.283 rad/s')
        g = a.omega_rad_s ** 2 * a.radius_m
        return {'vector_m_s2': [0.0, 0.0, -g], 'magnitude_m_s2': g, 'coriolis_per_unit_speed_1_s': 2 * a.omega_rad_s,
                'model': 'Centrifugal a = omega^2 r toward the outer floor. Coriolis (2 omega x u) and Euler terms are NOT included in the supported flame solvers; ratio 2 omega U / (omega^2 r) is reported as an applicability indicator.'}
    v = a.vector_m_s2
    if len(v) != 3 or not all(_finite(c) for c in v):
        raise SimError('invalid_acceleration', 'Acceleration vector needs three finite components.', field='acceleration.vector_m_s2', expected='[ax, ay, az] in m/s^2')
    return {'vector_m_s2': list(map(float, v)), 'magnitude_m_s2': math.sqrt(sum(c * c for c in v)), 'model': 'User-specified effective body acceleration'}


def evaluate_environment(spec: EnvironmentSpec) -> dict:
    """Validate an EnvironmentSpec and derive SI properties, flags and applicability."""
    T, p = spec.temperature_k, spec.pressure_pa
    if not _finite(T) or T <= 0 or (spec.pressure_pa != 0 and not T_MIN <= T <= T_MAX):
        raise SimError('temperature_out_of_range', f'Temperature must be {T_MIN}-{T_MAX} K.', field='temperature_k', expected=f'{T_MIN} <= T <= {T_MAX} K')
    if not _finite(p) or p < 0:
        raise SimError('invalid_pressure', 'Absolute pressure must be a finite value >= 0 Pa.', field='pressure_pa', expected='>= 0 Pa (absolute)')
    if p > P_MAX_SUPPORTED:
        raise SimError('unsupported_state', f'Pressure above {P_MAX_SUPPORTED:.0e} Pa needs a real-gas equation of state, which is not implemented.',
                       field='pressure_pa', expected=f'<= {P_MAX_SUPPORTED:.0e} Pa', recovery='Lower the pressure.')
    for name, vec in (('wind_m_s', spec.wind_m_s),):
        if len(vec) != 3 or not all(_finite(c) for c in vec):
            raise SimError('invalid_vector', f'{name} needs three finite components.', field=name)
    if not _finite(spec.altitude_m):
        raise SimError('invalid_altitude', 'Altitude must be finite.', field='altitude_m')
    if spec.body is not None and (not _finite(spec.body.mu_m3_s2) or spec.body.mu_m3_s2 <= 0 or not _finite(spec.body.radius_m) or spec.body.radius_m <= 0):
        raise SimError('invalid_body', 'Body mu and radius must be positive.', field='body')
    warnings = []
    acc = effective_acceleration(spec)
    if p == 0:
        mix = None
        if spec.composition.species and inspect_mixture(spec.composition)['problems']:
            q = inspect_mixture(spec.composition)['problems'][0]
            raise SimError(q['code'], q['message'], field=q['field'])
        props = {'vacuum': True, 'density_kg_m3': 0.0}
        warnings.append('Zero pressure: continuum gas properties (sound speed, Mach, viscosity) are unavailable, not zero.')
        x = {}
    else:
        mix = resolve_mixture(spec.composition, T, p)
        x = mix['mole_fractions']
        props = mixture_properties(x, T, p)
        if p > P_MAX_IDEAL:
            warnings.append(f'Pressure above {P_MAX_IDEAL:.0e} Pa: ideal-gas properties are degraded; no real-gas correction is applied.')
        pw = x.get('H2O', 0) * p
        ps = saturation_pressure_water(T)
        if ps is not None and pw > ps * (1 + 1e-9):
            raise SimError('condensing_state', f'Water partial pressure {pw:.1f} Pa exceeds saturation {ps:.1f} Pa at {T} K: the mixture would condense.',
                           field='composition.species.H2O', recovery='Reduce H2O, raise temperature, or lower pressure. Two-phase states are not modelled.')
        if ps is None and T < 273.16 and x.get('H2O', 0) > 1e-4:
            warnings.append('Below 273.16 K the frost point is not checked; water vapour may deposit as ice.')
        pc = x.get('CO2', 0) * p
        pcs = saturation_pressure_co2(T)
        if pcs is not None and pc > pcs:
            raise SimError('condensing_state', f'CO2 partial pressure {pc:.0f} Pa exceeds its saturation pressure {pcs:.0f} Pa at {T} K.',
                           field='composition.species.CO2', recovery='Two-phase CO2 is not modelled; change T, p or composition.')
        if props['mean_free_path_m'] > 1e-3:
            warnings.append(f"Mean free path {props['mean_free_path_m']:.2e} m: rarefied gas. Continuum transport and flame models are not applicable at laboratory scales.")
    if spec.kind == 'moon_surface':
        warnings.append('Moon: the surface-boundary exosphere (order 1e-10 Pa) is treated as vacuum. No atmosphere, wind, or ambient oxidizer exists.')
    if spec.kind == 'custom_world' and spec.body and spec.body.fictional:
        warnings.append('Fictional body: used as a local-environment sandbox only. It is not inserted into the real Solar System ephemerides.')
    out = {'schema_version': SCHEMA_VERSION, 'kind': spec.kind, 'name': spec.name,
           'state': {'pressure_pa': p, 'temperature_k': T, 'altitude_m': spec.altitude_m},
           'mixture': mix, 'properties': props, 'acceleration': acc, 'wind_m_s': spec.wind_m_s,
           'boundary': spec.boundary.model_dump(), 'warnings': warnings,
           'equation_of_state': 'ideal gas: rho = p M_mix / (R_u T), R_u = %.10g J/(mol K)' % R_U,
           'property_source': 'Cantera NASA-7 thermodynamics and mixture-averaged transport (GRI-Mech 3.0 species data; He from nasa_gas.yaml + CHEMKIN LJ parameters)',
           'oxygen': None if not x else {'mole_fraction': x.get('O2', 0.0), 'partial_pressure_pa': x.get('O2', 0.0) * p}}
    return out


# ---------------------------------------------------------------- hydrostatic profile
def hydrostatic_profile(spec: EnvironmentSpec, top_m: float | None = None, n: int = 120) -> dict:
    """Integrate dp/dz = -rho g with g = mu/r^2 and a layered temperature profile.

    Composition is held uniform (valid below the homopause only).  When ``geopotential`` is
    set the layer table is in geopotential altitude H = R z / (R + z) with constant g0 = mu/R^2,
    as in the U.S. Standard Atmosphere 1976.
    """
    if spec.pressure_pa <= 0:
        raise SimError('no_atmosphere', 'A vacuum environment has no hydrostatic profile.', field='pressure_pa')
    if spec.body is None:
        raise SimError('missing_body', 'A hydrostatic profile needs body mu and radius.', field='body')
    prof = spec.profile
    layers = sorted(prof.layers, key=lambda l: l.base_altitude_m) if prof.type == 'layers' else []
    if not layers:
        layers = [Layer(base_altitude_m=0.0, lapse_k_per_m=0.0)]
    if layers[0].base_altitude_m > 0:
        layers.insert(0, Layer(base_altitude_m=0.0, lapse_k_per_m=0.0))
    x = resolve_mixture(spec.composition, spec.temperature_k, spec.pressure_pa)['mole_fractions']
    M = sum(v * molar_mass(k) for k, v in x.items())
    mu, R = spec.body.mu_m3_s2, spec.body.radius_m
    g_surf = body_gravity(spec.body, 0.0)
    top = top_m or prof.top_altitude_m or 80000.0
    if not 0 < top <= 2.0e5:
        raise SimError('invalid_profile_top', 'Profile top must be within (0, 200 km].', field='profile.top_altitude_m')

    def coord(z):
        return R * z / (R + z) if prof.geopotential else z

    def temp(z):
        h, T = coord(z), spec.temperature_k
        for i, l in enumerate(layers):
            nxt = layers[i + 1].base_altitude_m if i + 1 < len(layers) else math.inf
            T += l.lapse_k_per_m * (min(h, nxt) - l.base_altitude_m)
            if h <= nxt:
                break
        return T

    def dlnp(z):
        T = temp(z)
        if T <= 0:
            raise SimError('invalid_profile', f'Temperature profile reaches {T:.1f} K at {z:.0f} m.', field='profile.layers',
                           recovery='Reduce the lapse rates or the profile top.')
        return -M * body_gravity(spec.body, z) / (R_U * T)

    zs, Ts, ps, rhos, gs = [], [], [], [], []
    lnp, steps_per = math.log(spec.pressure_pa), 40
    dz = top / (n - 1) / steps_per
    z = 0.0
    for i in range(n):
        T = temp(z); pz = math.exp(lnp)
        zs.append(z); Ts.append(T); ps.append(pz); rhos.append(pz * M / (R_U * T)); gs.append(body_gravity(spec.body, z))
        if i == n - 1:
            break
        for _ in range(steps_per):  # classical RK4 in ln p
            k1 = dlnp(z); k2 = dlnp(z + dz / 2); k4 = dlnp(z + dz)
            lnp += dz * (k1 + 4 * k2 + k4) / 6
            z += dz
    return {'altitude_m': zs, 'temperature_k': Ts, 'pressure_pa': ps, 'density_kg_m3': rhos, 'gravity_m_s2': gs,
            'molar_mass_kg_mol': M, 'surface_gravity_m_s2': g_surf,
            'pressure_scale_height_surface_m': R_U * spec.temperature_k / (M * g_surf),
            'model': 'dp/dz = -rho g(r), g = mu/r^2, rho = p M/(R_u T(z)); uniform composition; RK4 in ln p',
            'geopotential_layers': prof.geopotential, 'source': prof.source,
            'applicability': 'Uniform composition below the homopause; no weather, diurnal or seasonal variation; not valid above the stated top altitude.'}


# ---------------------------------------------------------------- presets
EARTH = Body(name='Earth', mu_m3_s2=3.986004418e14, radius_m=6356766.0, rotation_rate_rad_s=7.2921159e-5, reference_gravity_m_s2=G0)
MARS = Body(name='Mars', mu_m3_s2=4.282837e13, radius_m=3389500.0, rotation_rate_rad_s=7.088218e-5)
MOON = Body(name='Moon', mu_m3_s2=4.9028e12, radius_m=1737400.0, rotation_rate_rad_s=2.6617e-6)
DRY_AIR = {'N2': 0.780870, 'O2': 0.209476, 'Ar': 0.009340, 'CO2': 0.000314}
MARS_AIR_RAW = {'CO2': 0.951, 'N2': 0.0259, 'Ar': 0.0194, 'O2': 0.0016, 'CO': 0.0006}
_ms = sum(MARS_AIR_RAW.values())
MARS_AIR = {k: v / _ms for k, v in MARS_AIR_RAW.items()}


def presets() -> list[dict]:
    P = []

    def add(**kw):
        P.append(EnvironmentSpec(**kw).model_dump())

    add(kind='earth_reference', name='Earth sea level (U.S. Standard Atmosphere 1976)', composition=Composition(species=DRY_AIR),
        pressure_pa=P_STD, temperature_k=288.15, acceleration=Acceleration(mode='body'), body=EARTH,
        profile=Profile(type='layers', geopotential=True, top_altitude_m=84852.0,
                        layers=[Layer(base_altitude_m=h, lapse_k_per_m=l) for h, l in
                                ((0, -0.0065), (11000, 0.0), (20000, 0.001), (32000, 0.0028), (47000, 0.0), (51000, -0.0028), (71000, -0.002))],
                        source='U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF), layers 0-84.852 km geopotential'),
        source='U.S. Standard Atmosphere 1976 sea-level state and dry-air composition; trace gases (about 3e-5) lumped into N2. Body radius 6356.766 km and g0 = 9.80665 m/s^2 are the USSA76 geopotential conventions.')
    add(kind='mars_reference', name='Mars surface (NASA Glenn curve-fit reference)', composition=Composition(species=MARS_AIR),
        pressure_pa=699.0, temperature_k=242.15, acceleration=Acceleration(mode='body'), body=MARS,
        profile=Profile(type='layers', top_altitude_m=60000.0,
                        layers=[Layer(base_altitude_m=0, lapse_k_per_m=-0.000998), Layer(base_altitude_m=7000, lapse_k_per_m=-0.00222)],
                        source='NASA Glenn "Mars Atmosphere Model" temperature fit (Mars Global Surveyor data, 1996); rough estimate only'),
        source='Surface p/T: NASA Glenn Mars Atmosphere Model. Composition: NASA Mars Fact Sheet volume fractions (sum 0.9985) explicitly normalised to 1. Real Mars varies about 400-870 Pa with season and site.')
    add(kind='moon_surface', name='Moon surface (vacuum approximation)', composition=Composition(species={}), pressure_pa=0.0,
        temperature_k=250.0, acceleration=Acceleration(mode='body'), body=MOON,
        source='NASA Moon Fact Sheet: surface-boundary exosphere of order 3e-10 Pa is approximated as vacuum. Temperature is a nominal placeholder; lunar surface temperature varies roughly 95-390 K.')
    add(kind='spacecraft_cabin', name='Spacecraft cabin, sea-level air, free fall', composition=Composition(species={'N2': 0.79, 'O2': 0.21}),
        pressure_pa=P_STD, temperature_k=295.15, acceleration=Acceleration(mode='free_fall'),
        boundary=Boundary(type='sealed', volume_m3=1.0e-3, ventilation_m_s=0.1),
        source='Nominal 101.3 kPa, 21 % O2 cabin; ventilation 0.1 m/s is an adjustable default, not a measured value.')
    add(kind='sealed_chamber', name='Sealed laboratory chamber on Earth', composition=Composition(species={'N2': 0.79, 'O2': 0.21}),
        pressure_pa=P_STD, temperature_k=295.15, acceleration=Acceleration(mode='explicit', vector_m_s2=[0, 0, -G0]),
        boundary=Boundary(type='sealed', volume_m3=1.0e-3), source='User laboratory default.')
    add(kind='interplanetary_vacuum', name='Interplanetary vacuum', composition=Composition(species={}), pressure_pa=0.0,
        temperature_k=3.0, acceleration=Acceleration(mode='free_fall'),
        source='Idealised vacuum; the tenuous solar-wind plasma is neglected. Temperature is a nominal placeholder with no thermodynamic meaning at zero density.')
    add(kind='accel_lab', name='Constant-acceleration laboratory (2 g)', composition=Composition(species={'N2': 0.79, 'O2': 0.21}),
        pressure_pa=P_STD, temperature_k=295.15, acceleration=Acceleration(mode='explicit', vector_m_s2=[0, 0, -2 * G0]),
        source='User-defined effective acceleration.')
    add(kind='rotating_habitat', name='Rotating habitat (2 rpm, r = 224 m)', composition=Composition(species={'N2': 0.79, 'O2': 0.21}),
        pressure_pa=P_STD, temperature_k=295.15, acceleration=Acceleration(mode='rotating', omega_rad_s=2 * math.pi * 2 / 60, radius_m=224.0),
        boundary=Boundary(type='sealed', volume_m3=1.0), source='Hypothetical habitat; centrifugal acceleration only.')
    add(kind='custom_world', name='Custom world (edit me)', composition=Composition(species={'N2': 0.70, 'O2': 0.25, 'Ar': 0.05}),
        pressure_pa=80000.0, temperature_k=280.0, acceleration=Acceleration(mode='body'),
        body=Body(name='Fictional world', mu_m3_s2=3.0e14, radius_m=6.0e6, rotation_rate_rad_s=6.0e-5, fictional=True),
        profile=Profile(type='layers', top_altitude_m=50000.0, layers=[Layer(base_altitude_m=0, lapse_k_per_m=-0.005), Layer(base_altitude_m=12000, lapse_k_per_m=0.0)],
                        source='User-defined'), source='Fictional example; all values user-defined.')
    return P


def registry() -> dict:
    return {'species': [{'id': k, 'label': SPECIES_INFO[k], 'molar_mass_kg_mol': molar_mass(k)} for k in SPECIES],
            'sum_tolerance': SUM_TOLERANCE, 'bases': ['mole', 'volume', 'mass'],
            'unit_rules': {'pressure': 'Pa absolute (1 atm = 101325 Pa, 1 bar = 1e5 Pa, 1 psi = 6894.757 Pa, 1 Torr = 133.322 Pa)',
                           'temperature': 'K (K = degC + 273.15)', 'fractions': '0-1; "volume" means ideal-gas volume fraction = mole fraction',
                           'acceleration': 'm/s^2 (1 g0 = 9.80665 m/s^2)', 'wind': 'm/s in the local frame (x east, y north, z up)'},
            'limits': {'temperature_k': [T_MIN, T_MAX], 'pressure_pa': [0, P_MAX_SUPPORTED], 'ideal_gas_flag_above_pa': P_MAX_IDEAL}}
