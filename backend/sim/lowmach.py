"""Level 3: transient 2-D (axisymmetric or planar) laminar low-Mach reacting-flow solver.

Formulation (variable-density low-Mach-number limit; acoustic waves filtered):
  p(x,t) = p0(t) + p'(x,t), |p'| << p0;  rho = p0 M / (R_u T)                         (EOS)
  D Y_k/Dt = (1/rho) ( -div j_k + omega_k )                                            (species)
  rho cp DT/Dt = div(lambda grad T) - sum_k cp_k j_k . grad T - sum_k h_k omega_k
                 + dp0/dt + q_rad                                                       (energy)
  rho Du/Dt = -grad p' + div tau + (rho - rho_ref) a_eff(t)                             (momentum)
  div u = S = (1/T) DT/Dt + M sum_k (1/M_k) DY_k/Dt - (1/p0) dp0/dt                     (constraint)
j_k = -rho D_km (M_k/M) grad X_k + correction so that sum_k j_k = 0 (mixture-averaged).
h_k contains the enthalpy of formation, so chemical heat release appears only through
-sum h_k omega_k and is never added a second time.
Chemistry: one global irreversible step (see MECH below).  Transport: Cantera pure-species
viscosity/conductivity and binary diffusion coefficients fitted in ln T; Wilke and Mathur
mixture rules.  Discretisation: uniform staggered (MAC) grid, van Leer limited advection,
second-order central diffusion, explicit Euler transport + sub-cycled chemistry at constant
h and p, variable-coefficient pressure projection (sparse direct solve) enforcing the
divergence constraint.  Sealed domains predict p0(t) from the global constraint and then set it
from exact conservation of the enclosed mass (the per-step correction is reported).
The primitive (non-conservative) scalar form is not discretely conservative; mass, element
and energy budget residuals are therefore measured and reported for every run.
"""
from __future__ import annotations

import math
import time
from typing import Literal

import cantera as ct
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from pydantic import Field

from .environment import Composition, Strict, resolve_mixture
from .errors import SimError
from .gasdata import R_U, SPECIES, mixture_properties, molar_mass, nasa7, shared_gas

RU_K = R_U * 1000.0  # J/(kmol K)
MECH = {
    'CH4': {'nu_o2': 2.0, 'products': {'CO2': 1.0, 'H2O': 2.0}, 'A': 2.119e11, 'Ea': 2.027e8, 'a': 0.2, 'b': 1.3,
            'source': 'Westbrook & Dryer, Combust. Sci. Technol. 27 (1981) 31-43, Table II set for CH4 (A = 6.7e12 cm-mol-s, Ea = 48.4 kcal/mol, [CH4]^0.2 [O2]^1.3)'},
    'H2': {'nu_o2': 0.5, 'products': {'H2O': 1.0}, 'A': 1.8e13 * 10 ** -1.5, 'Ea': 17614.0 * RU_K, 'a': 1.0, 'b': 0.5,
           'source': 'Marinov, Westbrook & Pitz (1995), one-step H2: k = 1.8e13 exp(-17614 K/T) [H2]^1.0 [O2]^0.5 (cm-mol-s)'},
}
ELEMENTS = {'CH4': {'C': 1, 'H': 4}, 'H2': {'H': 2}, 'O2': {'O': 2}, 'N2': {'N': 2}, 'H2O': {'H': 2, 'O': 1},
            'CO2': {'C': 1, 'O': 2}, 'Ar': {'Ar': 1}, 'He': {'He': 1}, 'CO': {'C': 1, 'O': 1}}
ATOMIC = {'C': 12.011, 'H': 1.008, 'O': 15.999, 'N': 14.007, 'Ar': 39.948, 'He': 4.002602}


class Burner(Strict):
    radius_m: float = Field(0.003, gt=0)
    fuel: Composition = Composition(species={'CH4': 1.0})
    fuel_temperature_k: float = 300.0
    fuel_velocity_m_s: float = Field(0.25, ge=0, le=50)
    profile: Literal['parabolic', 'flat'] = 'parabolic'


class Coflow(Strict):
    velocity_m_s: float = Field(0.0, ge=0, le=20)
    composition: Composition | None = None      # separate oxidizer stream; None -> ambient mixture
    temperature_k: float | None = None
    outer_radius_m: float | None = None          # None -> whole inlet plane


class Ambient(Strict):
    composition: Composition
    pressure_pa: float = 101325.0
    temperature_k: float = 300.0


class AccelSample(Strict):
    t: float
    axial: float
    lateral: float = 0.0


class Ignition(Strict):
    enabled: bool = True
    x_m: float = 0.004
    y_m: float | None = None       # default: burner rim
    radius_m: float = 0.003
    temperature_k: float = 1900.0


class Radiation(Strict):
    model: Literal['none', 'gray_optically_thin'] = 'none'
    planck_mean_absorption_1_m: float = Field(0.0, ge=0, le=100)


class Numerics(Strict):
    nx: int = Field(80, ge=8, le=400)
    ny: int = Field(40, ge=8, le=400)
    duration_s: float = Field(0.4, gt=0, le=120)
    cfl: float = Field(0.4, gt=0, le=0.8)
    diffusion_number: float = Field(0.2, gt=0, le=0.24)
    dt_max_s: float = Field(5e-4, gt=0)
    output_interval_s: float = Field(0.02, gt=0)
    max_steps: int = Field(200000, ge=1, le=2000000)
    max_wall_s: float = Field(900.0, gt=0, le=14400)
    chemistry_substeps: int = Field(4, ge=1, le=50)


class FlameL3Spec(Strict):
    geometry: Literal['axisymmetric', 'planar'] = 'axisymmetric'
    length_m: float = Field(0.08, gt=0, le=2)
    width_m: float = Field(0.04, gt=0, le=2, description='radius (axisymmetric) or full width (planar)')
    burner: Burner = Burner()
    coflow: Coflow = Coflow()
    ambient: Ambient
    boundary: Literal['open', 'sealed'] = 'open'
    acceleration_axial_m_s2: float = -9.80665   # effective body acceleration along +x (burner axis); negative = toward burner
    acceleration_lateral_m_s2: float = 0.0
    acceleration_history: list[AccelSample] | None = None
    ignition: Ignition = Ignition()
    reaction_enabled: bool = True
    radiation: Radiation = Radiation()
    wall_temperature_k: float | None = None
    lid_velocity_m_s: float = 0.0               # verification only (sealed planar cavity)
    numerics: Numerics = Numerics()


