"""Verification benchmarks. `python -m backend.sim.benchmarks` executes all of them and writes
docs/v5/benchmark_report.json, which the Simulation Passport reads.  A benchmark is listed as
PASS only when it was actually executed in this installation and met its tolerance."""
from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .chemistry import CounterflowSpec, EquilibriumSpec, Mixing, PremixedFlameSpec, ReactorSpec, counterflow_flame, equilibrium, premixed_flame, reactor
from .coupling import Chamber, FlightExcerpt, FlightSample, chamber_history
from .environment import Composition, EnvironmentSpec, hydrostatic_profile, presets
from .lowmach import RU_K, Ambient, Burner, FlameL3Spec, Ignition, Numerics, Solver

AIR = Composition(species={'N2': 0.79, 'O2': 0.21})
OUT = Path(__file__).resolve().parents[2] / 'docs' / 'v5' / 'benchmark_report.json'


def _b(title, metric, value, tol, ok, reference, **extra):
    return {'title': title, 'metric': metric, 'value': value, 'tolerance': tol, 'status': 'PASS' if ok else 'FAIL', 'reference': reference, **extra}


def env_ussa76():
    earth = next(p for p in presets() if p['kind'] == 'earth_reference')
    prof = hydrostatic_profile(EnvironmentSpec.model_validate(earth), 30000.0, 301)
    z = np.array(prof['altitude_m']); p = np.array(prof['pressure_pa'])
    ref = {11000.0: 22632.06, 20000.0: 5474.889, 30000.0: 1197.03}   # US Standard Atmosphere 1976, geopotential-based table values at geometric altitude
    r0 = 6356766.0
    err = max(abs(float(np.interp(r0 * k / (r0 - k), z, p)) / v - 1) for k, v in ref.items())
    return _b('Hydrostatic integration reproduces US Standard Atmosphere 1976 pressures', 'max relative pressure error at 11, 20, 30 km', err, 0.01, err < 0.01,
              'NOAA/NASA/USAF, U.S. Standard Atmosphere, 1976 (pressures at 11/20/30 km geopotential; geometric/geopotential difference < 0.5 % included in tolerance)')


def l1_equilibrium():
    r = equilibrium(EquilibriumSpec(oxidizer=Composition(species={'N2': 0.79, 'O2': 0.21}), temperature_k=298.15))
    T = r['final']['temperature_k']
    return _b('Adiabatic flame temperature, stoichiometric CH4/air, 298.15 K, 1 atm', 'T_ad [K]', T, '2226 +/- 15 K', abs(T - 2226) < 15,
              'S. R. Turns, An Introduction to Combustion, 3rd ed., Table 2.1 lists about 2226 K for CH4/air (air as 79/21 N2/O2)')


def l1_elements():
    r = equilibrium(EquilibriumSpec(oxidizer=AIR, mixing=Mixing(value=1.3)))
    v = r['checks']['max_element_mass_fraction_change']
    return _b('Element conservation through equilibrium solve', 'max |delta element mass fraction|', v, 1e-9, v < 1e-9, 'Exact conservation law')


def l1_reactor():
    r = reactor(ReactorSpec(oxidizer=AIR, temperature_k=1200.0, duration_s=0.5))
    v = max(r['checks']['max_element_mass_fraction_change'], abs(r['checks']['mass_change_kg']))
    return _b('Mass and element conservation in constant-pressure reactor with ignition', 'max conservation error', v, 1e-8, v < 1e-8 and r['ignition']['detected'], 'Exact conservation law')


def l2_sl_ch4():
    r = premixed_flame(PremixedFlameSpec(oxidizer=AIR))
    s = r.get('laminar_burning_velocity_m_s') or float('nan')
    return _b('Laminar burning velocity, stoichiometric CH4/air, 300 K, 1 atm (GRI-Mech 3.0)', 'S_L [m/s]', s, '0.33-0.42', r['status'] == 'completed' and 0.33 <= s <= 0.42,
              'Measured values cluster around 0.36-0.40 m/s (e.g. Vagelopoulos & Egolfopoulos, Proc. Combust. Inst. 27 (1998) 513); GRI-Mech 3.0 is known to give about 0.38 m/s',
              grid_points=r.get('checks', {}).get('grid_points'))


