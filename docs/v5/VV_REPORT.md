# SOLARIS 5.0 verification and validation report

This report separates **verification** (the equations are solved correctly), **validation** (comparison with independent measured or published values) and **scenario execution checks** (the workflow runs end to end; no external reference). Nothing here certifies the software for engineering or safety decisions.

Environment of the recorded run: Python 3.10.12, Cantera 3.2.0, NumPy 2.2.6, SciPy 1.15.3, Linux-6.8.0-1060-aws-x86_64-with-glibc2.35; Node v24.22.2.
Benchmarks generated 2026-11-15T14:23:33.729274+00:00 (combustion) and 2026-11-15T14:32:20.188Z (flight).

## 1. Environment, chemistry and reacting-flow benchmarks

Reproduce with `python -m backend.sim.benchmarks` (about 3 minutes).

| ID | Benchmark | Metric | Value | Acceptance | Result | Reference |
|---|---|---|---|---|---|---|
| ENV-USSA76 | Hydrostatic integration reproduces US Standard Atmosphere 1976 pressures | max relative pressure error at 11, 20, 30 km | 2.318e-05 | 0.01 | **PASS** | NOAA/NASA/USAF, U.S. Standard Atmosphere, 1976 (pressures at 11/20/30 km geopotential; geometric/geopotential difference < 0.5 % included in tolerance) |
| L1-EQ-CH4 | Adiabatic flame temperature, stoichiometric CH4/air, 298.15 K, 1 atm | T_ad [K] | 2224 | 2226 +/- 15 K | **PASS** | S. R. Turns, An Introduction to Combustion, 3rd ed., Table 2.1 lists about 2226 K for CH4/air (air as 79/21 N2/O2) |
| L1-ELEMENTS | Element conservation through equilibrium solve | max |delta element mass fraction| | 1.876e-14 | 1e-09 | **PASS** | Exact conservation law |
| L1-REACTOR-CONS | Mass and element conservation in constant-pressure reactor with ignition | max conservation error | 4.191e-15 | 1e-08 | **PASS** | Exact conservation law |
| L2-SL-CH4 | Laminar burning velocity, stoichiometric CH4/air, 300 K, 1 atm (GRI-Mech 3.0) | S_L [m/s] | 0.3822 | 0.33-0.42 | **PASS** | Measured values cluster around 0.36-0.40 m/s (e.g. Vagelopoulos & Egolfopoulos, Proc. Combust. Inst. 27 (1998) 513); GRI-Mech 3.0 is known to give about 0.38 m/s |
| L2-SL-H2 | Laminar burning velocity, stoichiometric H2/air, 300 K, 1 atm | S_L [m/s] | 2.344 | 1.9-2.6 | **PASS** | Measured values about 2.1-2.4 m/s near stoichiometric (e.g. Tse, Zhu & Law, Proc. Combust. Inst. 28 (2000) 1793) |
| L2-CF-CH4 | Counterflow CH4/air diffusion flame: reacting branch found; N2-only oxidizer yields no reacting solution | peak T [K] | 2011 | 1700-2300 K and no flame without O2 | **PASS** | Internal consistency (peak below adiabatic stoichiometric temperature; oxidizer-free control) |
| L3-VOLUME-BALANCE | Isothermal constant-density jet: discrete volume balance (inflow = outflow through open boundaries) | |net volume flux| / inflow | 1.765e-16 | 1e-08 | **PASS** | Incompressibility constraint div u = 0 enforced by the projection |
| L3-CAVITY-GHIA | Lid-driven cavity, Re = 100, 48x48 grid: centreline velocity profile | max |u/U - Ghia| | 0.005126 | 0.03 | **PASS** | Ghia, Ghia & Shin, J. Comput. Phys. 48 (1982) 387-411, Table I |
| L3-DIFFUSION | Decay of a thermal cosine mode between adiabatic walls (pure conduction at constant pressure) | relative amplitude error | 0.0002347 | 0.02 | **PASS** | Analytic: A(t) = A0 exp(-alpha pi^2 t / L^2) |
| L3-SEALED-ADIABATIC | Sealed adiabatic chamber, lean premixed CH4/air burn-out: final pressure vs constant-U,V complete-combustion reference | relative pressure error | 0.01058 | 0.03 | **PASS** | First law for a closed adiabatic rigid vessel with the same NASA-7 data |
| L3-BUOYANCY | Buoyancy sign and symmetry: hot kernel moves opposite to the effective acceleration; no drift at zero acceleration | centroid shift [m] for a = -g, 0, +g | 0.005455, -3.469e-18, -0.005455 | opposite, antisymmetric within 5 %, |zero-g| < 10 % | **PASS** | Momentum equation source (rho - rho_ref) a |
| L3-GRID | Grid sensitivity of the zero-g CH4 jet flame over 0-0.15 s (dx = 1.25, 0.83, 0.625 mm) | relative change medium->fine: [T_max, cumulative heat released]; instantaneous HRR at 0.15 s reported separately | 0.00329, 0.003913 | T_max < 3 %, cumulative heat release < 5 % | **PASS** | Self-convergence (no exact solution). Pass criterion uses peak temperature and time-integrated heat release only. |
| CPL-SIGN | Coupling sign convention: surface rest -> -g along burner axis, coast -> 0, thrust -> -a, spin -> +omega^2 r outward | [a_surface, a_coast, a_burn, a_spin] | -9.807, 0, -30, 12 | exact | **PASS** | Kinematics of a non-inertial frame |

