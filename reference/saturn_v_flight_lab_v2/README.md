# SATURN V · ORBITAL//LAB 2.0
## Three.js Mission Control + 3-DOF physics engine

This package includes the **Saturn V GLB provided by the user**, the 3D presentation, a separate physics solver, 16 automated physics checks, and baseline results. The interface is in Azerbaijani/English.

## OPEN ON WINDOWS (recommended)

1. Extract the ZIP fully (right-click → **Extract All**). Do not run directly from inside the ZIP.
2. Open the extracted `SaturnV_Orbital_Flight_Lab_V2` folder.
3. **Double-click `RUN_WINDOWS.bat`** (not `index.html`). It starts a local server and opens a browser tab.
4. Browser URL: **http://127.0.0.1:8000**.
5. Keep the *server terminal* open while simulating.

If Windows opens the BAT in Notepad instead of executing, open **PowerShell in that folder** and type:

```powershell
cmd /c RUN_WINDOWS.bat
```

Manual alternatives, run *in project folder*:

```powershell
py -3 -m http.server 8000
# OR
python -m http.server 8000
# OR (Node.js installed)
node server.mjs
```

Then open http://127.0.0.1:8000 . macOS/Linux: `bash RUN_MAC_LINUX.sh`.

**Three.js dependency:** the app uses `three@0.180.0` and GLTFLoader/OrbitControls from jsDelivr CDN. You need Internet to load these modules on first use (unless browser cache already has them). **The GLB, scene code and all physics are included locally.** Browser WebGL support is required. Modern Chrome/Edge are recommended.

## WHAT IS IMPLEMENTED

- Real user-supplied GLB shown on the original first stage; procedural upper stack representations appear after separation and detached stage cylinders are animated.
- Three powered stages (5 × F-1; 5 × J-2; 1 × J-2), propellant mass flow, thrust adjusted for ambient pressure, dry-mass jettison, optional target-orbit cutoff on S-IVB.
- 3D Earth-centered inertial (ECI) position and velocity and a launch site at latitude ~28.61° N; launch initially eastbound. Planet rotation and atmospheric corotation included.
- Newtonian central gravity + optional Earth J₂ gravitational perturbation.
- 1976 U.S. Standard Atmosphere: hydrostatic 7-layer lower model up to ~86 km geometric altitude; crude exponential upper-air extension up to 190 km (not full thermospheric climatology).
- Drag using air-relative velocity, frontal area and a **heuristic Mach-dependent C_D** curve with transonic peak, optional simple angle-of-attack lift approximation, eastward wind altitude profile.
- Programmed gravity-turn-like pitch steering with simple AoA limiting at high q; **not** a calibrated Saturn V guidance, autopilot, attitude dynamics or gimbal actuator.
- RK4 numerical integration of `[x,y,z,vx,vy,vz,m]` in SI units, splitting time steps at propellant depletion and staging events. Event logging includes Max-Q, stage cutoff, stage jettison and Kármán line.
- Osculating orbital apogee, perigee, eccentricity and inclination from the energy/ angular-momentum state, for comparison and learning.
- Flight graph (altitude, speed, dynamic pressure, proper acceleration), click timeline, 1–32× replay, event jumping, reference-run comparison.
- 3D cameras: follow / launch pad / Earth globe; stage separation visuals, smoke, flames, procedural Earth texture, stars, background lighting.
- Data export: CSV and detailed JSON for research comparisons; PNG screenshot.

## HOW THE INPUTS WORK

| Input | Meaning | Default |
|---|---|---|
| `m0/mf` | **S-IC FIRST-STAGE-BURN** initial-to-burnout *total vehicle* mass ratio (all upper stages are retained). Adjusts first-stage propellant load. | ~3.562 |
| Initial velocity | Initial **radial** (local vertical) launch velocity, added to ground's rotational velocity. | 0 m/s |
| Payload multiplier | Scale Apollo S/C + Instrument Unit nominal mass. | 1 |
| Engine throttle | Educational continuous scale of mass flow and thrust (historical F-1 throttle controls were not this flexible). | 1 |
| Drag multiplier | Scale estimated C_D(M). | 1 |
| Eastward wind | Peak eastward wind profile parameter (not real forecast winds). | 0 m/s |
| Pitch begins/completes | Timing of commanded pitch program relative to east-local horizon. | 0–265 s |
| Final pitch | End-of-program tilt away from local vertical. | 80° |
| AoA soft limit | Heuristic steering limiter when sufficient q and airspeed exist. | 5° |

**Do not treat this m0/mf as an overall three-stage rocket ratio.** In a staged vehicle, mass is discarded between burns; an ideal `Isp*g0*ln(m0/mf)` must be applied per individual burn interval at that stage's mass ratio. The dashboard's ideal delta-v sums individual stage-burn rocket equations with approximate fixed vacuum Isp and stage separation.

## GOVERNING EQUATIONS

The 3-DOF inertial translation model is

