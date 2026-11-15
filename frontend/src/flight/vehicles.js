/** Vehicle catalogue for the general flight engine. Every entry states where its numbers come from.
 *  A vehicle can only perform what its propellant allows: burns stop at depletion. */
import { STAGES as SATURN_STAGES, PAYLOAD as SATURN_PAYLOAD } from './legacy/saturnPhysics.mjs';

const sivb = SATURN_STAGES[2];
export const VEHICLES = {
  apollo_tli_stack: {
    id: 'apollo_tli_stack', name: 'Apollo-class translunar stack (S-IVB second burn + CSM/LM-class spacecraft)',
    provenance: 'S-IVB dry mass, thrust and Isp are the legacy Saturn V Flight Lab values; S-IVB propellant is the amount assumed to remain after parking-orbit insertion (assumption). Spacecraft: service-propulsion-class engine 91 kN / 314 s, 18 400 kg propellant, 11 900 kg dry, 15 000 kg lander-class payload (rounded public figures, hypothetical configuration).',
    classification: 'historical-class approximation', payload_kg: 15000, cd: 2.2, area_m2: 33,
    stages: [
      { name: 'S-IVB (restart)', dry_kg: sivb.dry, prop_kg: 72000, thrust_vac_n: sivb.thrustVac, isp_vac_s: sivb.ispVac },
      { name: 'Service propulsion', dry_kg: 11900, prop_kg: 18400, thrust_vac_n: 91000, isp_vac_s: 314 },
    ],
    supported_missions: ['leo_coast', 'lunar_transfer'],
    limits: 'No interplanetary capability: total ideal delta-v after parking orbit is about 5.4 km/s. Ascent to orbit is available only through the legacy Saturn V baseline.',
  },
  mars_probe: {
    id: 'mars_probe', name: 'Hypothetical Mars probe with cryogenic kick stage',
    provenance: 'Hypothetical configuration defined by SOLARIS for demonstration: Centaur-class kick stage (99 kN, 450 s, 20 800 kg propellant, 2 250 kg dry) and a 1 000 kg probe with a 400 N / 320 s trim engine and 300 kg propellant. Not a real vehicle.',
    classification: 'hypothetical', payload_kg: 1000, cd: 2.2, area_m2: 12,
    stages: [
      { name: 'Kick stage', dry_kg: 2250, prop_kg: 20800, thrust_vac_n: 99000, isp_vac_s: 450 },
      { name: 'Probe trim engine', dry_kg: 0, prop_kg: 300, thrust_vac_n: 400, isp_vac_s: 320 },
    ],
    supported_missions: ['leo_coast', 'earth_mars_transfer', 'lunar_transfer'],
    limits: 'No capture, entry, descent or landing model. Starts in a parking orbit (launch not modelled).',
  },
  orbital_lab: {
    id: 'orbital_lab', name: 'Hypothetical orbital laboratory with storable-propellant engine',
    provenance: 'Hypothetical configuration defined by SOLARIS: 8 000 kg dry, 2 000 kg propellant, 20 kN / 316 s engine.',
    classification: 'hypothetical', payload_kg: 0, cd: 2.2, area_m2: 20,
    stages: [{ name: 'Orbital engine', dry_kg: 8000, prop_kg: 2000, thrust_vac_n: 20000, isp_vac_s: 316 }],
    supported_missions: ['leo_coast', 'custom'],
    limits: 'About 0.69 km/s of delta-v; orbit changes only.',
  },
};
export const SATURN_LEGACY_INFO = { payload_kg: SATURN_PAYLOAD, stages: SATURN_STAGES.map(s => ({ name: s.name, engine: s.engine, prop_kg: s.prop, dry_kg: s.dry })) };
export const cloneVehicle = id => JSON.parse(JSON.stringify(VEHICLES[id]));
