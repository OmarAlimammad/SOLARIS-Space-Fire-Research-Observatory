/**
 * SOLARIS simplified flame-transport model — EDUCATIONAL, UNCALIBRATED.
 *
 * It answers one qualitative question: which transport mechanism is likely to
 * dominate around a small flame — buoyancy, an imposed (ventilation) flow, or
 * diffusion — using an order-of-magnitude buoyant velocity scale:
 *
 *     u_b ≈ sqrt( g_eff · L · ΔT / T∞ )
 *
 * with an assumed flame length scale L and temperature-rise ratio ΔT/T∞.
 * It does NOT predict flame-spread rates, extinction, flame temperature or risk.
 */
export const G0 = 9.80665; // m/s²
export const EARTH_RADIUS_KM = 6371;

export const ASSUMPTIONS = {
  lengthScaleM: 0.01, // 1 cm characteristic flame size
  deltaTRatio: 4, // (T_flame − T∞)/T∞ ≈ (1500 K − 300 K)/300 K, order of magnitude
  microgravityEffectiveG: 1e-6 * 9.80665, // representative residual acceleration in orbit (order of magnitude)
  regimeRatio: 3, // one mechanism "dominates" when its velocity scale is ≥ 3× the other
  diffusionFloorCmS: 1, // below ~1 cm/s total, transport is described as diffusion-dominated
};

export const ENVIRONMENTS = {
  earth: { label: 'Earth surface', gEff: G0, gLocal: G0, pressureKPa: 101.3, o2Pct: 20.9, freeFall: false,
    note: 'Full buoyancy. Hot gases rise and draw fresh air toward the flame.' },
  iss: { label: 'ISS orbit (~400 km)', gEff: ASSUMPTIONS.microgravityEffectiveG, gLocal: gravityAtAltitude(400), pressureKPa: 101.3, o2Pct: 20.9, freeFall: true,
    note: 'Gravity is still ~89 % of surface gravity, but the station is in free fall, so the effective acceleration in the cabin is tiny.' },
  moon: { label: 'Moon surface', gEff: 1.62, gLocal: 1.62, pressureKPa: 101.3, o2Pct: 20.9, freeFall: false,
    note: 'Partial gravity. Cabin pressure and O₂ shown are an Earth-like assumption for a habitat; adjust them.' },
  mars: { label: 'Mars surface', gEff: 3.71, gLocal: 3.71, pressureKPa: 101.3, o2Pct: 20.9, freeFall: false,
    note: 'Partial gravity. Cabin pressure and O₂ shown are an Earth-like assumption for a habitat; adjust them.' },
};

export function gravityAtAltitude(km) {
  return G0 * (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + km)) ** 2;
}

export function buoyantVelocityCmS(gEff, a = ASSUMPTIONS) {
  if (!(gEff >= 0)) return NaN;
  return Math.sqrt(gEff * a.lengthScaleM * a.deltaTRatio) * 100;
}

export function o2PartialPressureKPa(o2Pct, pressureKPa) {
  return (o2Pct / 100) * pressureKPa;
}

/**
 * @returns {{ub:number, uf:number, regime:string, regimeLabel:string, ppO2:number, shape:object, warnings:string[]}}
 */
export function analyse({ gEff, flowCmS, o2Pct, pressureKPa }, a = ASSUMPTIONS) {
  const ub = buoyantVelocityCmS(gEff, a);
  const uf = Math.max(0, flowCmS);
  const ppO2 = o2PartialPressureKPa(o2Pct, pressureKPa);
  let regime;
  if (ub + uf < a.diffusionFloorCmS) regime = 'diffusion';
  else if (ub >= a.regimeRatio * uf) regime = 'buoyancy';
  else if (uf >= a.regimeRatio * ub) regime = 'forced';
  else regime = 'mixed';
  const regimeLabel = {
    diffusion: 'Diffusion-dominated (very little bulk flow)',
    buoyancy: 'Buoyancy-dominated',
    forced: 'Imposed-flow dominated',
    mixed: 'Mixed buoyant + imposed flow',
  }[regime];
  const total = ub + uf + 0.0001;
  // Illustrative mapping to a drawing — NOT a computed flame geometry.
  const shape = {
    elongation: 1 + 1.6 * (ub / total) * Math.min(1, ub / 20), // tall when buoyancy dominates
    lean: Math.min(1, uf / (ub + 10)) * (uf > 0 ? 1 : 0), // lean downstream with imposed flow
    roundness: regime === 'diffusion' ? 1 : 0.35 + 0.65 * (1 - Math.min(1, total / 40)),
    intensity: Math.max(0.15, Math.min(1.25, ppO2 / 21.2)), // relative to sea-level air
  };
  const warnings = [];
  if (ppO2 < 14) warnings.push('O₂ partial pressure is well below sea-level air. Many materials may not sustain a flame, but SOLARIS does not compute flammability limits.');
  if (o2Pct > 30) warnings.push('Oxygen-enriched atmospheres are known to increase flammability hazards. The drawing does not quantify this.');
  if (regime === 'diffusion') warnings.push('With almost no flow, NASA experiments report flames can weaken or extinguish at low flow speeds (see linked findings). This model does not decide whether a flame survives.');
  return { ub, uf, regime, regimeLabel, ppO2, shape, warnings };
}
