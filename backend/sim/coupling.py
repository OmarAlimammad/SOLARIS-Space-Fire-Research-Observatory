"""One-way flight -> onboard chamber coupling.

Sign convention (tested):  the flight model supplies the vehicle *specific force* f, i.e. its
non-gravitational acceleration (thrust + aerodynamic + contact forces) / mass, expressed in the
body frame.  Gas in a chamber fixed to the vehicle experiences the apparent body acceleration
    a_eff = -( f + alpha x r + omega x (omega x r) )
where r is the chamber position relative to the centre of mass.  Hence
  * at rest on a surface: f = +g (up)  ->  a_eff = g downward (normal gravity);
  * unpowered orbital coast or free fall: f = 0  ->  a_eff = 0 (microgravity);
  * thrusting along +x_body: a_eff points along -x_body (hot gas rises toward the nose).
Gravity itself never appears: it acts equally on vehicle and gas.  Neglected: gravity-gradient,
Coriolis acceleration of the moving gas (-2 omega x u), vibration/g-jitter, structural flexing.
The chamber does not act back on the vehicle (one-way coupling).
"""
from __future__ import annotations

import math
from typing import Literal

import numpy as np
from pydantic import Field

from .environment import Strict
from .errors import SimError
from .lowmach import AccelSample, FlameL3Spec


class FlightSample(Strict):
    t: float
    specific_force_body: list[float] = Field(..., min_length=3, max_length=3)
    omega_body: list[float] = Field([0.0, 0.0, 0.0], min_length=3, max_length=3)
    alpha_body: list[float] = Field([0.0, 0.0, 0.0], min_length=3, max_length=3)


class FlightEvent(Strict):
    t: float
    name: str = Field(..., max_length=200)


class FlightExcerpt(Strict):
    flight_run_id: str = Field(..., max_length=120)
    vehicle: str = Field(..., max_length=200)
    mission: str = Field(..., max_length=200)
    model: str = Field(..., max_length=300)
    time_scale: str = Field('mission elapsed time (s)', max_length=100)
    body_frame: str = Field('x = longitudinal (thrust) axis toward nose; y, z = lateral', max_length=300)
    input_hash: str = Field('', max_length=128)
    samples: list[FlightSample] = Field(..., min_length=2, max_length=20000)
    events: list[FlightEvent] = Field([], max_length=500)
    telemetry: dict[str, list[float]] = Field({}, description='optional additional columns aligned with samples (altitude_m, speed_m_s, mass_kg ...)')


class Chamber(Strict):
    name: str = Field('Sealed combustion chamber', max_length=120)
    position_body_m: list[float] = Field([0.0, 0.0, 0.0], min_length=3, max_length=3)
    burner_axis_body: list[float] = Field([1.0, 0.0, 0.0], min_length=3, max_length=3)
    lateral_axis_body: list[float] = Field([0.0, 1.0, 0.0], min_length=3, max_length=3)


class CoupledSpec(Strict):
    experiment_name: str = Field('Flame aboard a spacecraft', max_length=160)
    flight: FlightExcerpt
    chamber: Chamber = Chamber()
    window_start_s: float
    flame: FlameL3Spec
    coupling: Literal['one_way'] = 'one_way'


