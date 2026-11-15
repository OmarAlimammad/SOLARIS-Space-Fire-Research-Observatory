"""Level 1 (equilibrium, homogeneous reactors) and Level 2 (1-D flames) via Cantera.

Every function returns plain JSON-serialisable dictionaries including the model contract,
element/mass balance checks and solver health.  A failed nonlinear solve is reported as
``non_converged`` and never as physical extinction.
"""
from __future__ import annotations

import math
import time
from typing import Literal

import cantera as ct
import numpy as np
from pydantic import Field

from .environment import Composition, Strict, resolve_mixture
from .errors import SimError
from .gasdata import FUELS, MECHANISMS, SPECIES, new_gas, to_cantera

REPORT_SPECIES = ['CH4', 'H2', 'CO', 'O2', 'N2', 'H2O', 'CO2', 'AR', 'He', 'OH', 'H', 'O', 'NO']


class Mixing(Strict):
    mode: Literal['equivalence_ratio', 'fuel_mole_fraction'] = 'equivalence_ratio'
    value: float = 1.0


class ChemistryCase(Strict):
    """Common premixed-charge definition for Level 1/2 studies."""
    mechanism: str = 'gri30+He'
    fuel: Composition = Composition(species={'CH4': 1.0})
    oxidizer: Composition
    mixing: Mixing = Mixing()
    temperature_k: float = 300.0
    pressure_pa: float = 101325.0


class EquilibriumSpec(ChemistryCase):
    constraint: Literal['HP', 'UV', 'TP'] = 'HP'


class ReactorSpec(ChemistryCase):
    constraint: Literal['constant_pressure', 'constant_volume'] = 'constant_pressure'
    duration_s: float = Field(1.0, gt=0, le=1000)
    max_steps: int = Field(20000, ge=100, le=200000)


class PremixedFlameSpec(ChemistryCase):
    width_m: float = Field(0.03, gt=0.001, le=0.5)
    refine_ratio: float = 3.0
    refine_slope: float = 0.08
    refine_curve: float = 0.16
    max_grid_points: int = Field(600, ge=50, le=3000)
    transport: Literal['mixture-averaged', 'multicomponent'] = 'mixture-averaged'


class CounterflowSpec(Strict):
    mechanism: str = 'gri30+He'
    fuel: Composition = Composition(species={'CH4': 1.0})
    oxidizer: Composition
    fuel_temperature_k: float = 300.0
    oxidizer_temperature_k: float = 300.0
    pressure_pa: float = 101325.0
    fuel_mass_flux_kg_m2_s: float = Field(0.24, gt=0, le=50)
    oxidizer_mass_flux_kg_m2_s: float = Field(0.72, gt=0, le=50)
    width_m: float = Field(0.02, gt=0.002, le=0.2)
    max_grid_points: int = Field(400, ge=50, le=2000)


def _check_state(T, p):
    if not (math.isfinite(T) and 200 <= T <= 3000):
        raise SimError('temperature_out_of_range', 'Initial temperature must be 200-3000 K (NASA-7 polynomial range).', field='temperature_k', expected='200-3000 K')
    if not (math.isfinite(p) and 100 <= p <= 1.0e7):
        raise SimError('pressure_out_of_range', 'Pressure must be 100 Pa - 10 MPa for kinetics studies.', field='pressure_pa', expected='1e2-1e7 Pa',
                       recovery='Continuum ideal-gas kinetics are not supported in near-vacuum or dense states.')


def _streams(case, T, p):
    if case.mechanism not in MECHANISMS:
        raise SimError('unsupported_mechanism', f'Unknown mechanism {case.mechanism!r}.', field='mechanism', expected=' | '.join(MECHANISMS))
    xf = resolve_mixture(case.fuel, T, p)['mole_fractions']
    xo = resolve_mixture(case.oxidizer, T, p)['mole_fractions']
    fuels = [k for k in xf if k in FUELS]
    if not fuels:
        raise SimError('no_fuel', 'The fuel stream contains no supported fuel species.', field='fuel.species', expected='CH4, H2 or CO',
                       recovery='Add a supported gaseous fuel. Liquid, wick and solid fuels need evaporation/pyrolysis models that are not implemented.')
    bad = [k for k in fuels if k not in MECHANISMS[case.mechanism]['fuels']]
    if bad:
        raise SimError('unsupported_chemistry', f'Mechanism {case.mechanism} does not support fuel {bad[0]}.', field='mechanism',
                       expected=', '.join(MECHANISMS[case.mechanism]['fuels']), recovery='Choose gri30+He. No other fuel is substituted silently.')
    return to_cantera(xf, case.mechanism), to_cantera(xo, case.mechanism), xf, xo