def l2_sl_h2():
    r = premixed_flame(PremixedFlameSpec(oxidizer=AIR, fuel=Composition(species={'H2': 1.0}), mechanism='h2o2'))
    s = r.get('laminar_burning_velocity_m_s') or float('nan')
    return _b('Laminar burning velocity, stoichiometric H2/air, 300 K, 1 atm', 'S_L [m/s]', s, '1.9-2.6', r['status'] == 'completed' and 1.9 <= s <= 2.6,
              'Measured values about 2.1-2.4 m/s near stoichiometric (e.g. Tse, Zhu & Law, Proc. Combust. Inst. 28 (2000) 1793)')


def l2_counterflow():
    r = counterflow_flame(CounterflowSpec(oxidizer=AIR))
    n = counterflow_flame(CounterflowSpec(oxidizer=Composition(species={'N2': 1.0})))
    T = r.get('peak_temperature_k') or float('nan')
    ok = r['status'] == 'completed' and r.get('solution_branch') == 'reacting' and 1700 < T < 2300 and n['status'] != 'completed' or n.get('solution_branch') != 'reacting'
    return _b('Counterflow CH4/air diffusion flame: reacting branch found; N2-only oxidizer yields no reacting solution', 'peak T [K]', T, '1700-2300 K and no flame without O2', bool(ok),
              'Internal consistency (peak below adiabatic stoichiometric temperature; oxidizer-free control)')


def _quiet(**kw):
    base = dict(ambient=Ambient(composition=AIR), burner=Burner(fuel_velocity_m_s=0.0, fuel=Composition(species={'N2': 1.0})), ignition=Ignition(enabled=False),
                acceleration_axial_m_s2=0.0, reaction_enabled=False)
    base.update(kw)
    return FlameL3Spec(**base)


GHIA_Y = [0.0547, 0.0625, 0.0703, 0.1016, 0.1719, 0.2813, 0.4531, 0.5, 0.6172, 0.7344, 0.8516, 0.9531, 0.9609, 0.9688, 0.9766]
GHIA_U = [-0.03717, -0.04192, -0.04775, -0.06434, -0.10150, -0.15662, -0.21090, -0.20581, -0.13641, 0.00332, 0.23151, 0.68717, 0.73722, 0.78871, 0.84123]


def l3_cavity(n=48):
    L = 0.01
    s = Solver(_quiet(geometry='planar', boundary='sealed', length_m=L, width_m=L, lid_velocity_m_s=1.0, numerics=Numerics(nx=n, ny=n, duration_s=10, output_interval_s=10)))
    s._prep()
    mu, _, _ = s.gm.transport(s.T, s.Y * s.gm.molar_mass(s.Y)[None] / s.gm.W[:, None, None], s.p0)
    nu = float(mu[0, 0] / s.rho[0, 0]); U = 100 * nu / L
    s.spec = s.spec.model_copy(update={'lid_velocity_m_s': U})
    T_end = 30 * L / U
    prev = None
    while s.t < T_end:
        s.advance()
        if s.step % 200 == 0:
            vc = s.v.copy()
            if prev is not None and np.abs(vc - prev).max() < 1e-6 * U: break
            prev = vc
    j = n // 2                                   # v at the y-face on the centreline (y = 0), as function of x
    prof = s.v[:, j] / U
    err = float(np.max(np.abs(np.interp(np.array(GHIA_Y) * L, s.xc, prof) - np.array(GHIA_U))))
    return _b(f'Lid-driven cavity, Re = 100, {n}x{n} grid: centreline velocity profile', 'max |u/U - Ghia|', err, 0.03, err < 0.03,
              'Ghia, Ghia & Shin, J. Comput. Phys. 48 (1982) 387-411, Table I', time_reached_s=s.t, steps=s.step)


