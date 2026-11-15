# SOLARIS 5.0 methods and equations

SI units throughout. Each section names the code that implements it. Limits are summarised in `CAPABILITY_MATRIX.md`; evidence in `VV_REPORT.md`.

## 1. Environment and gas mixtures (`backend/sim/environment.py`, `gasdata.py`)

- Species registry: N2, O2, Ar, CO2, H2O, He, H2, CH4, CO. Ideal-gas mixture, `p = rho R_u T / M`, `M = sum X_k M_k`.
- Composition may be entered on a mole, volume (identical to mole for ideal gases) or mass basis. Fractions must be finite, non-negative and sum to 1 within 1e-6; otherwise the request is rejected (`mixture_not_normalized`). Normalisation `X_k <- X_k / sum X` is a separate explicit action that reports the scale factor.
- Humidity: a dry composition plus relative humidity gives `X_H2O = RH p_sat(T) / p`, the dry species being scaled by `(1 - X_H2O)`. Entering H2O and a relative humidity together is rejected. Water or CO2 partial pressure above saturation is rejected as a condensing state (no two-phase model).
- Properties (cp, cv, gamma, sound speed, viscosity, conductivity) come from Cantera NASA-7 polynomials and mixture-averaged transport. At `p = 0` they are reported as unavailable, not as zero.
- Effective acceleration: body gravity `g = g_ref (R/r)^2` or `mu / r^2`; free fall gives 0; constant-acceleration laboratory uses the entered vector; rotating habitat uses `omega^2 r` (Coriolis terms are not solved, an indicator is reported).
- Hydrostatic profile: `dp/dz = -rho g(r)`, `rho = p M / (R_u T(z))`, piecewise-linear `T(z)` layers, RK4 in `ln p`. Earth uses the seven U.S. Standard Atmosphere 1976 geopotential layers; Mars uses a simplified mean lapse-rate model; custom worlds use the entered mass, radius and layers. Custom worlds are local sandboxes and are never inserted into Solar-System dynamics.

## 2. Level 1 – thermochemistry and reactors (`backend/sim/chemistry.py`)

Cantera 3.2 with GRI-Mech 3.0 (extended with inert He) or the H2/O2 submechanism.

- Equilibrium: Gibbs minimisation at constant (H,P), (U,V) or (T,P). Element mass fractions before and after are compared and reported.
- Homogeneous reactor: `dY_k/dt = omega_k M_k / rho`, energy equation at constant pressure or constant volume, CVODE. Ignition is declared only if the temperature rises by at least 400 K; the delay is the time of maximum dT/dt. "No ignition within the simulated time" is not a flammability statement.

## 3. Level 2 – one-dimensional reference flames

- Freely propagating premixed flame: steady 1-D conservation equations with mixture-averaged transport, adaptive grid; the eigenvalue is the laminar burning velocity.
- Counterflow diffusion flame: similarity equations on the stagnation streamline between opposed fuel and oxidizer nozzles. If the oxidizer stream contains no O2 the result is the non-reacting branch and is labelled so. Solver failure is returned as `non_converged`, never as extinction.

## 4. Level 3 – transient 2-D laminar reacting flow (`backend/sim/lowmach.py`)

Variable-density low-Mach-number equations on an axisymmetric (x, r) or planar (x, y) domain:

```
p(x,t) = p0(t) + p'(x,t),  rho = p0 M / (R_u T)
DY_k/Dt = (1/rho)( -div j_k + omega_k )
rho cp DT/Dt = div(lambda grad T) - sum_k cp_k j_k . grad T - sum_k h_k omega_k + dp0/dt + q_rad
rho Du/Dt = -grad p' + div tau + (rho - rho_ref) a_eff(t)
div u = (1/T) DT/Dt + M sum_k (1/M_k) DY_k/Dt - (1/p0) dp0/dt
j_k = -rho D_km (M_k/M) grad X_k + correction velocity (sum_k j_k = 0)
```