def _premix(case):
    T, p = case.temperature_k, case.pressure_pa
    _check_state(T, p)
    cf, co, xf, xo = _streams(case, T, p)
    gas = new_gas(case.mechanism)
    v = case.mixing.value
    if not math.isfinite(v):
        raise SimError('invalid_mixing', 'Mixing value must be finite.', field='mixing.value')
    if case.mixing.mode == 'equivalence_ratio':
        if xo.get('O2', 0) <= 0:
            raise SimError('phi_undefined', 'Equivalence ratio is undefined: the oxidizer stream contains no O2.', field='mixing.mode',
                           expected='oxidizer with O2 > 0', recovery='Use mixing mode "fuel_mole_fraction" to study a fuel/inert mixture.')
        if not 0.05 <= v <= 20:
            raise SimError('phi_out_of_range', 'Equivalence ratio must be 0.05-20.', field='mixing.value', expected='0.05-20')
        gas.set_equivalence_ratio(v, cf, co)
        phi = v
    else:
        if not 0 < v < 1:
            raise SimError('invalid_mixing', 'Fuel-stream mole fraction must be in (0, 1).', field='mixing.value', expected='0 < x < 1')
        mix = {}
        for k, a in cf.items(): mix[k] = mix.get(k, 0) + v * a
        for k, a in co.items(): mix[k] = mix.get(k, 0) + (1 - v) * a
        gas.X = mix
        phi = None
        if xo.get('O2', 0) > 0:
            try: phi = float(gas.equivalence_ratio(cf, co))
            except Exception: phi = None
    gas.TP = T, p
    return gas, phi


def _elements(gas):
    return {e: float(gas.elemental_mass_fraction(e)) for e in gas.element_names}


def _comp(gas, floor=1e-9):
    out = {}
    for n in gas.species_names:
        x = gas.X[gas.species_index(n)]
        if x > floor and (n in REPORT_SPECIES or x > 1e-4):
            out[n] = float(x)
    return dict(sorted(out.items(), key=lambda kv: -kv[1])[:14])


def _meta(case, model, assumptions):
    m = MECHANISMS[case.mechanism]
    return {'model': model, 'mechanism': case.mechanism, 'mechanism_label': m['label'], 'mechanism_source': m['source'],
            'mechanism_range': m['optimized_range'], 'cantera_version': ct.__version__, 'assumptions': assumptions}


def equilibrium(spec: EquilibriumSpec) -> dict:
    gas, phi = _premix(spec)
    e0, h0, u0, T0, rho0 = _elements(gas), gas.enthalpy_mass, gas.int_energy_mass, gas.T, gas.density
    x0 = _comp(gas)
    try:
        gas.equilibrate(spec.constraint)
    except Exception as exc:  # Cantera raises CanteraError
        return {'status': 'non_converged', 'reason': str(exc).splitlines()[0][:300], **_meta(spec, 'chemical equilibrium', [])}
    e1 = _elements(gas)
    return {'status': 'completed', 'fidelity_level': 1,
            **_meta(spec, f'Chemical equilibrium at constant {spec.constraint}', [
                'Homogeneous ideal-gas mixture; infinite time; no transport, heat loss or flow',
                'HP = adiabatic, constant pressure; UV = adiabatic, constant volume; TP = fixed T and p',
                'Equilibrium temperature does NOT establish whether a flame ignites, propagates or persists']),
            'equivalence_ratio': phi, 'initial': {'temperature_k': T0, 'pressure_pa': spec.pressure_pa, 'density_kg_m3': rho0, 'mole_fractions': x0},
            'final': {'temperature_k': gas.T, 'pressure_pa': gas.P, 'density_kg_m3': gas.density, 'mole_fractions': _comp(gas)},
            'checks': {'max_element_mass_fraction_change': max(abs(e1[k] - e0[k]) for k in e0),
                       'enthalpy_change_j_kg': gas.enthalpy_mass - h0 if spec.constraint == 'HP' else None,
                       'internal_energy_change_j_kg': gas.int_energy_mass - u0 if spec.constraint == 'UV' else None}}