# ------------------------------------------------------------------ property model
class GasModel:
    """Vectorised thermo/transport for a small species set (data extracted from Cantera)."""

    def __init__(self, names: list[str]):
        self.names = names
        self.n = len(names)
        self.W = np.array([molar_mass(k) * 1000.0 for k in names])  # kg/kmol
        nas = [nasa7(k) for k in names]
        self.Tmid = np.array([q[1] for q in nas])
        self.lo = np.array([q[3] for q in nas]); self.hi = np.array([q[4] for q in nas])
        self.Tmin, self.Tmax = max(q[0] for q in nas), min(q[2] for q in nas)
        g = shared_gas()
        idx = [g.species_index(SPECIES[k]) for k in names]
        Ts = np.linspace(250.0, 3200.0, 30)
        mu = np.zeros((self.n, len(Ts))); lam = np.zeros_like(mu); D = np.zeros((self.n, self.n, len(Ts)))
        for m, T in enumerate(Ts):
            for a, k in enumerate(names):
                g.TPX = T, ct.one_atm, {SPECIES[k]: 1.0}
                mu[a, m], lam[a, m] = g.viscosity, g.thermal_conductivity
            D[:, :, m] = g.binary_diff_coeffs[np.ix_(idx, idx)]
        lt = np.log(Ts)
        self.cmu = np.array([np.polyfit(lt, np.log(mu[a]), 3) for a in range(self.n)])
        self.clam = np.array([np.polyfit(lt, np.log(lam[a]), 3) for a in range(self.n)])
        self.cD = np.array([[np.polyfit(lt, np.log(D[a, b]), 3) for b in range(self.n)] for a in range(self.n)])
        self.phi_m = (self.W[None, :] / self.W[:, None]) ** 0.25           # (Mj/Mi)^1/4
        self.phi_d = np.sqrt(8.0 * (1.0 + self.W[:, None] / self.W[None, :]))
        self.elem = sorted({e for k in names for e in ELEMENTS[k]})
        # mass of element e per unit mass of species k
        self.Z = np.array([[ELEMENTS[k].get(e, 0) * ATOMIC[e] / sum(c * ATOMIC[q] for q, c in ELEMENTS[k].items()) for k in names] for e in self.elem])

    def _poly(self, T):
        c = np.where((T[None] > self.Tmid.reshape(-1, *[1] * T.ndim))[None], self.hi.T.reshape(7, -1, *[1] * T.ndim), self.lo.T.reshape(7, -1, *[1] * T.ndim))
        return c

    def cp_h(self, T):
        """Species cp [J/kg/K] and h [J/kg] arrays of shape (n, *T.shape)."""
        c = self._poly(T); Rk = (RU_K / self.W).reshape(-1, *[1] * T.ndim); T = T[None]
        cp = (c[0] + T * (c[1] + T * (c[2] + T * (c[3] + T * c[4])))) * Rk
        h = (c[0] + T * (c[1] / 2 + T * (c[2] / 3 + T * (c[3] / 4 + T * c[4] / 5))) + c[5] / T) * Rk * T
        return cp, h

    def molar_mass(self, Y):
        return 1.0 / np.tensordot(1.0 / self.W, Y, axes=1)

    def transport(self, T, X, p):
        lt = np.log(T)[None]
        ex = lambda c: np.exp(((c[:, 0, None] * lt + c[:, 1, None]) * lt + c[:, 2, None]) * lt + c[:, 3, None])
        sh = T.shape; lt = lt.reshape(1, -1); Xf = X.reshape(self.n, -1)
        mu = ex(self.cmu); lam = ex(self.clam)
        den = np.zeros_like(mu)
        for i in range(self.n):
            phi = (1.0 + np.sqrt(mu[i][None] / mu) * self.phi_m[i][:, None]) ** 2 / self.phi_d[i][:, None]
            den[i] = np.sum(Xf * phi, axis=0)
        mu_mix = np.sum(Xf * mu / den, axis=0)
        lam_mix = 0.5 * (np.sum(Xf * lam, axis=0) + 1.0 / np.sum(Xf / lam, axis=0))
        Xe = Xf + 1e-12
        W = np.tensordot(self.W, Xe, axes=1)
        Ye = Xe * self.W[:, None] / W
        Dm = np.zeros_like(mu); L = lt[0]
        for k in range(self.n):
            s = np.zeros_like(L)
            for j in range(self.n):
                if j != k:
                    c = self.cD[k, j]
                    s += Xe[j] / np.exp(((c[0] * L + c[1]) * L + c[2]) * L + c[3])
            Dm[k] = (1.0 - Ye[k]) / s * (ct.one_atm / p)
        return mu_mix.reshape(sh), lam_mix.reshape(sh), Dm.reshape(self.n, *sh)


def vanleer_face(q, vel, axis):
    """Limited upwind face values. q has 2 ghost layers along `axis`; returns N+1 faces."""
    q = np.moveaxis(q, axis, 0); vel = np.moveaxis(vel, axis, 0)
    d = q[1:] - q[:-1]
    dm, dp = d[:-1], d[1:]
    prod = dm * dp
    s = np.where(prod > 0, 2 * prod / np.where(prod > 0, dm + dp, 1.0), 0.0)   # slopes for cells 1..N+2 (padded idx)
    left = q[1:-2] + 0.5 * s[:-1]
    right = q[2:-1] - 0.5 * s[1:]
    return np.moveaxis(np.where(vel >= 0, left, right), 0, axis)


def pad2(q, axis, lo, hi):
    """Add two ghost layers along axis (ghost arrays lo/hi broadcast to a single layer)."""
    lo = np.expand_dims(lo, axis); hi = np.expand_dims(hi, axis)
    return np.concatenate([lo, lo, q, hi, hi], axis=axis)