- Chemistry: one irreversible global step, `fuel + nu O2 -> products`, rate `A exp(-Ea/R_u T) [fuel]^a [O2]^b`; CH4 parameters from Westbrook and Dryer (1981), H2 from Marinov, Westbrook and Pitz (1995). No intermediates, CO, soot or NOx. Other fuels are rejected.
- Transport: pure-species viscosity, conductivity and binary diffusion coefficients from Cantera, fitted in ln T; Wilke and Mathur mixture rules.
- Optional radiation: optically thin gray loss `q_rad = -4 sigma kappa_P (T^4 - T_amb^4)` with a user-stated Planck-mean coefficient.
- Numerics: uniform staggered (MAC) grid; van Leer limited advection; second-order central diffusion; explicit Euler transport with sub-cycled chemistry; variable-coefficient pressure projection solved directly; time step limited by advective and diffusive stability numbers.
- Boundaries: fuel inlet and optional coflow, symmetry axis, open outflow; or a sealed adiabatic vessel where `p0(t)` follows from the enclosed mass.
- Ignition: optional localised hot kernel at t = 0, stated in the run record. The run is classified only by its own computed heat release ("reacting at end" / "no sustained reaction at end"); no universal oxygen threshold is used.
- Diagnostics stored with every run: mass, element and energy budget residuals, maximum Mach number, divergence residual, CFL number, clipped mass, flame height/width definitions.

## 5. Flight dynamics (`frontend/src/flight/`)

- Time and frames: epochs in UTC are converted to seconds past J2000 using TT − UTC = 69.184 s (37 leap seconds, valid from 2017 until a new leap second is announced); TDB is taken equal to TT (difference below 2 ms neglected). States are integrated in ICRF axes about a stated centre (Sun, Earth, Moon or Mars); centre changes are explicit phase boundaries. Body-fixed and local-vertical quantities are derived for diagnostics.
- Ephemerides: Sun, planets and Moon states from JPL Horizons (DE441), cached for 2026–2032 in `frontend/public/ephemeris/` and interpolated with cubic Hermite polynomials. Requests outside the cache fail with `ephemeris_range`. `tools/fetch_ephemeris.py` regenerates the cache.
- Translational 3-DOF equations about centre c:
  `r'' = -mu_c r/|r|^3 + sum_b mu_b [ (r_b - r)/|r_b - r|^3 - r_b/|r_b|^3 ] + a_J2 + a_drag + T/m`, `m' = -|T| / (Isp g0)`.
  Drag: `a = -(1/2) rho |v_rel| v_rel Cd A / m` with `v_rel` relative to the co-rotating atmosphere plus wind.
- Integration: adaptive Dormand–Prince 5(4) with dense output; phase-ending events (target delta-v reached, propellant depletion, periapsis/apoapsis, altitude crossing, distance to or closest approach of a body, osculating-element targets) are located by root finding on the dense interpolant.
- Burns are finite: constant thrust and specific impulse per engine, attitude laws prograde, retrograde, radial, orbit-normal and inertial-fixed. Stage dry mass is dropped at separation. Delivered delta-v is integrated and compared with the Tsiolkovsky value per stage. If propellant runs out the phase ends with outcome `depletion`.
- Transfer planning: universal-variable Lambert solution gives the initial guess; the trajectory is then propagated with the full force model and corrected by bounded one-parameter searches and trim burns.
- Legacy Saturn V: `frontend/src/flight/legacy/saturnPhysics.mjs` is the supplied model, byte-identical (3-DOF, RK4, programmed pitch, 1976 atmosphere). An adapter converts its output to the common result format. It is limited to ascent to low Earth orbit.
- 6-DOF demonstrator (`sixdof.js`): `q' = (1/2) q ⊗ omega`, `I omega' = tau - omega × (I omega)`, thrust applied at an offset producing torque `r × F`, two-body gravity. Hypothetical vehicle only.

## 6. Onboard coupling (`backend/sim/coupling.py`)

The flight result supplies the specific force `f` (non-gravitational acceleration) in the body frame, plus body rates. Gas in a chamber at position `r` from the centre of mass experiences

```
a_eff = -( f + alpha × r + omega × (omega × r) )
```

projected on the chamber burner and lateral axes and interpolated linearly in time onto the experiment window. This history is the body-acceleration input of the Level 3 solver. Gravity does not appear because it acts equally on vehicle and gas. Coupling is one-way: the chamber does not act on the vehicle. Neglected: gravity gradient, Coriolis acceleration of the gas, vibration. The largest change of acceleration between flight samples inside the window is reported as an unresolved-variation indicator.

## 7. Provenance

Each run stores its validated input, SHA-256 of the canonical input, software and library versions, mechanism file hashes, status history and result. The Simulation Passport adds assumptions, applicability, numerical diagnostics, the related benchmark results and the validation statement. Exports contain the manifest, passport, result, time series, field frames (NumPy `.npz`) and, for coupled runs, the flight specific-force stream under the same experiment ID.
