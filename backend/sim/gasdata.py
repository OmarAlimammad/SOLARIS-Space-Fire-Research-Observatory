"""Curated species registry and Cantera-backed gas models.

Property authority: Cantera (version recorded at runtime) with the GRI-Mech 3.0 species
thermodynamic (NASA-7) and transport data.  Helium is not part of GRI-Mech 3.0; it is
added as an inert species using Cantera's ``nasa_gas.yaml`` thermodynamics and the
standard CHEMKIN transport-database Lennard-Jones parameters (well depth 10.2 K,
diameter 2.576 Angstrom).  In the extended mechanism helium participates only as a
generic third body with unit collision efficiency (an assumption, not a GRI-Mech value).
"""
from __future__ import annotations

import math
from functools import lru_cache

import cantera as ct
import numpy as np

from .errors import SimError

R_U = ct.gas_constant / 1000.0  # J/(mol K); Cantera uses J/(kmol K)
P_STD = 101325.0
G0 = 9.80665

# UI/registry name -> Cantera species name in the SOLARIS gas model.
SPECIES = {
    'N2': 'N2', 'O2': 'O2', 'Ar': 'AR', 'CO2': 'CO2', 'H2O': 'H2O',
    'He': 'He', 'H2': 'H2', 'CH4': 'CH4', 'CO': 'CO',
}
SPECIES_INFO = {
    'N2': 'Nitrogen (diluent)', 'O2': 'Oxygen (oxidizer)', 'Ar': 'Argon (inert diluent)',
    'CO2': 'Carbon dioxide', 'H2O': 'Water vapour', 'He': 'Helium (inert diluent)',
    'H2': 'Hydrogen (fuel)', 'CH4': 'Methane (fuel)', 'CO': 'Carbon monoxide (fuel/toxic)',
}
FUELS = ('CH4', 'H2', 'CO')
MECHANISMS = {
    'gri30+He': {
        'label': 'GRI-Mech 3.0 (53 species, 325 reactions) + inert He',
        'source': 'G. P. Smith et al., GRI-Mech 3.0, http://combustion.berkeley.edu/gri-mech/ (as distributed with Cantera gri30.yaml)',
        'fuels': ['CH4', 'H2', 'CO'],
        'optimized_range': 'Optimised for natural-gas combustion, roughly 1000-2500 K, 1.3 kPa-1 MPa, equivalence ratio 0.1-5 (premixed). Outside this range results are extrapolations.',
        'notes': 'He added as inert third body with unit efficiency (SOLARIS assumption).',
    },
    'h2o2': {
        'label': 'Cantera h2o2.yaml hydrogen/oxygen submechanism (10 species, 29 reactions)',
        'source': 'Cantera h2o2.yaml (H2/O2 subset derived from GRI-Mech 3.0)',
        'fuels': ['H2'],
        'optimized_range': 'Hydrogen/oxygen with N2/Ar diluents only; no carbon species, no He.',
        'notes': 'Rejects mixtures containing CO2, CO, CH4 or He.',
    },
}


@lru_cache(maxsize=None)
def _species_objects():
    base = {s.name: s for s in ct.Species.list_from_file('gri30.yaml')}
    he = next(s for s in ct.Species.list_from_file('nasa_gas.yaml') if s.name == 'He')
    he.transport = ct.GasTransportData(geometry='atom', diameter=2.576e-10, well_depth=10.2 * ct.boltzmann)
    base['He'] = he
    return base


def new_gas(mechanism: str = 'gri30+He') -> ct.Solution:
    """Fresh (thread-unsafe, caller-owned) Cantera Solution for a registered mechanism."""
    if mechanism == 'gri30+He':
        sp = list(_species_objects().values())
        rx = ct.Reaction.list_from_file('gri30.yaml', ct.Solution(thermo='ideal-gas', species=sp))
        return ct.Solution(thermo='ideal-gas', kinetics='gas', transport_model='mixture-averaged', species=sp, reactions=rx)
    if mechanism == 'h2o2':
        return ct.Solution('h2o2.yaml')
    raise SimError('unsupported_mechanism', f'Unknown mechanism {mechanism!r}.', field='mechanism',
                   expected=' | '.join(MECHANISMS), recovery='Select a mechanism listed by /api/v5/capabilities.')