def reactor(spec: ReactorSpec, progress=None) -> dict:
    gas, phi = _premix(spec)
    e0 = _elements(gas)
    T0, P0 = gas.T, gas.P
    if spec.constraint == 'constant_pressure':
        r = ct.IdealGasConstPressureReactor(gas, clone=False) if _has_clone() else ct.IdealGasConstPressureReactor(gas)
    else:
        r = ct.IdealGasReactor(gas, clone=False) if _has_clone() else ct.IdealGasReactor(gas)
    net = ct.ReactorNet([r])
    m0 = r.mass
    ts, Ts, Ps, O2 = [0.0], [T0], [P0], [float(gas.X[gas.species_index('O2')])]
    status, steps = 'completed', 0
    try:
        while net.time < spec.duration_s and steps < spec.max_steps:
            net.step(); steps += 1
            ts.append(net.time); Ts.append(r.T); Ps.append(r.thermo.P); O2.append(float(r.thermo.X[r.thermo.species_index('O2')]))
            if progress and steps % 200 == 0: progress(min(0.99, net.time / spec.duration_s))
        if net.time < spec.duration_s: status = 'step_limit'
    except Exception as exc:
        return {'status': 'non_converged', 'reason': str(exc).splitlines()[0][:300], **_meta(spec, 'homogeneous reactor', [])}
    t, T = np.array(ts), np.array(Ts)
    dT = np.gradient(T, t) if len(t) > 2 else np.zeros_like(T)
    i = int(np.argmax(dT))
    ignited = bool(T.max() - T0 >= 400.0)
    keep = np.unique(np.concatenate([np.linspace(0, len(t) - 1, 400).astype(int), np.arange(max(0, i - 60), min(len(t), i + 60))]))
    e1 = _elements(r.thermo)
    return {'status': status, 'fidelity_level': 1,
            **_meta(spec, f'Adiabatic homogeneous ideal-gas reactor, {spec.constraint.replace("_", " ")}', [
                'Spatially uniform (0-D); adiabatic; no walls, flow or transport',
                'Ignition delay = time of maximum dT/dt, reported only if the temperature rise is at least 400 K within the simulated duration',
                'No ignition within the duration is NOT a statement that ignition is impossible']),
            'equivalence_ratio': phi, 'initial': {'temperature_k': T0, 'pressure_pa': P0},
            'final': {'temperature_k': float(T[-1]), 'pressure_pa': float(Ps[-1]), 'mole_fractions': _comp(r.thermo), 'time_s': float(t[-1])},
            'ignition': {'detected': ignited, 'delay_s': float(t[i]) if ignited else None, 'criterion': 'max dT/dt with rise >= 400 K',
                         'max_dTdt_k_s': float(dT[i])},
            'series': {'time_s': t[keep].tolist(), 'temperature_k': T[keep].tolist(), 'pressure_pa': np.array(Ps)[keep].tolist(), 'x_o2': np.array(O2)[keep].tolist()},
            'checks': {'max_element_mass_fraction_change': max(abs(e1[k] - e0[k]) for k in e0), 'mass_change_kg': r.mass - m0, 'steps': steps}}


def _has_clone():
    import inspect
    try: return 'clone' in inspect.signature(ct.Reactor.__init__).parameters or tuple(map(int, ct.__version__.split('.')[:2])) >= (3, 2)
    except Exception: return False