```
  rdot = v
  vdot = (-mu * r / |r|^3) + a_J2 + (T*b + Drag + Lift)/m
  mdot = -ThrustVac/(IspVac*g0)*throttle, while powered
  Drag = -0.5*rho*|v_rel|*v_rel*Cd(M,AoA)*Area
  v_rel = v - (Earth_omega cross r) - wind
  T(h) = ThrustVac - pressure(h)*NozzleExitArea (bounded >=0)
  q = 0.5*rho(h)*|v_rel|^2
  specific_force_g = |(T*b + Drag + Lift)/m|/g0
```

For the first stage, nominal sea-level thrust and Isp determine mass flow; vacuum thrust and effective exit area are then inferred from vacuum Isp. For upper stages, vacuum thrust and Isp determine mass flow, and approximate exit areas set ambient-pressure correction. This is an **engineering approximation** rather than a time-history of actual engine chamber pressures.

The 1976 model's lower layers use geopotential height `H=Re*h/(Re+h)` and hydrostatic lapse-rate or isothermal pressure laws. For layers above ~86 km, the upper-density exponential tail is a simplified extension rather than full 1976 altitude composition/temperature tables. Earth is spherical; no terrain, oceans, geoid, third-body solar/lunar gravity or high-fidelity upper-atmosphere winds.

## EXAMPLE BASELINE RUN

The included `reports/baseline_summary.json` and `reports/baseline_flight.csv` are produced by the same `physics.mjs` source. Defaults result in approximately:

- Launch mass: **2,953 tonnes**
- Initial thrust/weight: **1.169**
- S-IC cutoff/separation: **T+162 s** at **83 km**
- S-II cutoff/separation: **T+527 s** at **291 km**
- Target-orbit S-IVB cutoff: **T+712 s** at **277 km**
- Osculating orbit at cutoff: **~187 × 302 km**, eccentricity ~0.0087, inclination ~28.1°
- Max-Q during powered ascent: **~28.3 kPa**

These are outputs of *the simulator and its example pitch program*, **NOT Apollo 11 telemetry or a validated Saturn V flight reconstruction**. The example second-stage altitude is higher than historical staging and illustrates this lack of guidance calibration.

## VALIDATION

If Node.js is installed, from the project directory:

```bash
node tests.mjs
```

16 automated tests cover the lower-atmosphere standard reference values, atmosphere decay, Mach Cd curve, exact stage mass ratios and mass jettison, J2 gravity vs central gravity, nominal stage/event timing, mass evolution and coast, Max-Q, nominal orbit, RK4 step-size convergence, conservation of orbital energy in a vacuum point-mass circular orbit, vacuum option, perturbed run, and invalid parameter handling.

**These tests do not prove full flight-dynamics fidelity.** Browser Three.js rendering could not be exercised in the artifact build environment; the JavaScript modules were syntax-checked, the physics module was executed in Node, and the GLB was structurally inspected.

## FUNDAMENTAL LIMITATIONS / SAFETY

This is a research-oriented educational numerical model **NOT a 6-DOF or CFD simulator**. It does not simulate aerodynamic moments and dynamic stability, body inertia and attitude state, structural bending, slosh, engine transients, plume-ground interaction, hypersonic compressible flow field, launch range safety, heat-shield ablation, mission-specific Apollo flight computer or validated engine operating profiles. C_D(M) and C_L(AoA) are qualitative approximations rather than wind-tunnel/CFD coefficients. The "orbit target" condition is only a simple numerical rule; it is not historical Saturn V guidance or a flight-ready GNC system. The 3D rocket/globe scales are deliberately distorted for visibility, while physics state uses SI units. Never use the simulator for real vehicle or safety decisions.

## SOURCES / TECHNICAL REFERENCES

- NASA Langley Research Center (2024), *Loads and Sizing for Launch Vehicle Conceptual and Preliminary Design* (stage gross/prop/dry weights and F-1/J-2 ratings): https://ntrs.nasa.gov/api/citations/20240002646/downloads/05-LV_Loads_Sizing.pdf
- NASA, *Apollo by the Numbers*, mission-specific propellant and mass historical context: https://www.nasa.gov/wp-content/uploads/2023/04/sp-4029.pdf
- NOAA / NASA / USAF (1976), *U.S. Standard Atmosphere*: https://www.ngdc.noaa.gov/stp/space-weather/online-publications/miscellaneous/us-standard-atmosphere-1976/us-standard-atmosphere_st76-1562_noaa.pdf
- NASA Glenn, Metric Atmosphere Equations: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/
- NASA, What Was the Saturn V?: https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/

## FILES

```
SaturnV_Orbital_Flight_Lab_V2/
  index.html                   Mission UI
  styles.css                   UI styling
  app.mjs                      Three.js, controls, telemetry, graphs
  physics.mjs                  Standalone 3-DOF RK4 physics engine
  tests.mjs                    Automated verification
  RUN_WINDOWS.bat              Windows local-server launcher
  RUN_MAC_LINUX.sh             macOS/Linux launcher
  server.mjs                   Node.js alternative local server
  assets/SaturnV.glb           Original user-supplied model (unchanged)
  reports/baseline_summary.json
  reports/baseline_flight.csv
  README.md
```