_local = {}


def shared_gas(mechanism: str = 'gri30+He') -> ct.Solution:
    """Per-process cached Solution; callers must set the full state before use."""
    import os, threading
    key = (mechanism, os.getpid(), threading.get_ident())
    if key not in _local:
        _local[key] = new_gas(mechanism)
    return _local[key]


def ct_name(name: str, mechanism: str = 'gri30+He') -> str:
    if name not in SPECIES:
        raise SimError('unknown_species', f'Species {name!r} is not in the SOLARIS registry.', field='composition.species',
                       expected=', '.join(SPECIES), recovery='Remove the species or choose one from the registry.')
    cn = SPECIES[name]
    if mechanism == 'h2o2' and cn not in ('N2', 'O2', 'AR', 'H2O', 'H2'):
        raise SimError('incompatible_mixture', f'Species {name} has no data in mechanism h2o2.', field='mechanism',
                       expected='N2, O2, Ar, H2O, H2', recovery='Use mechanism gri30+He or remove the species.')
    return cn


def molar_mass(name: str) -> float:
    """kg/mol."""
    return _species_objects()[SPECIES[name]].molecular_weight / 1000.0


def to_cantera(x: dict[str, float], mechanism: str = 'gri30+He') -> dict[str, float]:
    return {ct_name(k, mechanism): v for k, v in x.items() if v > 0}


def saturation_pressure_water(T: float) -> float | None:
    """Pa. Cantera Water (IAPWS-95 based) saturation line; None outside 273.16-647 K."""
    if not (273.16 <= T < 647.0):
        return None
    w = ct.Water()
    w.TQ = T, 1.0
    return w.P_sat


def saturation_pressure_co2(T: float) -> float | None:
    """Pa on the liquid-vapour line (216.6-304.1 K); None elsewhere (sublimation not modelled)."""
    if not (216.6 <= T < 304.1):
        return None
    c = ct.CarbonDioxide()
    c.TQ = T, 1.0
    return c.P_sat


def nasa7(name: str):
    """(Tmin, Tmid, Tmax, low[7], high[7]) for vectorised evaluation outside Cantera."""
    sp = _species_objects()[SPECIES[name]]
    th = sp.thermo
    c = th.coeffs
    return th.min_temp, c[0], th.max_temp, np.array(c[8:15]), np.array(c[1:8])


def mixture_properties(x: dict[str, float], T: float, p: float) -> dict:
    """Ideal-gas mixture properties from mole fractions (already validated, sum = 1)."""
    M = sum(v * molar_mass(k) for k, v in x.items())
    out = {'molar_mass_kg_mol': M, 'specific_gas_constant_j_kg_k': R_U / M,
           'mass_fractions': {k: v * molar_mass(k) / M for k, v in x.items()},
           'partial_pressures_pa': {k: v * p for k, v in x.items()}}
    if p <= 0:
        out.update(density_kg_m3=0.0, vacuum=True)
        return out
    g = shared_gas()
    g.TPX = T, p, to_cantera(x)
    cp, cv = g.cp_mass, g.cv_mass
    mu, lam = g.viscosity, g.thermal_conductivity
    rho = p * M / (R_U * T)
    mfp = mu / p * math.sqrt(math.pi * R_U * T / (2 * M))
    out.update(vacuum=False, density_kg_m3=rho, cp_j_kg_k=cp, cv_j_kg_k=cv, gamma=cp / cv,
               sound_speed_m_s=math.sqrt(cp / cv * R_U / M * T), viscosity_pa_s=mu,
               thermal_conductivity_w_m_k=lam, thermal_diffusivity_m2_s=lam / (rho * cp),
               kinematic_viscosity_m2_s=mu / rho, prandtl=mu * cp / lam, mean_free_path_m=mfp,
               cantera_density_check_kg_m3=g.density)
    return out