def premixed_flame(spec: PremixedFlameSpec, progress=None) -> dict:
    gas, phi = _premix(spec)
    if gas.X[gas.species_index('O2')] <= 0:
        raise SimError('no_oxidizer', 'A freely propagating premixed flame needs O2 in the unburned mixture.', field='oxidizer.species',
                       recovery='Add O2 to the oxidizer stream. Without an oxidizer no ordinary flame is computed.')
    T0, p0 = gas.T, gas.P
    e0 = _elements(gas)
    rho_u = gas.density
    t0 = time.time()
    f = ct.FreeFlame(gas, width=spec.width_m)
    f.transport_model = spec.transport
    f.set_refine_criteria(ratio=spec.refine_ratio, slope=spec.refine_slope, curve=spec.refine_curve)
    f.set_max_grid_points(f.flame, spec.max_grid_points)
    meta = _meta(spec, 'Steady, adiabatic, freely propagating 1-D premixed laminar flame (Cantera FreeFlame)', [
        'One-dimensional, planar, unstretched, adiabatic; no gravity, walls or radiation',
        f'{spec.transport} transport; adaptive grid refinement',
        'Laminar burning velocity S_L is the unburned-gas inflow speed of this steady solution; it is not a 3-D flame motion prediction'])
    try:
        f.solve(loglevel=0, auto=True)
    except Exception as exc:
        return {'status': 'non_converged', 'fidelity_level': 2, 'reason': str(exc).splitlines()[0][:300], **meta,
                'note': 'The steady solver did not find a propagating solution. This is a numerical outcome and does not prove the mixture is non-flammable.',
                'equivalence_ratio': phi, 'wall_time_s': time.time() - t0}
    z, T = np.array(f.grid), np.array(f.T)
    Tb = float(T[-1])
    if Tb - T0 < 50:
        return {'status': 'non_converged', 'fidelity_level': 2, **meta, 'equivalence_ratio': phi, 'wall_time_s': time.time() - t0,
                'reason': 'Solver returned the trivial non-reacting solution (temperature rise < 50 K).',
                'note': 'No steady propagating flame was found for this mixture with this model. Not proof of physical non-flammability.'}
    dTdz = np.gradient(T, z)
    thick = (Tb - T0) / float(dTdz.max())
    hrr = np.array(f.heat_release_rate)
    def prof(n):
        return np.array(f.X[gas.species_index(n)]).tolist() if n in gas.species_names else None
    major = [n for n in ('CH4', 'H2', 'CO', 'O2', 'H2O', 'CO2', 'OH') if n in gas.species_names and float(np.max(f.X[gas.species_index(n)])) > 1e-6]
    gas_b = f.gas; f.set_gas_state(len(z) - 1); e1 = _elements(gas_b)
    mflux = np.array(f.density) * np.array(f.velocity)
    return {'status': 'completed', 'fidelity_level': 2, **meta, 'equivalence_ratio': phi,
            'unburned': {'temperature_k': T0, 'pressure_pa': p0, 'density_kg_m3': rho_u},
            'laminar_burning_velocity_m_s': float(f.velocity[0]), 'burned_temperature_k': Tb,
            'thermal_thickness_m': thick, 'peak_heat_release_w_m3': float(hrr.max()),
            'profiles': {'z_m': z.tolist(), 'temperature_k': T.tolist(), 'velocity_m_s': np.array(f.velocity).tolist(),
                         'heat_release_w_m3': hrr.tolist(), 'mole_fractions': {n: prof(n) for n in major}},
            'checks': {'grid_points': int(len(z)), 'mass_flux_relative_variation': float((mflux.max() - mflux.min()) / mflux.mean()),
                       'max_element_mass_fraction_change_inlet_to_outlet': max(abs(e1[k] - e0[k]) for k in e0),
                       'refine_criteria': {'ratio': spec.refine_ratio, 'slope': spec.refine_slope, 'curve': spec.refine_curve}},
            'wall_time_s': time.time() - t0}