def chamber_history(flight: FlightExcerpt, chamber: Chamber, t0: float, duration: float, planar: bool) -> dict:
    b = np.array(chamber.burner_axis_body, float); l = np.array(chamber.lateral_axis_body, float); r = np.array(chamber.position_body_m, float)
    if not (np.all(np.isfinite(b)) and np.linalg.norm(b) > 1e-9):
        raise SimError('invalid_orientation', 'Burner axis must be a finite non-zero vector.', field='chamber.burner_axis_body')
    b = b / np.linalg.norm(b)
    l = l - np.dot(l, b) * b
    if np.linalg.norm(l) < 1e-9:
        raise SimError('invalid_orientation', 'Lateral axis must not be parallel to the burner axis.', field='chamber.lateral_axis_body')
    l = l / np.linalg.norm(l)
    ts = np.array([s.t for s in flight.samples])
    if np.any(np.diff(ts) < 0) or not np.all(np.isfinite(ts)):
        raise SimError('invalid_flight_samples', 'Flight sample times must be finite and non-decreasing.', field='flight.samples')
    if not math.isfinite(t0) or t0 < ts[0] - 1e-9 or t0 + duration > ts[-1] + 1e-9:
        raise SimError('window_outside_flight', f'Chamber window {t0:.3f}-{t0 + duration:.3f} s is outside the flight record {ts[0]:.3f}-{ts[-1]:.3f} s. No extrapolation is performed.',
                       field='window_start_s', recovery='Move the window inside the simulated flight or shorten the combustion run.')
    A = []
    for s in flight.samples:
        f = np.array(s.specific_force_body, float); w = np.array(s.omega_body, float); al = np.array(s.alpha_body, float)
        if not np.all(np.isfinite(np.concatenate([f, w, al]))):
            raise SimError('invalid_flight_samples', f'Non-finite flight sample at t = {s.t}.', field='flight.samples')
        A.append(-(f + np.cross(al, r) + np.cross(w, np.cross(w, r))))
    A = np.array(A)
    ax, lat = A @ b, A @ l
    perp = A - np.outer(ax, b) - (np.outer(lat, l) if planar else 0)
    i0 = int(np.searchsorted(ts, t0, side='right')) - 1; i1 = int(np.searchsorted(ts, t0 + duration, side='left'))
    i0 = max(i0, 0); i1 = min(i1, len(ts) - 1)

    def interp(arr, t, right):
        i = int(np.searchsorted(ts, t, side='right' if right else 'left')) - (1 if right else 0)
        i = min(max(i, 0 if right else 1), len(ts) - (2 if right else 1))
        a, c = (i, i + 1) if right else (i - 1, i)
        w = 0.0 if ts[c] == ts[a] else (t - ts[a]) / (ts[c] - ts[a])
        return float(arr[a] + w * (arr[c] - arr[a]))

    hist = [AccelSample(t=0.0, axial=interp(ax, t0, True), lateral=interp(lat, t0, True) if planar else 0.0)]
    for i in range(i0 + 1, i1):
        if ts[i] > t0 and ts[i] < t0 + duration:
            hist.append(AccelSample(t=float(ts[i] - t0), axial=float(ax[i]), lateral=float(lat[i]) if planar else 0.0))
    hist.append(AccelSample(t=duration, axial=interp(ax, t0 + duration, False), lateral=interp(lat, t0 + duration, False) if planar else 0.0))
    sel = (ts >= t0) & (ts <= t0 + duration)
    neglected = float(np.linalg.norm(perp[sel], axis=1).max()) if sel.any() else 0.0
    return {'history': hist, 'burner_axis_body': b.tolist(), 'lateral_axis_body': l.tolist(),
            'max_unresolved_acceleration_m_s2': neglected,
            'unresolved_note': ('Acceleration components outside the 2-D plane' if planar else 'Acceleration components perpendicular to the burner axis (cannot be represented in an axisymmetric model)') +
                               f' reach {neglected:.4g} m/s^2 in this window and are NOT applied.',
            'events_in_window': [{'t_flight': e.t, 't_chamber': e.t - t0, 'name': e.name} for e in flight.events if t0 <= e.t <= t0 + duration]}


def prepare_coupled(spec: CoupledSpec) -> tuple[FlameL3Spec, dict]:
    planar = spec.flame.geometry == 'planar'
    dur = spec.flame.numerics.duration_s
    h = chamber_history(spec.flight, spec.chamber, spec.window_start_s, dur, planar)
    if not planar and h['max_unresolved_acceleration_m_s2'] > 0.05 * max(1e-6, max(abs(q.axial) for q in h['history'])) and h['max_unresolved_acceleration_m_s2'] > 1e-3:
        raise SimError('off_axis_acceleration', h['unresolved_note'] + ' This exceeds 5 % of the axial component.', field='chamber.burner_axis_body',
                       recovery='Align the burner axis with the acceleration, or use the planar geometry with a lateral axis.')
    flame = spec.flame.model_copy(update={'acceleration_history': h['history']})
    info = {k: v for k, v in h.items() if k != 'history'}
    info['history'] = [q.model_dump() for q in h['history']]
    info['time_mapping'] = {'t_chamber': 't_flight - window_start_s', 'window_start_s': spec.window_start_s, 'duration_s': dur, 'interpolation': 'piecewise linear between flight samples; duplicated sample times are treated as discontinuities; no extrapolation'}
    info['sign_convention'] = 'a_eff = -(f + alpha x r + omega x (omega x r)); f = vehicle specific force in body frame'
    info['coupling'] = 'one-way (flight -> chamber). The chamber exerts no force, torque or mass change on the vehicle.'
    return flame, info