def l3_diffusion(n=40):
    L = 0.02; eps = 5.0
    s = Solver(_quiet(geometry='planar', boundary='sealed', length_m=L, width_m=L / 4, burner=Burner(fuel_velocity_m_s=0.0, radius_m=0.001, fuel=Composition(species={'N2': 1.0})), numerics=Numerics(nx=n, ny=8, duration_s=1, output_interval_s=1)))
    s._prep()
    s.T = 300.0 + eps * np.cos(math.pi * s.xc / L)[:, None] * np.ones((1, 8)); s.rho = s._rho(s.T, s.Y)
    cp = float(np.sum(s.gm.cp_h(np.array([300.0]))[0][:, 0] * s.Ya))
    _, lam, _ = s.gm.transport(np.array([300.0]), (s.Ya * s.gm.molar_mass(s.Ya) / s.gm.W)[:, None], s.p0)
    alpha = float(lam[0]) / (s.rho_amb * cp)
    t_end = 0.5 * L ** 2 / (math.pi ** 2 * alpha)
    while s.t < t_end: s.advance(t_end - s.t)
    amp = float(2 * np.mean((s.T[:, 0] - 300.0) * np.cos(math.pi * s.xc / L)))
    exact = eps * math.exp(-alpha * math.pi ** 2 * s.t / L ** 2)
    err = abs(amp / exact - 1)
    return _b('Decay of a thermal cosine mode between adiabatic walls (pure conduction at constant pressure)', 'relative amplitude error', err, 0.02, err < 0.02,
              'Analytic: A(t) = A0 exp(-alpha pi^2 t / L^2)')


def l3_volume(n=24):
    R = 0.004
    spec = _quiet(geometry='axisymmetric', boundary='open', length_m=0.016, width_m=0.008,
                  burner=Burner(radius_m=R, fuel_velocity_m_s=0.3, fuel=Composition(species={'N2': 0.79, 'O2': 0.21})), numerics=Numerics(nx=32, ny=n, duration_s=0.02, output_interval_s=0.02))
    s = Solver(spec); s._prep()
    while s.t < 0.02: s.advance(0.02 - s.t)
    # global mass conservation of a constant-density jet: outflow volume = inflow volume
    qin = float(np.sum(s.u[0] * s.rc * s.dy)); qnet = qin - float(np.sum(s.u[-1] * s.rc * s.dy)) - float(np.sum(s.v[:, -1]) * s.rf[-1] * s.dx)
    err = abs(qnet / qin)
    return _b('Isothermal constant-density jet: discrete volume balance (inflow = outflow through open boundaries)', '|net volume flux| / inflow', err, 1e-8, err < 1e-8,
              'Incompressibility constraint div u = 0 enforced by the projection')


def l3_sealed():
    mix = Composition(species={'CH4': 0.0775, 'O2': 0.1937, 'N2': 0.7288})       # phi ~ 0.8
    spec = FlameL3Spec(geometry='axisymmetric', boundary='sealed', length_m=0.02, width_m=0.01, ambient=Ambient(composition=mix),
                       burner=Burner(fuel_velocity_m_s=0.0, radius_m=0.002), acceleration_axial_m_s2=0.0,
                       ignition=Ignition(x_m=0.01, y_m=0.0, radius_m=0.003, temperature_k=2000.0), numerics=Numerics(nx=48, ny=24, duration_s=0.25, output_interval_s=0.05))
    s = Solver(spec); res = s.run()
    gm = s.gm
    # Independent reference: complete combustion at constant volume and internal energy, same thermodynamic data.
    kf, ko = gm.names.index('CH4'), gm.names.index('O2')
    V = s._integral(np.ones_like(s.T)); m0 = s.m0
    U0 = s.h0 - 101325.0 * V                       # total enthalpy minus p V at t = 0 (includes ignition kernel)
    Y = s._Y(s.x_amb); nF = Y[kf] / gm.W[kf]
    Yb = Y.copy(); Yb[kf] = 0; Yb[ko] -= 2 * nF * gm.W[ko]
    Yb[gm.names.index('CO2')] += nF * gm.W[gm.names.index('CO2')]; Yb[gm.names.index('H2O')] += 2 * nF * gm.W[gm.names.index('H2O')]
    Mb = 1 / np.sum(Yb / gm.W); T = 2000.0
    for _ in range(60):
        cpk, hk = gm.cp_h(np.array([T]))
        f = m0 * (float(np.sum(hk[:, 0] * Yb)) - RU_K * T / Mb) - U0
        T -= f / (m0 * (float(np.sum(cpk[:, 0] * Yb)) - RU_K / Mb))
    p_ref = m0 / V * RU_K * T / Mb
    fuel_left = s._integral(s.rho * s.Y[kf]) / (m0 * Y[kf])
    err = abs(s.p0 / p_ref - 1)
    b = res['budgets']
    return _b('Sealed adiabatic chamber, lean premixed CH4/air burn-out: final pressure vs constant-U,V complete-combustion reference', 'relative pressure error', err, 0.03,
              res['status'] == 'completed' and err < 0.03 and fuel_left < 0.02 and abs(b['mass']['residual_relative_to_initial']) < 0.02,
              'First law for a closed adiabatic rigid vessel with the same NASA-7 data', p_final_pa=s.p0, p_reference_pa=p_ref, fuel_fraction_left=fuel_left,
              mass_residual_rel=b['mass']['residual_relative_to_initial'], energy_residual_rel=b['energy']['residual_relative_to_reference'])