def counterflow_flame(spec: CounterflowSpec, progress=None) -> dict:
    _check_state(spec.fuel_temperature_k, spec.pressure_pa); _check_state(spec.oxidizer_temperature_k, spec.pressure_pa)
    case = ChemistryCase(mechanism=spec.mechanism, fuel=spec.fuel, oxidizer=spec.oxidizer, pressure_pa=spec.pressure_pa)
    cf, co, xf, xo = _streams(case, spec.fuel_temperature_k, spec.pressure_pa)
    gas = new_gas(spec.mechanism)
    gas.TP = spec.oxidizer_temperature_k, spec.pressure_pa
    meta = _meta(case, 'Steady axisymmetric opposed-jet (counterflow) diffusion flame on the stagnation streamline (Cantera CounterflowDiffusionFlame)', [
        'Similarity solution along the axis between two opposed nozzles; steady; no gravity or radiation',
        'Mixture-averaged transport; adaptive grid',
        'A strained 1-D diffusion flame is a reference structure, not a prediction of a free jet or candle flame shape'])
    t0 = time.time()
    if not any(co.get(n, 0) > 1e-9 for n in ('O2',)):
        # No oxidizing species in either supplied stream: the flame equations have no reacting branch (and Cantera's initial guess is undefined).
        Tin = max(spec.fuel_temperature_k, spec.oxidizer_temperature_k)
        return {'status': 'completed', 'fidelity_level': 2, **meta, 'solution_branch': 'non_reacting',
                'note': 'The oxidizer stream contains no O2, so there is nothing for the fuel to burn with: the only steady solution is non-reacting mixing of the two streams. '
                        'The 1-D flame equations were not integrated for this case; temperature stays at the inlet value. A flame requires an oxidizer supplied by the ambient gas or by a separate stream.',
                'peak_temperature_k': float(Tin), 'peak_position_m': None, 'integrated_heat_release_w_m2': 0.0, 'strain_rate_mean_1_s': None, 'profiles': None,
                'checks': {'grid_points': 0, 'oxidizer_o2_mole_fraction': 0.0}, 'wall_time_s': time.time() - t0}
    f = ct.CounterflowDiffusionFlame(gas, width=spec.width_m)
    f.fuel_inlet.mdot, f.fuel_inlet.X, f.fuel_inlet.T = spec.fuel_mass_flux_kg_m2_s, cf, spec.fuel_temperature_k
    f.oxidizer_inlet.mdot, f.oxidizer_inlet.X, f.oxidizer_inlet.T = spec.oxidizer_mass_flux_kg_m2_s, co, spec.oxidizer_temperature_k
    f.set_refine_criteria(ratio=4, slope=0.2, curve=0.3, prune=0.04)
    f.set_max_grid_points(f.flame, spec.max_grid_points)
    try:
        f.solve(loglevel=0, auto=True)
    except Exception as exc:
        return {'status': 'non_converged', 'fidelity_level': 2, 'reason': str(exc).splitlines()[0][:300], **meta, 'wall_time_s': time.time() - t0,
                'note': 'Numerical non-convergence; not proof of extinction.'}
    z, T = np.array(f.grid), np.array(f.T)
    Tin = max(spec.fuel_temperature_k, spec.oxidizer_temperature_k)
    reacting = bool(T.max() - Tin > 300)
    hrr = np.array(f.heat_release_rate)
    major = [n for n in ('CH4', 'H2', 'CO', 'O2', 'H2O', 'CO2', 'OH') if n in gas.species_names and float(np.max(f.X[gas.species_index(n)])) > 1e-6]
    out = {'status': 'completed', 'fidelity_level': 2, **meta,
           'solution_branch': 'reacting' if reacting else 'non_reacting',
           'note': None if reacting else ('The converged steady solution is the non-reacting (frozen mixing) branch for these inlet conditions. With no O2 in the oxidizer stream this is the only branch. '
                                          'Otherwise a reacting branch may still exist at lower strain; multiple steady solutions are possible.'),
           'peak_temperature_k': float(T.max()), 'peak_position_m': float(z[int(T.argmax())]),
           'integrated_heat_release_w_m2': float(np.trapz(hrr, z)),
           'strain_rate_mean_1_s': float(f.strain_rate('mean')) if reacting else None,
           'profiles': {'z_m': z.tolist(), 'temperature_k': T.tolist(), 'axial_velocity_m_s': np.array(f.velocity).tolist(),
                        'heat_release_w_m3': hrr.tolist(), 'mole_fractions': {n: np.array(f.X[gas.species_index(n)]).tolist() for n in major}},
           'checks': {'grid_points': int(len(z))}, 'wall_time_s': time.time() - t0}
    return out