class Solver:
    def __init__(self, spec: FlameL3Spec):
        self.spec = s = spec
        self.axi = s.geometry == 'axisymmetric'
        self._validate()
        nu = s.numerics
        self.nx, self.ny = nu.nx, nu.ny
        self.dx, self.dy = s.length_m / nu.nx, s.width_m / nu.ny
        self.y0 = 0.0 if self.axi else -s.width_m / 2
        self.xc = (np.arange(self.nx) + 0.5) * self.dx
        self.yc = self.y0 + (np.arange(self.ny) + 0.5) * self.dy
        self.yf = self.y0 + np.arange(self.ny + 1) * self.dy
        self.rc = self.yc.copy() if self.axi else np.ones(self.ny)
        self.rf = self.yf.copy() if self.axi else np.ones(self.ny + 1)
        self.vol = self.dx * self.dy * self.rc[None, :] * np.ones((self.nx, 1))     # per radian (axi) or per metre depth
        self.geom_factor = 2 * math.pi if self.axi else 1.0
        self.open = s.boundary == 'open'
        self._init_state()

    # -------------------------------------------------------------- validation
    def _validate(self):
        s = self.spec; a = s.ambient
        if not (math.isfinite(a.pressure_pa) and a.pressure_pa > 0):
            raise SimError('no_continuum', 'The reacting-flow solver needs a continuum gas: ambient pressure must be > 0.', field='ambient.pressure_pa',
                           recovery='A flame cannot be computed in vacuum without a separately supplied oxidizer inside a pressurised chamber.')
        if not 200 <= a.temperature_k <= 2500 or not 200 <= s.burner.fuel_temperature_k <= 2500:
            raise SimError('temperature_out_of_range', 'Ambient and fuel temperatures must be 200-2500 K.', field='ambient.temperature_k')
        xa = resolve_mixture(a.composition, a.temperature_k, a.pressure_pa)['mole_fractions']
        xf = resolve_mixture(s.burner.fuel, s.burner.fuel_temperature_k, a.pressure_pa)['mole_fractions']
        xc = resolve_mixture(s.coflow.composition, a.temperature_k, a.pressure_pa)['mole_fractions'] if s.coflow.composition else xa
        fuels = sorted({k for x in (xa, xf, xc) for k in x if k in ('CH4', 'H2', 'CO')})
        if 'CO' in fuels:
            raise SimError('unsupported_chemistry', 'CO oxidation is not available in the Level 3 one-step chemistry.', field='burner.fuel',
                           expected='CH4 or H2', recovery='Use Level 1/2 (GRI-Mech 3.0) for CO, or remove CO. No other fuel is substituted.')
        if len(fuels) > 1:
            raise SimError('unsupported_chemistry', f'Level 3 one-step chemistry supports a single fuel; found {fuels}.', field='burner.fuel', expected='CH4 or H2 only')
        self.fuel = fuels[0] if fuels else None
        if s.burner.radius_m >= (s.width_m if self.axi else s.width_m / 2):
            raise SimError('invalid_geometry', 'Burner radius must be smaller than the domain half-width.', field='burner.radius_m')
        if self.axi and (abs(s.acceleration_lateral_m_s2) > 1e-9 or any(abs(h.lateral) > 1e-9 for h in (s.acceleration_history or []))):
            raise SimError('unsupported_acceleration', 'A lateral acceleration breaks axial symmetry.', field='acceleration_lateral_m_s2',
                           expected='0 for geometry "axisymmetric"', recovery='Use geometry "planar" to study a tilted flame.')
        if s.lid_velocity_m_s and not (s.boundary == 'sealed' and not self.axi):
            raise SimError('invalid_option', 'lid_velocity is a verification option for sealed planar domains only.', field='lid_velocity_m_s')
        h = s.acceleration_history
        if h is not None:
            if len(h) < 2 or any(h[i + 1].t < h[i].t for i in range(len(h) - 1)) or not all(math.isfinite(q.t + q.axial + q.lateral) for q in h):
                raise SimError('invalid_history', 'Acceleration history needs >= 2 finite samples with non-decreasing time.', field='acceleration_history')
            if h[0].t > 0 or h[-1].t < s.numerics.duration_s - 1e-12:
                raise SimError('history_coverage', f'Acceleration history covers {h[0].t}-{h[-1].t} s but the run needs 0-{s.numerics.duration_s} s. No extrapolation is performed.',
                               field='acceleration_history', recovery='Shorten the run or supply a longer history.')
        pr = mixture_properties(xa, a.temperature_k, a.pressure_pa)
        kn = pr['mean_free_path_m'] / (2 * s.burner.radius_m)
        if kn > 0.01:
            raise SimError('rarefied', f'Knudsen number {kn:.3g} (mean free path / burner diameter) exceeds 0.01: continuum Navier-Stokes is not applicable.',
                           field='ambient.pressure_pa', recovery='Increase pressure or burner size.')
        self.x_amb, self.x_fuel, self.x_co = xa, xf, xc
        names = sorted({*xa, *xf, *xc} | ({self.fuel, 'O2', *MECH[self.fuel]['products']} if self.fuel else set()))
        self.gm = GasModel(names)

    def _Y(self, x):
        v = np.array([x.get(k, 0.0) for k in self.gm.names]) * self.gm.W
        return v / v.sum()

    # -------------------------------------------------------------- state
    def _init_state(self):
        s, gm = self.spec, self.gm
        nx, ny = self.nx, self.ny
        self.p0 = s.ambient.pressure_pa
        self.Ya, self.Yf, self.Yc = self._Y(self.x_amb), self._Y(self.x_fuel), self._Y(self.x_co)
        self.Ta = s.ambient.temperature_k
        self.Tco = s.coflow.temperature_k or self.Ta
        self.T = np.full((nx, ny), self.Ta)
        self.Y = np.repeat(self.Ya[:, None, None], nx, 1).repeat(ny, 2)
        self.u = np.zeros((nx + 1, ny)); self.v = np.zeros((nx, ny + 1)); self.p = np.zeros((nx, ny))
        yb = np.abs(self.yc)
        rb = s.burner.radius_m
        inb = yb < rb
        prof = np.where(inb, (2.0 if self.axi else 1.5) * (1 - (yb / rb) ** 2) if s.burner.profile == 'parabolic' else 1.0, 0.0)
        if inb.any() and s.burner.fuel_velocity_m_s > 0:   # renormalise so the discrete inflow equals U * area
            w = self.rc * self.dy
            target = s.burner.fuel_velocity_m_s * (rb ** 2 / 2 if self.axi else 2 * rb)
            prof *= target / np.sum(prof * w)
        else:
            prof *= 0
        ro = s.coflow.outer_radius_m or math.inf
        inco = (~inb) & (yb < ro)
        self.u_in = prof + np.where(inco, s.coflow.velocity_m_s, 0.0)
        self.inflow = self.u_in > 0
        self.T_in = np.where(inb, s.burner.fuel_temperature_k, self.Tco)
        self.Y_in = np.where(inb[None], self.Yf[:, None], self.Yc[:, None])
        self.u[0] = self.u_in
        if s.ignition.enabled:
            yi = s.ignition.y_m if s.ignition.y_m is not None else rb
            d2 = (self.xc[:, None] - s.ignition.x_m) ** 2 + (np.abs(self.yc[None, :]) - yi) ** 2
            self.T = self.Ta + (s.ignition.temperature_k - self.Ta) * np.exp(-d2 / s.ignition.radius_m ** 2)
        self.t = 0.0; self.step = 0
        M = gm.molar_mass(self.Ya)
        self.rho_amb = self.p0 * M / (RU_K * self.Ta)
        self.hrr = np.zeros((nx, ny))
        self.budget = {'mass_in': 0.0, 'energy_in': 0.0, 'elem_in': np.zeros(len(gm.elem)), 'heat_released': 0.0, 'rad_loss': 0.0, 'fuel_in': 0.0, 'pdv': 0.0}
        self.rho = self._rho(self.T, self.Y)
        self.m0 = self._integral(self.rho); self.e0 = self._elem_mass(); self.h0 = self._enthalpy_total()
        self.series = []; self.frames = []; self.clip_events = 0

    def _rho(self, T, Y):
        return self.p0 * self.gm.molar_mass(Y) / (RU_K * T)

    def _integral(self, f):
        return float(np.sum(f * self.vol)) * self.geom_factor

    def _elem_mass(self):
        return np.array([self._integral(self.rho * np.tensordot(z, self.Y, axes=1)) for z in self.gm.Z])

    def _enthalpy_total(self):
        _, h = self.gm.cp_h(self.T)
        return self._integral(self.rho * np.sum(h * self.Y, axis=0))

    def accel(self, t):
        h = self.spec.acceleration_history
        if h is None:
            return self.spec.acceleration_axial_m_s2, self.spec.acceleration_lateral_m_s2
        ts = [q.t for q in h]
        i = int(np.searchsorted(ts, t, side='right')) - 1   # right-continuous at duplicated (discontinuous) samples
        i = min(max(i, 0), len(h) - 2)
        a, b = h[i], h[i + 1]
        w = 0.0 if b.t == a.t else (t - a.t) / (b.t - a.t)
        w = min(max(w, 0.0), 1.0)
        return a.axial + w * (b.axial - a.axial), a.lateral + w * (b.lateral - a.lateral)

    # -------------------------------------------------------------- ghosts
    def _ghost_scalar(self, q, inval, ambval, wallT=None):
        """Ghost layers (bottom, top, ymin, ymax) for a cell-centred scalar."""
        bot = np.where(self.inflow, 2 * inval - q[0], q[0] if wallT is None else 2 * wallT - q[0])
        if self.open:
            top = np.where(self.u[-1] >= 0, q[-1], 2 * ambval - q[-1])
            ymax = np.where(self.v[:, -1] <= 0, 2 * ambval - q[:, -1], q[:, -1])
            ymin = q[:, 0] if self.axi else np.where(self.v[:, 0] >= 0, 2 * ambval - q[:, 0], q[:, 0])
        else:
            w = (lambda e: e) if wallT is None else (lambda e: 2 * wallT - e)
            top, ymax = w(q[-1]), w(q[:, -1])
            ymin = q[:, 0] if self.axi else w(q[:, 0])
        return bot, top, ymin, ymax

    def _div(self, u, v):
        return (u[1:] - u[:-1]) / self.dx + (self.rf[None, 1:] * v[:, 1:] - self.rf[None, :-1] * v[:, :-1]) / (self.rc[None, :] * self.dy)

    def _adv_scalar(self, q, g):
        bot, top, ymin, ymax = g
        fx = vanleer_face(pad2(q, 0, bot, top), self.u, 0)
        fx[0] = np.where(self.u[0] >= 0, 0.5 * (bot + q[0]), q[0]); fx[-1] = np.where(self.u[-1] >= 0, q[-1], 0.5 * (top + q[-1]))
        fy = vanleer_face(pad2(q, 1, ymin, ymax), self.v, 1)
        fy[:, 0] = np.where(self.v[:, 0] >= 0, 0.5 * (ymin + q[:, 0]), q[:, 0]); fy[:, -1] = np.where(self.v[:, -1] >= 0, q[:, -1], 0.5 * (ymax + q[:, -1]))
        return self._div(self.u * fx, self.v * fy) - q * self._div(self.u, self.v)

    def _grad_faces(self, q, g):
        bot, top, ymin, ymax = g
        qx = np.concatenate([bot[None], q, top[None]], 0); qy = np.concatenate([ymin[:, None], q, ymax[:, None]], 1)
        return (qx[1:] - qx[:-1]) / self.dx, (qy[:, 1:] - qy[:, :-1]) / self.dy

    def _face_avg(self, q):
        qx = np.concatenate([q[:1], q, q[-1:]], 0); qy = np.concatenate([q[:, :1], q, q[:, -1:]], 1)
        return 0.5 * (qx[1:] + qx[:-1]), 0.5 * (qy[:, 1:] + qy[:, :-1])

    # -------------------------------------------------------------- one step
    def advance(self, dt_limit=None):
        s, gm = self.spec, self.gm
        dx, dy, nx, ny = self.dx, self.dy, self.nx, self.ny
        T, Y, rho = self.T, self.Y, self.rho
        M = gm.molar_mass(Y)
        X = Y * M[None] / gm.W[:, None, None]
        cpk, hk = gm.cp_h(T)
        cp = np.sum(cpk * Y, axis=0)
        mu, lam, Dm = gm.transport(T, X, self.p0)
        nu_max = float(np.max(mu / rho)); al_max = float(np.max(lam / (rho * cp))); D_max = float(np.max(Dm))
        umax, vmax = float(np.abs(self.u).max()), float(np.abs(self.v).max())
        dt = min(s.numerics.dt_max_s, s.numerics.diffusion_number * min(dx, dy) ** 2 / max(nu_max, al_max, D_max),
                 s.numerics.cfl / (umax / dx + vmax / dy + 1e-12))
        if dt_limit is not None: dt = min(dt, dt_limit)
        self.cfl_now = dt * (umax / dx + vmax / dy)
        # ---- scalar ghosts
        wallT = s.wall_temperature_k
        gT = self._ghost_scalar(T, self.T_in, self.Ta, wallT)
        gX = [self._ghost_scalar(X[k], self._Xin[k], self._Xa[k]) for k in range(gm.n)]
        gY = [self._ghost_scalar(Y[k], self.Y_in[k], self.Ya[k]) for k in range(gm.n)]
        # ---- diffusive fluxes at faces
        rho_x, rho_y = self._face_avg(rho); lam_x, lam_y = self._face_avg(lam)
        Tx, Ty = self._grad_faces(T, gT)
        jx = np.zeros((gm.n, nx + 1, ny)); jy = np.zeros((gm.n, nx, ny + 1))
        Yfx = np.zeros_like(jx); Yfy = np.zeros_like(jy)
        closed_x = np.zeros((nx + 1, ny), bool); closed_y = np.zeros((nx, ny + 1), bool)
        closed_x[0] = ~self.inflow
        if not self.open: closed_x[-1] = True; closed_y[:, -1] = True
        if self.axi or not self.open: closed_y[:, 0] = True
        for k in range(gm.n):
            c = rho * Dm[k] * gm.W[k] / M
            cx, cy = self._face_avg(c)
            gx, gy = self._grad_faces(X[k], gX[k])
            jx[k] = np.where(closed_x, 0.0, -cx * gx); jy[k] = np.where(closed_y, 0.0, -cy * gy)
            Yfx[k], Yfy[k] = self._face_avg(Y[k])
            Yfx[k][0] = np.where(self.inflow, self.Y_in[k], Y[k][0])
        sx, sy = jx.sum(0), jy.sum(0)
        jx -= Yfx * sx[None]; jy -= Yfy * sy[None]
        qx = np.where(closed_x & (wallT is None), 0.0, -lam_x * Tx); qy = np.where(closed_y & (wallT is None), 0.0, -lam_y * Ty)
        if self.axi: qy[:, 0] = 0.0
        divf = lambda fx, fy: (fx[1:] - fx[:-1]) / dx + (self.rf[None, 1:] * fy[:, 1:] - self.rf[None, :-1] * fy[:, :-1]) / (self.rc[None, :] * dy)
        # enthalpy transport by species diffusion: sum cp_k j_k . grad T (cell average of face products)
        cpj = np.zeros((nx, ny))
        for k in range(gm.n):
            ax = jx[k] * Tx; ay = jy[k] * Ty
            cpj += cpk[k] * (0.5 * (ax[1:] + ax[:-1]) + 0.5 * (ay[:, 1:] + ay[:, :-1]))
        qrad = np.zeros((nx, ny))
        if s.radiation.model == 'gray_optically_thin' and s.radiation.planck_mean_absorption_1_m > 0:
            qrad = -4 * 5.670374419e-8 * s.radiation.planck_mean_absorption_1_m * (T ** 4 - self.Ta ** 4)
        dT_diff = (-divf(qx, qy) - cpj + qrad) / (rho * cp)
        dY_diff = np.array([-divf(jx[k], jy[k]) for k in range(gm.n)]) / rho[None]
        # ---- advection
        aT = self._adv_scalar(T, gT)
        aY = np.array([self._adv_scalar(Y[k], gY[k]) for k in range(gm.n)])
        Tn = T + dt * (dT_diff - aT)
        Yn = Y + dt * (dY_diff - aY)
        neg = Yn < 0
        if neg.any():
            self.clip_mass += float(np.sum(-Yn[neg] * np.broadcast_to(rho * self.vol, Yn.shape)[neg])) * self.geom_factor
            Yn = np.where(neg, 0.0, Yn)
        Yn /= Yn.sum(0)[None]
        # ---- boundary budgets (discrete fluxes into the domain, per radian/metre * geom factor)
        gf = self.geom_factor; wx = self.rc * dy; wy_hi = self.rf[-1] * dx; wy_lo = self.rf[0] * dx
        def bflux(fxa, fya):  # net inflow of a face-flux pair (positive = into domain)
            r = np.sum(fxa[0] * wx) - np.sum(fxa[-1] * wx) - np.sum(fya[:, -1]) * wy_hi + np.sum(fya[:, 0]) * wy_lo
            return float(r) * gf
        Tfx = np.concatenate([np.where(self.inflow, self.T_in, T[0])[None], 0.5 * (T[1:] + T[:-1]), np.where(self.u[-1] >= 0, T[-1], self.Ta)[None]], 0)
        Tfy = np.concatenate([np.where(self.v[:, 0] >= 0, self.Ta, T[:, 0])[:, None], 0.5 * (T[:, 1:] + T[:, :-1]), np.where(self.v[:, -1] <= 0, self.Ta, T[:, -1])[:, None]], 1)
        Ybx = Yfx.copy(); Yby = Yfy.copy()
        for k in range(gm.n):
            Ybx[k][-1] = np.where(self.u[-1] >= 0, Y[k][-1], self.Ya[k])
            Yby[k][:, -1] = np.where(self.v[:, -1] <= 0, self.Ya[k], Y[k][:, -1]); Yby[k][:, 0] = np.where(self.v[:, 0] >= 0, self.Ya[k], Y[k][:, 0])
        Mfx = 1.0 / np.tensordot(1.0 / gm.W, Ybx, axes=1); Mfy = 1.0 / np.tensordot(1.0 / gm.W, Yby, axes=1)
        rbx = self.p0 * Mfx / (RU_K * Tfx); rby = self.p0 * Mfy / (RU_K * Tfy)
        mfx, mfy = rbx * self.u, rby * self.v
        _, hfx = gm.cp_h(Tfx); _, hfy = gm.cp_h(Tfy)
        B = self.budget
        B['mass_in'] += dt * bflux(mfx, mfy)
        for e, z in enumerate(gm.Z):
            B['elem_in'][e] += dt * bflux(np.tensordot(z, mfx[None] * Ybx + jx, axes=1), np.tensordot(z, mfy[None] * Yby + jy, axes=1))
        B['energy_in'] += dt * bflux(np.sum(hfx * (mfx[None] * Ybx + jx), 0) + qx, np.sum(hfy * (mfy[None] * Yby + jy), 0) + qy)
        B['rad_loss'] += dt * self._integral(-qrad)
        if self.fuel:
            kf = gm.names.index(self.fuel)
            B['fuel_in'] += dt * float(np.sum((mfx[0] * Ybx[kf][0] + jx[kf][0]) * wx)) * gf
        # ---- chemistry at constant p and h (operator split, sub-cycled)
        dT_chem = np.zeros((nx, ny)); dY_chem = np.zeros_like(Y); self.hrr = np.zeros((nx, ny))
        if self.fuel and s.reaction_enabled:
            m = MECH[self.fuel]; kf = gm.names.index(self.fuel); ko = gm.names.index('O2')
            mask = (Tn > 500.0) & (Yn[kf] > 1e-10) & (Yn[ko] > 1e-10)
            if mask.any():
                Tc = Tn[mask]; Yc = Yn[:, mask]
                cpk0, hk0 = gm.cp_h(Tc); h_target = np.sum(hk0 * Yc, 0)
                nu = np.zeros(gm.n); nu[kf] = -1; nu[ko] = -m['nu_o2']
                for sp_, c in m['products'].items(): nu[gm.names.index(sp_)] = c
                dts = dt / s.numerics.chemistry_substeps
                for _ in range(s.numerics.chemistry_substeps):
                    r = self.p0 / (RU_K * Tc * np.tensordot(1.0 / gm.W, Yc, axes=1))
                    cF = np.maximum(r * Yc[kf] / gm.W[kf], 0); cO = np.maximum(r * Yc[ko] / gm.W[ko], 0)
                    q = m['A'] * np.exp(-m['Ea'] / (RU_K * Tc)) * cF ** m['a'] * cO ** m['b']
                    dxi = np.minimum(q * dts, 0.9 * np.minimum(cF, cO / m['nu_o2']))
                    dYc = (nu * gm.W)[:, None] * dxi[None] / r[None]
                    Yc = Yc + dYc
                    for _ in range(2):   # Newton on h(T, Y) = h_target
                        cpk1, hk1 = gm.cp_h(Tc)
                        Tc = Tc - (np.sum(hk1 * Yc, 0) - h_target) / np.sum(cpk1 * Yc, 0)
                dT_chem[mask] = (Tc - Tn[mask]) / dt; dY_chem[:, mask] = (Yc - Yn[:, mask]) / dt
                _, hk2 = gm.cp_h(Tn[mask])
                rr = self.p0 * gm.molar_mass(Yn[:, mask]) / (RU_K * Tn[mask])
                self.hrr[mask] = -np.sum(hk2 * dY_chem[:, mask], 0) * rr
                Tn = Tn.copy(); Tn[mask] = Tc; Yn[:, mask] = Yc
                B['heat_released'] += dt * self._integral(self.hrr)
        # ---- divergence constraint and thermodynamic pressure
        ST = (dT_diff + dT_chem) / T + M * np.tensordot(1.0 / gm.W, dY_diff + dY_chem, axes=1)
        dp0 = 0.0
        if not self.open:
            gamma = cp / (cp - RU_K / M)
            Qin = float(np.sum(self.u[0] * wx))
            dp0 = (float(np.sum(ST * self.vol)) + Qin) / float(np.sum(self.vol / (gamma * self.p0)))
            Tn = Tn + dt * dp0 / (rho * cp)
            B['pdv'] += dt * dp0 * self._integral(np.ones((nx, ny)))
            S = ST - dp0 / (gamma * self.p0)
            # Thermodynamic pressure from exact global mass conservation of the closed volume:
            # m(t) = m0 + inflow = p0 * integral( M / (R T) dV ).  The ODE value above is the predictor.
            p_ode = self.p0 + dt * dp0
            m_target = self.m0 + B['mass_in']
            p_mass = m_target / (float(np.sum(gm.molar_mass(Yn) / (RU_K * Tn) * self.vol)) * gf)
            self.p0_drift = p_mass / p_ode - 1.0
            self.p0 = p_mass
        else:
            S = ST
        if not np.all(np.isfinite(Tn)) or Tn.min() < 150 or Tn.max() > 3500:
            raise FloatingPointError(f'invalid thermodynamic state (T range {np.nanmin(Tn):.1f}-{np.nanmax(Tn):.1f} K)')
        rho_n = self._rho(Tn, Yn)
        # ---- momentum predictor
        ax_g, ay_g = self.accel(self.t)
        rho_ref = self.rho_amb if self.open else float(np.sum(rho * self.vol) / np.sum(self.vol))
        us, vs = self._momentum(mu, rho, rho_ref, ax_g, ay_g, dt)
        # ---- projection
        bx = np.zeros((nx + 1, ny)); bx[1:-1] = 2.0 / (rho_n[1:] + rho_n[:-1])
        by = np.zeros((nx, ny + 1)); by[:, 1:-1] = 2.0 / (rho_n[:, 1:] + rho_n[:, :-1])
        if self.open:
            bx[-1] = 1.0 / rho_n[-1]; by[:, -1] = 1.0 / rho_n[:, -1]
            if not self.axi: by[:, 0] = 1.0 / rho_n[:, 0]
        Ax = bx * (self.rc[None, :] * dy / dx); Ay = by * (self.rf[None, :] * dx / dy)
        rhs = (self._div(us, vs) - S) * self.vol / dt
        idx = np.arange(nx * ny).reshape(nx, ny)
        diag = np.zeros((nx, ny))
        rows, cols, vals = [], [], []
        diag[1:] += Ax[1:-1]; diag[:-1] += Ax[1:-1]
        rows += [idx[1:].ravel(), idx[:-1].ravel()]; cols += [idx[:-1].ravel(), idx[1:].ravel()]; vals += [-Ax[1:-1].ravel()] * 2
        diag[:, 1:] += Ay[:, 1:-1]; diag[:, :-1] += Ay[:, 1:-1]
        rows += [idx[:, 1:].ravel(), idx[:, :-1].ravel()]; cols += [idx[:, :-1].ravel(), idx[:, 1:].ravel()]; vals += [-Ay[:, 1:-1].ravel()] * 2
        diag[-1] += 2 * Ax[-1]; diag[:, -1] += 2 * Ay[:, -1]; diag[:, 0] += 2 * Ay[:, 0]
        if not self.open:
            rhs = rhs - rhs.mean() * 0 ; diag[0, 0] += Ax[1, 0] + 1e-30
        rows.append(idx.ravel()); cols.append(idx.ravel()); vals.append(diag.ravel())
        A = sp.csc_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(nx * ny, nx * ny))
        p = spla.splu(A).solve(-rhs.ravel()).reshape(nx, ny)
        us[1:-1] -= dt * bx[1:-1] * (p[1:] - p[:-1]) / dx
        vs[:, 1:-1] -= dt * by[:, 1:-1] * (p[:, 1:] - p[:, :-1]) / dy
        if self.open:
            us[-1] -= dt * bx[-1] * (-2 * p[-1]) / dx
            vs[:, -1] -= dt * by[:, -1] * (-2 * p[:, -1]) / dy
            if not self.axi: vs[:, 0] -= dt * by[:, 0] * (2 * p[:, 0]) / dy
        self.div_resid = float(np.abs(self._div(us, vs) - S).max())
        self.u, self.v, self.p = us, vs, p
        self.T, self.Y, self.rho = Tn, Yn, rho_n
        self.t += dt; self.step += 1; self.dt = dt
        self.mach = max(umax, vmax) / math.sqrt(1.3 * RU_K * float(T.min()) / float(M.max()))
        if self.mach > 0.3:
            raise FloatingPointError(f'low-Mach assumption violated (Mach {self.mach:.2f})')
        return dt

    def _momentum(self, mu, rho, rho_ref, gx, gy, dt):
        dx, dy, nx, ny = self.dx, self.dy, self.nx, self.ny
        u, v = self.u, self.v
        wall_side = not self.open
        lid = self.spec.lid_velocity_m_s
        # tangential ghosts
        u_hi = -u[:, -1] if wall_side else u[:, -1]
        u_lo = u[:, 0] if (self.axi or self.open) else -u[:, 0]
        v_bot = -v[0]
        v_top = v[-1] if self.open else 2 * lid - v[-1]
        up = np.concatenate([u_lo[:, None], u, u_hi[:, None]], 1)       # (nx+1, ny+2)
        vp = np.concatenate([v_bot[None], v, v_top[None]], 0)           # (nx+2, ny+1)
        D = self._div(u, v)
        dudx = (u[1:] - u[:-1]) / dx; dvdy = (v[:, 1:] - v[:, :-1]) / dy
        mup = np.pad(mu, 1, mode='edge')
        muc = 0.25 * (mup[1:, 1:] + mup[:-1, 1:] + mup[1:, :-1] + mup[:-1, :-1])      # corners (nx+1, ny+1)
        shear = (up[:, 1:] - up[:, :-1]) / dy + (vp[1:] - vp[:-1]) / dx
        txy = muc * shear
        txx = mu * (2 * dudx - 2 / 3 * D); tyy = mu * (2 * dvdy - 2 / 3 * D)
        # ---- u momentum (interior x-faces 1..nx-1)
        rho_u = 0.5 * (rho[1:] + rho[:-1])
        visc_u = (txx[1:] - txx[:-1]) / dx + (self.rf[None, 1:] * txy[1:-1, 1:] - self.rf[None, :-1] * txy[1:-1, :-1]) / (self.rc[None, :] * dy)
        ucc = 0.5 * (u[1:] + u[:-1])                                        # advecting u at cell centres (nx, ny)
        uq = np.concatenate([u[:1], u, u[-1:]], 0)                         # one ghost node each end
        fxu = vanleer_face(np.concatenate([uq[:1], uq, uq[-1:]], 0)[1:-1] if False else pad2(u, 0, u[0], u[-1])[1:-1], ucc, 0)   # faces between u nodes
        vco = 0.5 * (vp[1:] + vp[:-1])                                      # advecting v at corners (nx+1, ny+1)
        fyu = vanleer_face(pad2(u, 1, u_lo, u_hi), vco, 1)                 # (nx+1, ny+1)
        fyu[:, 0] = 0.5 * (u_lo + u[:, 0]); fyu[:, -1] = 0.5 * (u_hi + u[:, -1])
        cu_x = (ucc[1:] * fxu[1:] - ucc[:-1] * fxu[:-1]) / dx - u[1:-1] * (ucc[1:] - ucc[:-1]) / dx
        gyu = self.rf[None, :] * vco
        cu_y = ((gyu * fyu)[1:-1, 1:] - (gyu * fyu)[1:-1, :-1]) / (self.rc[None, :] * dy) - u[1:-1] * (gyu[1:-1, 1:] - gyu[1:-1, :-1]) / (self.rc[None, :] * dy)
        us = u.copy()
        us[1:-1] += dt * (-(cu_x + cu_y) + visc_u / rho_u + (1 - rho_ref / rho_u) * gx)
        if self.open: us[-1] = us[-2]
        # ---- v momentum (interior y-faces 1..ny-1)
        rho_v = 0.5 * (rho[:, 1:] + rho[:, :-1])
        rfi = self.rf[None, 1:-1]
        visc_v = (txy[1:, 1:-1] - txy[:-1, 1:-1]) / dx + (self.rc[None, 1:] * tyy[:, 1:] - self.rc[None, :-1] * tyy[:, :-1]) / (rfi * dy)
        if self.axi:
            vc = 0.5 * (v[:, 1:] + v[:, :-1]) / self.rc[None, :]
            tth = mu * (2 * vc - 2 / 3 * D)
            visc_v -= 0.5 * (tth[:, 1:] + tth[:, :-1]) / rfi
        uco = 0.5 * (up[:, 1:] + up[:, :-1])                                # advecting u at corners (nx+1, ny+1)
        fxv = vanleer_face(pad2(v, 0, v_bot, v_top), uco, 0)               # (nx+1, ny+1)
        fxv[0] = 0.5 * (v_bot + v[0]); fxv[-1] = 0.5 * (v_top + v[-1])
        vcc = 0.5 * (v[:, 1:] + v[:, :-1])                                  # advecting v at centres
        fyv = vanleer_face(pad2(v, 1, v[:, 0], v[:, -1])[:, 1:-1], vcc, 1)  # faces between v nodes (nx, ny)
        cv_x = ((uco * fxv)[1:, 1:-1] - (uco * fxv)[:-1, 1:-1]) / dx - v[:, 1:-1] * (uco[1:, 1:-1] - uco[:-1, 1:-1]) / dx
        gyv = self.rc[None, :] * vcc
        cv_y = ((gyv * fyv)[:, 1:] - (gyv * fyv)[:, :-1]) / (rfi * dy) - v[:, 1:-1] * (gyv[:, 1:] - gyv[:, :-1]) / (rfi * dy)
        vs = v.copy()
        vs[:, 1:-1] += dt * (-(cv_x + cv_y) + visc_v / rho_v + (1 - rho_ref / rho_v) * gy)
        if self.open:
            vs[:, -1] = vs[:, -2] * (self.rf[-2] / self.rf[-1] if self.axi else 1.0)
            if not self.axi: vs[:, 0] = vs[:, 1]
        return us, vs

    # -------------------------------------------------------------- diagnostics
    def diagnostics(self):
        gm = self.gm
        Q = self._integral(self.hrr)
        d = {'t': self.t, 'dt': getattr(self, 'dt', 0.0), 'p0_mass_correction_rel': getattr(self, 'p0_drift', 0.0), 'T_max': float(self.T.max()), 'hrr_total_w': Q, 'p0_pa': self.p0,
             'u_max': float(np.abs(self.u).max()), 'cfl': getattr(self, 'cfl_now', 0.0), 'mach': getattr(self, 'mach', 0.0),
             'div_residual_1_s': getattr(self, 'div_resid', 0.0)}
        ax, ay = self.accel(self.t); d['accel_axial'] = ax; d['accel_lateral'] = ay
        if 'O2' in gm.names:
            ko = gm.names.index('O2'); d['o2_mass_kg'] = self._integral(self.rho * self.Y[ko]); d['o2_min_mole_fraction'] = float((self.Y[ko] * gm.molar_mass(self.Y) / gm.W[ko]).min())
        peak = float(self.hrr.max())
        d.update(flame_height_m=None, flame_width_m=None, flame_tilt_deg=None, hrr_peak_w_m3=peak)
        if self.fuel and peak > 0:
            lhv_rate = self._fuel_power()
            if lhv_rate > 0 and Q >= 0.01 * lhv_rate:
                zone = self.hrr >= 0.1 * peak
                xs = self.xc[np.any(zone, 1)]; ys = np.abs(self.yc)[np.any(zone, 0)]
                d['flame_height_m'] = float(xs.max()) + 0.5 * self.dx
                d['flame_width_m'] = 2 * (float(ys.max()) + 0.5 * self.dy)
                if not self.axi:
                    w = self.hrr * zone
                    xcn = float(np.sum(w * self.xc[:, None]) / w.sum()); ycn = float(np.sum(w * self.yc[None, :]) / w.sum())
                    d['flame_tilt_deg'] = math.degrees(math.atan2(ycn, xcn))
        d['mass_kg'] = self._integral(self.rho)
        return d

    def _fuel_power(self):
        """Chemical power of the supplied fuel stream [W] if it reacted completely (from formation enthalpies at 298.15 K)."""
        if not self.fuel: return 0.0
        gm = self.gm; m = MECH[self.fuel]
        _, h = gm.cp_h(np.array([298.15]))
        kf, ko = gm.names.index(self.fuel), gm.names.index('O2')
        dh = h[kf, 0] * gm.W[kf] + m['nu_o2'] * h[ko, 0] * gm.W[ko] - sum(c * h[gm.names.index(k), 0] * gm.W[gm.names.index(k)] for k, c in m['products'].items())
        rho_f = self.p0 * gm.molar_mass(self.Yf) / (RU_K * self.spec.burner.fuel_temperature_k)
        inb = np.abs(self.yc) < self.spec.burner.radius_m
        mdot = float(np.sum(self.u_in[inb] * self.rc[inb] * self.dy)) * self.geom_factor * rho_f * self.Yf[kf]
        self.lhv_j_kg = dh / gm.W[kf]
        return mdot * self.lhv_j_kg

    def budgets(self):
        B = self.budget; gm = self.gm
        m = self._integral(self.rho); e = self._elem_mass(); H = self._enthalpy_total()
        thru = max(abs(B['mass_in']), 1e-300)
        scale_m = max(self.m0, 1e-300)
        out = {'mass': {'initial_kg': self.m0, 'final_kg': m, 'net_inflow_kg': B['mass_in'], 'residual_kg': m - self.m0 - B['mass_in'],
                        'residual_relative_to_initial': (m - self.m0 - B['mass_in']) / scale_m},
               'elements': {}, 'energy': {}}
        for i, el in enumerate(gm.elem):
            r = e[i] - self.e0[i] - B['elem_in'][i]
            out['elements'][el] = {'initial_kg': float(self.e0[i]), 'final_kg': float(e[i]), 'net_inflow_kg': float(B['elem_in'][i]), 'residual_kg': float(r),
                                   'residual_relative_to_initial': float(r / max(self.e0[i], 1e-300)) if self.e0[i] > 0 else None}
        r = H - self.h0 - B['energy_in'] - B['pdv'] + B['rad_loss']
        ref = max(abs(B['heat_released']), abs(B['energy_in']), 1e-300)
        out['energy'] = {'enthalpy_initial_j': self.h0, 'enthalpy_final_j': H, 'net_boundary_inflow_j': B['energy_in'], 'pressure_work_term_j': B['pdv'],
                         'radiative_loss_j': B['rad_loss'], 'residual_j': r, 'chemical_heat_released_j': B['heat_released'],
                         'residual_relative_to_reference': r / ref, 'reference': 'max(|chemical heat released|, |boundary enthalpy inflow|)'}
        out['clipping'] = {'negative_mass_fraction_mass_removed_kg': self.clip_mass, 'relative_to_initial_mass': self.clip_mass / scale_m}
        out['units_note'] = 'Axisymmetric: full 2*pi volume. Planar: per metre of depth.'
        return out

    def frame(self):
        gm = self.gm
        uc = 0.5 * (self.u[1:] + self.u[:-1]); vc = 0.5 * (self.v[:, 1:] + self.v[:, :-1])
        f = {'t': self.t, 'T': self.T, 'u': uc, 'v': vc, 'hrr': self.hrr, 'rho': self.rho, 'p_dyn': self.p}
        M = gm.molar_mass(self.Y)
        for k in gm.names:
            f['X_' + k] = self.Y[gm.names.index(k)] * M / gm.W[gm.names.index(k)]
        return {k: (v if k == 't' else np.asarray(v, dtype=np.float32)) for k, v in f.items()}

    def _prep(self):
        gm = self.gm
        M_in = 1.0 / np.tensordot(1.0 / gm.W, self.Y_in, axes=1)
        self._Xin = self.Y_in * M_in[None] / gm.W[:, None]
        self._Xa = self.Ya * gm.molar_mass(self.Ya) / gm.W
        self.clip_mass = 0.0

    def run(self, progress=None, should_stop=None, on_frame=None):
        s = self.spec; nu = s.numerics
        self._prep()
        t0 = time.time(); next_out = 0.0; status = 'completed'; reason = None
        def emit():
            d = self.diagnostics(); self.series.append(d)
            fr = self.frame(); self.frames.append(fr)
            if on_frame: on_frame(len(self.frames) - 1, fr, d)
        emit(); next_out = nu.output_interval_s
        hist_t = sorted({q.t for q in (s.acceleration_history or [])})
        try:
            while self.t < nu.duration_s - 1e-12:
                if should_stop and should_stop(): status = 'canceled'; break
                if time.time() - t0 > nu.max_wall_s: status = 'timed_out'; reason = f'wall-clock limit {nu.max_wall_s} s'; break
                if self.step >= nu.max_steps: status = 'timed_out'; reason = f'step limit {nu.max_steps}'; break
                lim = min(nu.duration_s, next_out) - self.t
                for th in hist_t:            # never step across an acceleration breakpoint
                    if th > self.t + 1e-12: lim = min(lim, th - self.t); break
                self.advance(max(lim, 1e-9))
                if self.t >= next_out - 1e-12:
                    emit(); next_out += nu.output_interval_s
                    if progress: progress(min(0.999, self.t / nu.duration_s), {'t': self.t, 'step': self.step, 'T_max': self.series[-1]['T_max']})
        except FloatingPointError as exc:
            status, reason = 'failed', f'{exc} at t = {self.t:.5f} s. The run is invalid and is not rendered as a flame.'
        if status == 'completed' and abs(self.series[-1]['t'] - self.t) > 1e-12: emit()
        return self.result(status, reason, time.time() - t0)

    def result(self, status, reason, wall):
        s = self.spec; last = self.series[-1]
        fp = self._fuel_power()
        cls = None
        if status == 'completed' and self.fuel and s.reaction_enabled:
            frac = last['hrr_total_w'] / fp if fp > 0 else 0.0
            cls = {'state': 'reacting_at_end' if frac >= 0.05 else 'no_sustained_reaction_at_end',
                   'criterion': 'integrated heat-release rate at the final time >= 5 % of the chemical power of the supplied fuel stream',
                   'hrr_over_fuel_power': frac,
                   'caveat': 'Classification of this resolved model run only. It depends on the ignition assumption, simulated duration, grid and one-step chemistry; it is not a flammability limit.'}
        return {'status': status, 'reason': reason, 'fidelity_level': 3, 'wall_time_s': wall, 'steps': self.step, 'time_reached_s': self.t,
                'grid': {'nx': self.nx, 'ny': self.ny, 'dx_m': self.dx, 'dy_m': self.dy, 'geometry': s.geometry, 'x': 'burner axis (m)', 'y': 'radius (m)' if self.axi else 'lateral (m)',
                         'x_centres_m': self.xc.tolist(), 'y_centres_m': self.yc.tolist()},
                'species': self.gm.names, 'fuel': self.fuel, 'fuel_power_w': fp, 'lower_heating_value_j_kg': getattr(self, 'lhv_j_kg', None),
                'chemistry': None if not self.fuel else {'model': 'one-step irreversible global reaction', **{k: MECH[self.fuel][k] for k in ('A', 'Ea', 'a', 'b', 'nu_o2', 'source')},
                                                         'units': 'kmol, m^3, s, J/kmol', 'enabled': s.reaction_enabled},
                'series': self.series, 'budgets': self.budgets(), 'classification': cls, 'n_frames': len(self.frames),
                'model': 'Transient 2-D %s laminar low-Mach variable-density reacting flow (SOLARIS lowmach kernel)' % s.geometry,
                'assumptions': ['Laminar, low Mach number (acoustics filtered); ideal-gas mixture',
                                'One-step global chemistry: no intermediate species, CO, soot, NOx or radicals; flame temperature is over-predicted by a few hundred K because dissociation is absent',
                                'Mixture-averaged diffusion with correction velocity; Soret/Dufour neglected',
                                'Radiation: ' + ('none (significant for slow microgravity flames)' if s.radiation.model == 'none' else 'optically thin gray gas with user-specified Planck-mean absorption coefficient'),
                                'Axisymmetric: no swirl, no 3-D instabilities. Planar: infinite slot, per-metre-depth quantities' ,
                                'Ignition is an initial hot-gas kernel (an assumption, not a modelled igniter)',
                                'Open boundaries: p\' = 0 with ambient gas on inflow; sealed: adiabatic or isothermal impermeable walls with p0(t)'],
                'definitions': {'flame_height_m': 'largest axial coordinate where volumetric heat release >= 10 % of its instantaneous peak (only when integrated HRR >= 1 % of fuel power)',
                                'flame_width_m': 'twice the largest |y| of the same region', 'flame_tilt_deg': 'planar only: atan2 of the HRR-weighted centroid (lateral, axial) from the burner centre',
                                'hrr': '-sum_k h_k omega_k [W/m^3]'}}


def run_flame_l3(spec: FlameL3Spec, progress=None, should_stop=None, on_frame=None):
    solver = Solver(spec)
    res = solver.run(progress, should_stop, on_frame)
    return res, solver