def l3_buoyancy():
    out = {}
    for g in (-9.80665, 0.0, 9.80665):
        spec = _quiet(geometry='axisymmetric', boundary='sealed', length_m=0.04, width_m=0.02, acceleration_axial_m_s2=g,
                      ignition=Ignition(enabled=True, x_m=0.02, y_m=0.0, radius_m=0.004, temperature_k=900.0), numerics=Numerics(nx=40, ny=20, duration_s=0.08, output_interval_s=0.08))
        s = Solver(spec); s._prep()
        w = lambda: float(np.sum((s.T - 300) * s.vol * s.xc[:, None]) / np.sum((s.T - 300) * s.vol))
        x0 = w()
        while s.t < 0.08: s.advance(0.08 - s.t)
        out[g] = w() - x0
    ok = out[-9.80665] > 5e-4 and out[9.80665] < -5e-4 and abs(out[0.0]) < 0.1 * abs(out[-9.80665]) and abs(out[-9.80665] + out[9.80665]) < 0.05 * abs(out[-9.80665])
    return _b('Buoyancy sign and symmetry: hot kernel moves opposite to the effective acceleration; no drift at zero acceleration', 'centroid shift [m] for a = -g, 0, +g',
              [out[-9.80665], out[0.0], out[9.80665]], 'opposite, antisymmetric within 5 %, |zero-g| < 10 %', ok, 'Momentum equation source (rho - rho_ref) a')


def l3_grid():
    vals = []
    for nx, ny in ((48, 24), (72, 36), (96, 48)):
        spec = FlameL3Spec(ambient=Ambient(composition=AIR), length_m=0.06, width_m=0.03, acceleration_axial_m_s2=0.0,
                           numerics=Numerics(nx=nx, ny=ny, duration_s=0.15, output_interval_s=0.15))
        s = Solver(spec); r = s.run()
        d = r['series'][-1]
        vals.append({'grid': f'{nx}x{ny}', 'heat_released_j': r['budgets']['energy']['chemical_heat_released_j'], 'T_max_k': d['T_max'], 'hrr_total_w': d['hrr_total_w'], 'flame_width_m': d['flame_width_m'], 'status': r['status'],
                     'mass_residual_rel': r['budgets']['mass']['residual_relative_to_initial']})
    f = vals[2]
    dT = abs(f['T_max_k'] - vals[1]['T_max_k']) / f['T_max_k']
    dE = abs(f['heat_released_j'] - vals[1]['heat_released_j']) / f['heat_released_j']
    dQ = abs(f['hrr_total_w'] - vals[1]['hrr_total_w']) / f['hrr_total_w']
    ok = all(v['status'] == 'completed' for v in vals) and dT < 0.03 and dE < 0.05
    return _b('Grid sensitivity of the zero-g CH4 jet flame over 0-0.15 s (dx = 1.25, 0.83, 0.625 mm)',
              'relative change medium->fine: [T_max, cumulative heat released]; instantaneous HRR at 0.15 s reported separately', [dT, dE],
              'T_max < 3 %, cumulative heat release < 5 %', ok,
              'Self-convergence (no exact solution). Pass criterion uses peak temperature and time-integrated heat release only.',
              instantaneous_hrr_change_medium_to_fine=dQ,
              not_converged_note=f'The instantaneous integrated heat-release rate at a single time still changes by {100 * dQ:.0f} % between the two finest grids: '
                                 'the one-step reaction zone is thinner than the grid, so instantaneous HRR and flame-shape metrics are grid-dependent at these resolutions.',
              runs=vals)