## 2. Flight benchmarks

The same quantities are asserted by `frontend/tests/flight.test.mjs` (`npm test` in `frontend/`).

| ID | Benchmark | Metric | Value | Acceptance | Result | Reference |
|---|---|---|---|---|---|---|
| FL-SATURN-BASELINE | Legacy Saturn V adapter vs supplied baseline_flight.csv | max relative difference in t, altitude, speed, mass over all samples | 0 | 1e-09 | **PASS** | Supplied Saturn V Orbital Flight Lab V2 baseline (regression; not historical telemetry) |
| FL-EPHEM-INTERP | Hermite interpolation of cached Horizons states at doubled node spacing | worst position error / 2 km (true error at stored spacing is ~16x smaller) | 0.1228 | 1 | **PASS** | JPL Horizons DE441 nodes withheld from the interpolant |
| FL-KEPLER | Two-body circular orbit propagated for 10 periods | max of relative energy drift, angular-momentum drift, position closure | 2.412e-07 | 1e-06 | **PASS** | Analytic Kepler solution |
| FL-ROCKET-EQ | Finite burn to depletion vs Tsiolkovsky equation | relative delta-v error | 1.029e-09 | 1e-07 | **PASS** | Tsiolkovsky rocket equation |
| FL-J2-NODE | J2 nodal regression of a 500 km, 51.6 deg orbit | relative error vs first-order secular rate | 0.002212 | 0.02 | **PASS** | First-order secular J2 theory |
| FL-LAMBERT | Lambert solution vs numerically propagated heliocentric arc (150 d) | relative departure-velocity error | 1.079e-12 | 1e-06 | **PASS** | Self-consistency with the propagator |
| FL-LUNAR | Lunar transfer scenario executed end to end | final selenocentric orbit [periapsis km, apoapsis km, eccentricity] | 100, 312.4, 0.05463 | bound orbit, e < 0.1 | **PASS** | Scenario execution check (no external trajectory reference) |
| FL-MARS | Earth-Mars bounded transfer executed end to end | [C3 km^2/s^2, arrival error days, total trim delta-v m/s] | 12.01, -0.108, 104.7 | arrival at 125 km interface within 1.5 d of plan | **PASS** | Scenario execution check (no external trajectory reference) |
| FL-6DOF-FREE | Torque-free rigid body, 300 s | max relative drift of |L|, inertial L vector, rotational energy | 1.246e-10 | 1e-07 | **PASS** | Conservation laws |

## 3. What is validated, and what is not

| Item | Evidence class | Statement |
|---|---|---|
| Hydrostatic atmosphere | Validation against a published standard | Pressures at 11, 20 and 30 km agree with the U.S. Standard Atmosphere 1976. |
| Level 1 equilibrium | Validation against a textbook value | Stoichiometric CH4/air adiabatic temperature within 15 K of the reference. |
| Level 2 burning velocity | Validation against a measured range | CH4/air and H2/air laminar burning velocities fall inside the cited experimental ranges. |
| Level 3 flow solver | Verification | Ghia cavity profile, analytic conduction decay, discrete volume balance, closed-vessel first-law pressure, buoyancy sign/symmetry, grid self-convergence. |
| Level 3 flame shape, height, extinction | **Not validated** | No matching measured field data are bundled. One-step chemistry; results are model output for the stated configuration only. |
| Level 3 instantaneous heat-release rate | Grid sensitive | Changes by roughly 16 % between the two finest benchmark grids; peak temperature and cumulative heat release change by < 1 %. |
| Level 3 energy budget | Reported, not enforced | The primitive-variable scheme is not discretely conservative; the residual is printed for every run and can reach tens of percent of the released heat in the first milliseconds after forced ignition. |
| Saturn V legacy ascent | Regression | Bit-for-bit agreement with the supplied Flight Lab V2 baseline. It is an educational reconstruction, not historical telemetry. |
| N-body propagation | Verification | Kepler, Tsiolkovsky, first-order J2 regression, Lambert/propagator consistency, ephemeris interpolation against withheld JPL nodes. |
| Lunar and Earth–Mars scenarios | Scenario execution check | They run and reach their stated end conditions. They are not compared with flown or published trajectories. |
| 6-DOF demonstrator | Verification | Angular momentum and rotational energy conserved in torque-free motion. Hypothetical vehicle. |
| Flight → chamber coupling | Verification | Sign convention and time interpolation tested exactly. |
| Generated flame fields versus NASA BASS-II / Saffire / PSI records | **Not validated** | The NASA tables are shown as source evidence next to simulations; no quantitative agreement is claimed. |