def cpl_sign():
    g = 9.80665
    fl = lambda f: FlightExcerpt(flight_run_id='test', vehicle='v', mission='m', model='test', samples=[FlightSample(t=0, specific_force_body=f), FlightSample(t=10, specific_force_body=f)])
    ch = Chamber()
    a_surface = chamber_history(fl([g, 0, 0]), ch, 0, 5, False)['history'][0].axial
    a_coast = chamber_history(fl([0, 0, 0]), ch, 0, 5, False)['history'][0].axial
    a_burn = chamber_history(fl([30.0, 0, 0]), ch, 0, 5, False)['history'][0].axial
    spin = FlightExcerpt(flight_run_id='t', vehicle='v', mission='m', model='t', samples=[FlightSample(t=t, specific_force_body=[0, 0, 0], omega_body=[0, 0, 2.0]) for t in (0, 10)])
    a_spin = chamber_history(spin, Chamber(position_body_m=[3.0, 0, 0]), 0, 5, False)['history'][0].axial
    ok = abs(a_surface + g) < 1e-12 and a_coast == 0 and abs(a_burn + 30) < 1e-12 and abs(a_spin - 12.0) < 1e-12
    return _b('Coupling sign convention: surface rest -> -g along burner axis, coast -> 0, thrust -> -a, spin -> +omega^2 r outward', '[a_surface, a_coast, a_burn, a_spin]',
              [a_surface, a_coast, a_burn, a_spin], 'exact', ok, 'Kinematics of a non-inertial frame')


ALL = {'ENV-USSA76': env_ussa76, 'L1-EQ-CH4': l1_equilibrium, 'L1-ELEMENTS': l1_elements, 'L1-REACTOR-CONS': l1_reactor, 'L2-SL-CH4': l2_sl_ch4, 'L2-SL-H2': l2_sl_h2,
       'L2-CF-CH4': l2_counterflow, 'L3-VOLUME-BALANCE': l3_volume, 'L3-CAVITY-GHIA': l3_cavity, 'L3-DIFFUSION': l3_diffusion, 'L3-SEALED-ADIABATIC': l3_sealed,
       'L3-BUOYANCY': l3_buoyancy, 'L3-GRID': l3_grid, 'CPL-SIGN': cpl_sign}


def main(argv):
    names = argv or list(ALL)
    existing = {}
    if OUT.exists():
        existing = json.loads(OUT.read_text()).get('benchmarks', {})
    for k in names:
        t = time.time()
        try:
            r = ALL[k]()
        except Exception as e:  # noqa: BLE001
            r = {'title': k, 'status': 'ERROR', 'metric': '', 'value': None, 'tolerance': '', 'reference': '', 'error': f'{type(e).__name__}: {e}'}
        r['wall_time_s'] = round(time.time() - t, 2)
        existing[k] = json.loads(json.dumps(r, default=float))
        print(k, r['status'], r.get('value'), r.get('error', ''), f"{r['wall_time_s']} s", flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    from .jobs import versions
    OUT.write_text(json.dumps({'generated_utc': datetime.now(timezone.utc).isoformat(), 'versions': versions(), 'benchmarks': existing}, indent=1))
    return 0 if all(v['status'] == 'PASS' for v in existing.values() if not v.get('external')) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