## 4. Automated test suites

| Suite | Command | Result on the recorded Linux run |
|---|---|---|
| Python (existing SOLARIS + SOLARIS 5 simulation/API) | `pip install -r backend/requirements-dev.txt`, then `python -m unittest discover -s tests -t .` | 51 passed |
| Frontend (existing SOLARIS, flight engine, SOLARIS 5 integration) | `npm test` in `frontend/` | 50 passed |
| Original Saturn V Flight Lab V2 checks | `node tests.mjs` in `reference/saturn_v_flight_lab_v2/` | 16 passed |
| Production build | `npm run build` in `frontend/` | succeeded |

## 5. Browser checks (Chromium on Linux, scripted and inspected)

- All routes load without console or page errors: home, World Builder, Flame Laboratory, Flight Laboratory, Onboard, Scenarios, Scientific Report, MissionShield.
- World Builder: Mars preset evaluated, hydrostatic profile drawn, invalid mixtures rejected with the field named.
- Flame Laboratory: equilibrium run; Level 3 run with stored-frame playback and passport; scenario variants (air 2225 K versus 30 % O2 in He 2709 K); N2-only oxidizer reported as non-reacting.
- Flight Laboratory: all six scenarios executed, 3-D view and 2-D fallback toggled, replay scrubbed, run saved with passport.
- Onboard experiment: Saturn V staging window coupled to a sealed methane/air chamber; both streams exported under one experiment ID.
- Narrow viewport (390 px): no horizontal page overflow on the new pages.

## 6. Not verified

- **Windows and macOS were not run.** The start scripts for those systems are provided but untested in this release.
- Browsers other than Chromium were not exercised.
- Behaviour after a real WebGL context loss was not forced in a browser; the 2-D view is selectable manually and is used automatically when WebGL cannot be created.
- Long Level 3 runs (fine grids, seconds of physical time) beyond the benchmark set.

## 7. Performance (recorded on an 8-vCPU Linux VM)

| Task | Typical wall time |
|---|---|
| L2-SL-CH4: Laminar burning velocity, stoichiometric CH4/air, 300 K, 1 atm (GRI-Me | 20.31 s |
| L2-CF-CH4: Counterflow CH4/air diffusion flame: reacting branch found; N2-only ox | 21.47 s |
| L3-CAVITY-GHIA: Lid-driven cavity, Re = 100, 48x48 grid: centreline velocity profile | 31.93 s |
| L3-DIFFUSION: Decay of a thermal cosine mode between adiabatic walls (pure conductio | 4.69 s |
| L3-SEALED-ADIABATIC: Sealed adiabatic chamber, lean premixed CH4/air burn-out: final pressu | 10.93 s |
| L3-BUOYANCY: Buoyancy sign and symmetry: hot kernel moves opposite to the effective | 1.9 s |
| L3-GRID: Grid sensitivity of the zero-g CH4 jet flame over 0-0.15 s (dx = 1.25, | 65.67 s |
| Flight: Saturn V ascent to parking orbit (3072 samples) | 0.08 s |
| Flight: Low Earth orbit laboratory (574 samples) | 0.02 s |
| Flight: Earth–Moon transfer and lunar orbit insertion (1642 samples) | 0.41 s |
| Flight: Earth–Mars transfer (bounded example) (730 samples) | 0.04 s |
| Flight: Custom free-flight state at a chosen body (630 samples) | 0.01 s |
| Flight: 6-DOF rigid-body demonstrator (405 samples) | 0.05 s |
| Level 3 jet flame, 32×16 cells, 0.05 s (recorded run) | 1.1 s |
| Level 3 jet flame, 80×40 cells, 0.4 s (recorded run) | 60 s |
| Coupled onboard experiment, 40×20 cells, 0.6 s (recorded run) | 11 s |

Level 3 cost grows roughly with cells × steps; the interface warns before heavy runs and every job can be canceled. Progress shown is the simulated-time fraction reported by the solver.
