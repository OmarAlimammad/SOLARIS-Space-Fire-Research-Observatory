"""SOLARIS 5 simulation platform tests: environment, chemistry, Level 3 solver, coupling, jobs and API."""
import hashlib
import io
import json
import math
import tempfile
import time
import unittest
import zipfile
from pathlib import Path

try:  # the simulation engine is optional: skip cleanly where numpy/scipy/cantera are not installed
    import cantera  # noqa: F401
    import scipy  # noqa: F401
except ImportError as _exc:  # pragma: no cover
    raise unittest.SkipTest(f"simulation engine not installed: {_exc}")

from backend.sim import jobs
from backend.sim.errors import SimError
from backend.sim.environment import (Composition, EnvironmentSpec, evaluate_environment, hydrostatic_profile,
                                     inspect_mixture, normalize_mixture, presets, resolve_mixture)
from backend.sim import chemistry as chem
from backend.sim.coupling import Chamber, FlightExcerpt, FlightSample, chamber_history
from backend.sim.lowmach import FlameL3Spec, run_flame_l3
from backend.sim.capabilities import capabilities
from tests.asgi_client import ASGIClient
from backend.main import app

ROOT = Path(__file__).resolve().parents[1]
AIR = {'species': {'N2': 0.79, 'O2': 0.21}}
client = ASGIClient(app)
_tmp = tempfile.TemporaryDirectory()


def setUpModule():
    jobs.ROOT = Path(_tmp.name)


def tearDownModule():
    _tmp.cleanup()


def preset(pid):
    return EnvironmentSpec(**next(p for p in presets() if p['kind'] == pid))


def wait(run_id, timeout=240):
    end = time.time() + timeout
    while time.time() < end:
        st = client.get(f'/api/v5/runs/{run_id}').json()
        if st['status'] in ('completed', 'failed', 'canceled', 'timed_out', 'non_converged'):
            return st
        time.sleep(0.25)
    raise AssertionError('run did not finish')


def submit(kind, spec, **kw):
    r = client.post('/api/v5/runs', json={'kind': kind, 'spec': spec, **kw})
    assert r.status_code == 200, r.text
    return r.json()['run_id']


class MixtureTests(unittest.TestCase):
    def test_unnormalized_mixture_is_rejected_not_silently_fixed(self):
        bad = Composition(species={'N2': 0.7, 'O2': 0.2})
        info = inspect_mixture(bad)
        self.assertFalse(info['within_tolerance'])
        self.assertAlmostEqual(info['residual'], -0.1)
        with self.assertRaises(SimError) as cm:
            resolve_mixture(bad, 300, 101325)
        self.assertEqual(cm.exception.code, 'mixture_not_normalized')
        fixed = normalize_mixture(bad)
        self.assertAlmostEqual(sum(fixed['after'].values()), 1.0)
        self.assertAlmostEqual(fixed['after']['O2'], 0.2 / 0.9)

    def test_invalid_fractions_identify_the_field(self):
        for species, code in (({'N2': 1.2, 'O2': -0.2}, 'negative_fraction'), ({'N2': 0.5, 'Xx': 0.5}, 'unknown_species'), ({}, 'empty_mixture')):
            p = inspect_mixture(Composition(species=species))['problems']
            self.assertEqual(p[0]['code'], code)
            self.assertTrue(p[0]['field'].startswith('composition.species'))

    def test_mass_and_mole_bases_agree(self):
        mole = resolve_mixture(Composition(basis='mole', species={'N2': 0.79, 'O2': 0.21}), 300, 101325)
        M = 0.79 * 0.0280134 + 0.21 * 0.0319988
        mass = resolve_mixture(Composition(basis='mass', species={'N2': 0.79 * 0.0280134 / M, 'O2': 0.21 * 0.0319988 / M}), 300, 101325)
        self.assertAlmostEqual(mass['mole_fractions']['O2'], 0.21, places=4)
        self.assertAlmostEqual(mole['mole_fractions']['O2'], 0.21, places=12)
        vol = resolve_mixture(Composition(basis='volume', species=AIR['species']), 300, 101325)
        self.assertEqual(vol['mole_fractions'], mole['mole_fractions'])

    def test_humidity_adds_water_and_flags_supersaturation(self):
        dry = resolve_mixture(Composition(species=AIR['species']), 300, 101325)
        wet = resolve_mixture(Composition(species=AIR['species'], humidity={'mode': 'relative_humidity', 'relative_humidity': 0.5}), 300, 101325)
        self.assertNotIn('H2O', dry['mole_fractions'])
        self.assertTrue(0.01 < wet['mole_fractions']['H2O'] < 0.03)
        self.assertAlmostEqual(sum(wet['mole_fractions'].values()), 1.0, places=12)
        self.assertAlmostEqual(wet['mole_fractions']['O2'] / wet['mole_fractions']['N2'], 0.21 / 0.79, places=9)
        with self.assertRaises(SimError) as cm:
            evaluate_environment(EnvironmentSpec(**{**next(p for p in presets() if p['kind'] == 'sealed_chamber'), 'temperature_k': 300.0, 'composition': {'species': {'N2': 0.5, 'H2O': 0.5}}}))
        self.assertEqual(cm.exception.code, 'condensing_state')
        with self.assertRaises(SimError) as cm:
            resolve_mixture(Composition(species={'N2': 0.9, 'H2O': 0.1}, humidity={'mode': 'relative_humidity', 'relative_humidity': 0.5}), 300, 101325)
        self.assertEqual(cm.exception.code, 'humidity_double_count')


class EnvironmentTests(unittest.TestCase):
    def test_earth_sea_level_state(self):
        r = evaluate_environment(preset('earth_reference'))
        self.assertAlmostEqual(r['properties']['density_kg_m3'], 1.225, delta=0.001)
        self.assertAlmostEqual(r['properties']['sound_speed_m_s'], 340.3, delta=0.5)
        self.assertAlmostEqual(r['acceleration']['magnitude_m_s2'], 9.80665, delta=0.01)

    def test_hydrostatic_profile_matches_standard_atmosphere(self):
        prof = hydrostatic_profile(preset('earth_reference'), 20000, 81)
        z, p = prof['altitude_m'], prof['pressure_pa']
        at = lambda h: p[min(range(len(z)), key=lambda i: abs(z[i] - h))]
        self.assertAlmostEqual(at(11000) / 22632.1, 1, delta=0.01)
        self.assertAlmostEqual(at(20000) / 5474.9, 1, delta=0.01)
        self.assertTrue(all(b < a for a, b in zip(p, p[1:])))

    def test_vacuum_has_no_gas_state_and_no_division_by_zero(self):
        for pid in ('moon_surface', 'interplanetary_vacuum'):
            r = evaluate_environment(preset(pid))
            self.assertTrue(r['properties']['vacuum'], pid)
            self.assertEqual(r['properties']['density_kg_m3'], 0.0)
            self.assertNotIn('sound_speed_m_s', r['properties'])
            self.assertTrue(any('unavailable, not zero' in w for w in r['warnings']), pid)
            json.dumps(r, allow_nan=False)

    def test_mars_is_co2_low_pressure(self):
        r = evaluate_environment(preset('mars_reference'))
        self.assertGreater(r['mixture']['mole_fractions']['CO2'], 0.9)
        self.assertLess(r['properties']['density_kg_m3'], 0.03)
        self.assertAlmostEqual(r['acceleration']['magnitude_m_s2'], 3.72, delta=0.03)

    def test_rotating_habitat_gives_centripetal_acceleration(self):
        p = next(p for p in presets() if p['kind'] == 'rotating_habitat')
        a = p['acceleration']
        r = evaluate_environment(EnvironmentSpec(**p))
        self.assertAlmostEqual(r['acceleration']['magnitude_m_s2'], a['omega_rad_s'] ** 2 * a['radius_m'], delta=1e-6)

    def test_out_of_range_inputs_are_structured_errors(self):
        base = next(p for p in presets() if p['kind'] == 'earth_reference')
        for patch in ({'temperature_k': -5}, {'pressure_pa': -1}, {'temperature_k': float('nan')}):
            with self.assertRaises((SimError, ValueError)):
                evaluate_environment(EnvironmentSpec(**{**base, **patch}))


class ChemistryTests(unittest.TestCase):
    def test_equilibrium_methane_air_conserves_elements(self):
        r = chem.equilibrium(chem.EquilibriumSpec(oxidizer=AIR))
        self.assertAlmostEqual(r['final']['temperature_k'], 2225, delta=15)
        self.assertLess(r['checks']['max_element_mass_fraction_change'], 1e-10)
        self.assertEqual(r['fidelity_level'], 1)

    def test_hydrogen_is_hotter_and_oxygen_enrichment_raises_temperature(self):
        h2 = chem.equilibrium(chem.EquilibriumSpec(fuel={'species': {'H2': 1}}, oxidizer=AIR))['final']['temperature_k']
        ch4 = chem.equilibrium(chem.EquilibriumSpec(oxidizer=AIR))['final']['temperature_k']
        rich = chem.equilibrium(chem.EquilibriumSpec(oxidizer={'species': {'N2': 0.7, 'O2': 0.3}}))['final']['temperature_k']
        self.assertGreater(h2, ch4 + 100)
        self.assertGreater(rich, ch4 + 200)

    def test_reactor_ignites_hot_and_not_cold_and_conserves_mass(self):
        hot = chem.reactor(chem.ReactorSpec(oxidizer=AIR, temperature_k=1400, duration_s=0.2))
        cold = chem.reactor(chem.ReactorSpec(oxidizer=AIR, temperature_k=600, duration_s=0.05))
        self.assertTrue(hot['ignition']['detected'])
        self.assertFalse(cold['ignition']['detected'])
        self.assertEqual(hot['checks']['mass_change_kg'], 0.0)
        self.assertLess(hot['checks']['max_element_mass_fraction_change'], 1e-10)

    def test_premixed_burning_velocity_reference(self):
        r = chem.premixed_flame(chem.PremixedFlameSpec(oxidizer=AIR))
        self.assertEqual(r['status'], 'completed')
        self.assertAlmostEqual(r['laminar_burning_velocity_m_s'], 0.38, delta=0.04)

    def test_no_oxidizer_is_reported_as_non_reacting_not_as_a_flame(self):
        r = chem.counterflow_flame(chem.CounterflowSpec(oxidizer={'species': {'N2': 1.0}}))
        self.assertEqual((r['status'], r['solution_branch']), ('completed', 'non_reacting'))
        self.assertEqual(r['integrated_heat_release_w_m2'], 0.0)

    def test_unsupported_species_and_state_are_rejected(self):
        with self.assertRaises((SimError, ValueError)):
            chem.equilibrium(chem.EquilibriumSpec(fuel={'species': {'C12H26': 1}}, oxidizer=AIR))
        with self.assertRaises((SimError, ValueError)):
            chem.equilibrium(chem.EquilibriumSpec(oxidizer=AIR, pressure_pa=0))


class Level3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = dict(ambient={'composition': AIR}, numerics={'nx': 40, 'ny': 20, 'duration_s': 0.08, 'output_interval_s': 0.02})
        cls.frames = []
        cls.res, _ = run_flame_l3(FlameL3Spec(**cls.spec), on_frame=lambda *a, **k: cls.frames.append(1))

    def test_fields_are_computed_and_flame_ignites(self):
        r = self.res
        self.assertEqual((r['status'], r['fidelity_level']), ('completed', 3))
        self.assertGreater(max(q['T_max'] for q in r['series']), 1500)
        self.assertGreater(r['series'][-1]['hrr_total_w'], 0)
        self.assertGreaterEqual(r['n_frames'], 3)
        self.assertEqual(len(self.frames), r['n_frames'])
        self.assertLess(max(q['mach'] for q in r['series']), 0.1)
        self.assertLess(max(abs(q['div_residual_1_s']) for q in r['series']), 1e-6)
        self.assertEqual(r['grid']['nx'], 40)

    def test_budgets_are_reported_and_bounded(self):
        b = self.res['budgets']
        self.assertLess(abs(b['mass']['residual_relative_to_initial']), 0.01)
        for el in ('N', 'O'):
            self.assertLess(abs(b['elements'][el]['residual_relative_to_initial']), 0.01)
        self.assertTrue(math.isfinite(b['energy']['residual_relative_to_reference']))

    def test_is_deterministic(self):
        again, _ = run_flame_l3(FlameL3Spec(**self.spec))
        self.assertEqual([q['T_max'] for q in again['series']], [q['T_max'] for q in self.res['series']])

    def test_without_reaction_or_oxygen_nothing_burns(self):
        for patch in ({'reaction_enabled': False}, {'ambient': {'composition': {'species': {'N2': 1.0}}}}):
            r, _ = run_flame_l3(FlameL3Spec(**{**self.spec, **patch, 'ignition': {'enabled': False}}))
            self.assertLess(max(q['hrr_total_w'] for q in r['series']), 1e-6, patch)
            self.assertNotEqual((r['classification'] or {}).get('state'), 'reacting_at_end')
            self.assertLess(max(q['T_max'] for q in r['series']), 301)

    def test_cancellation_stops_early(self):
        calls = []
        r, _ = run_flame_l3(FlameL3Spec(**self.spec), should_stop=lambda: len(calls) > 3 or calls.append(1))
        self.assertEqual(r['status'], 'canceled')
        self.assertLess(r['time_reached_s'], 0.08)

    def test_unsupported_configuration_is_explicit(self):
        with self.assertRaises(SimError) as cm:
            run_flame_l3(FlameL3Spec(ambient={'composition': {'species': {'N2': 0.74, 'O2': 0.21, 'CO': 0.05}}}))
        self.assertEqual(cm.exception.code, 'unsupported_chemistry')
        with self.assertRaises((SimError, ValueError)):
            run_flame_l3(FlameL3Spec(ambient={'composition': AIR, 'pressure_pa': 0}))


class CouplingTests(unittest.TestCase):
    def excerpt(self, samples):
        return FlightExcerpt(flight_run_id='t', vehicle='v', mission='m', model='test', samples=[FlightSample(**s) for s in samples])

    def test_sign_convention(self):
        g = 9.80665
        const = lambda f: self.excerpt([{'t': 0, 'specific_force_body': f}, {'t': 10, 'specific_force_body': f}])
        h = lambda fl, ch=Chamber(): chamber_history(fl, ch, 0, 5, False)['history'][0].axial
        self.assertAlmostEqual(h(const([g, 0, 0])), -g)          # at rest on the pad: gas feels 1 g toward the engines
        self.assertEqual(h(const([0, 0, 0])), 0)                  # free fall / coast
        self.assertAlmostEqual(h(const([30, 0, 0])), -30)         # thrust
        spin = self.excerpt([{'t': t, 'specific_force_body': [0, 0, 0], 'omega_body': [0, 0, 2.0]} for t in (0, 10)])
        self.assertAlmostEqual(h(spin, Chamber(position_body_m=[3.0, 0, 0])), 12.0)

    def test_time_interpolation_and_window_bounds(self):
        fl = self.excerpt([{'t': t, 'specific_force_body': [t, 0, 0]} for t in range(0, 11)])
        out = chamber_history(fl, Chamber(), 2.0, 4.0, False)
        hist = out['history']
        self.assertAlmostEqual(hist[0].t, 0.0)
        self.assertAlmostEqual(hist[0].axial, -2.0)
        self.assertAlmostEqual(hist[-1].axial, -6.0)
        with self.assertRaises(SimError):
            chamber_history(fl, Chamber(), 8.0, 5.0, False)


class ApiTests(unittest.TestCase):
    def test_capabilities_are_honest(self):
        c = client.get('/api/v5/capabilities').json()
        self.assertEqual(c['matrix'], json.loads(json.dumps(capabilities()['matrix'])))
        l4 = next(l for l in c['fidelity_levels'] if l['level'] == 4)
        self.assertEqual(l4['status'], 'NOT IMPLEMENTED')
        self.assertIn('O2', [x['id'] for x in c['species_registry']])

    def test_validation_errors_are_structured(self):
        r = client.post('/api/v5/environment/evaluate', json={**next(p for p in presets() if p['kind'] == 'earth_reference'), 'composition': {'species': {'N2': 0.7, 'O2': 0.2}}})
        self.assertEqual(r.status_code, 422)
        e = r.json()['error']
        self.assertEqual(e['code'], 'mixture_not_normalized')
        self.assertTrue(e['field'] and e['recovery'])
        r = client.post('/api/v5/runs', json={'kind': 'nonsense', 'spec': {}})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(client.get('/api/v5/runs/does-not-exist').status_code, 404)

    def test_run_lifecycle_passport_and_export(self):
        rid = submit('equilibrium', {'oxidizer': AIR}, label='t')
        self.assertEqual(wait(rid)['status'], 'completed')
        res = client.get(f'/api/v5/runs/{rid}/result').json()['result']
        self.assertAlmostEqual(res['final']['temperature_k'], 2225, delta=15)
        p = client.get(f'/api/v5/runs/{rid}/passport').json()
        text = json.dumps(p).lower()
        for word in ('assumption', 'limitation', 'validation', 'sha256', 'gri'):
            self.assertIn(word, text)
        self.assertNotIn('validated against nasa', text)
        z = zipfile.ZipFile(io.BytesIO(client.get(f'/api/v5/runs/{rid}/export').content))
        names = z.namelist()
        self.assertTrue({'manifest.json', 'result.json', 'passport.json', 'report.md'} <= set(names), names)
        # identical input -> identical input hash and identical result
        rid2 = submit('equilibrium', {'oxidizer': AIR})
        wait(rid2)
        a, b = (client.get(f'/api/v5/runs/{r}').json() for r in (rid, rid2))
        self.assertEqual(a['input_sha256'], b['input_sha256'])
        self.assertEqual(client.get(f'/api/v5/runs/{rid2}/result').json()['result']['final'], res['final'])

    def test_level3_job_frames_and_cancel(self):
        rid = submit('flame_l3', {'ambient': {'composition': AIR}, 'numerics': {'nx': 32, 'ny': 16, 'duration_s': 0.04, 'output_interval_s': 0.01}})
        self.assertEqual(wait(rid)['status'], 'completed')
        f = client.get(f'/api/v5/runs/{rid}/frames/-1?fields=T,hrr').json()
        self.assertEqual(len(f['fields']['T']['data']), f['nx'] * f['ny'])
        self.assertGreater(f['fields']['T']['max'], 1000)
        big = submit('flame_l3', {'ambient': {'composition': AIR}, 'numerics': {'nx': 96, 'ny': 48, 'duration_s': 0.5}})
        time.sleep(2)
        client.post(f'/api/v5/runs/{big}/cancel', json={})
        self.assertEqual(wait(big, 30)['status'], 'canceled')

    def test_coupled_run_shares_experiment_id_and_exports_both_streams(self):
        samples = [{'t': float(t), 'specific_force_body': [40.0 if t < 3 else 2.0, 0, 0]} for t in (0, 1, 2, 2.95, 3, 4, 5, 6)]
        flight = {'flight_run_id': 'F-1', 'vehicle': 'test vehicle', 'mission': 'test', 'model': '3-DOF test', 'samples': samples,
                  'events': [{'t': 3.0, 'name': 'cutoff'}], 'telemetry': {'t': [s['t'] for s in samples], 'altitude_m': [0.0] * len(samples)}}
        rid = submit('coupled_flame', {'experiment_name': 't', 'flight': flight, 'window_start_s': 2.9, 'chamber': {},
                                       'flame': {'boundary': 'sealed', 'ambient': {'composition': AIR}, 'numerics': {'nx': 32, 'ny': 16, 'duration_s': 0.2, 'output_interval_s': 0.05}}},
                     experiment_id='EXP-test')
        st = wait(rid)
        self.assertEqual(st['status'], 'completed', st)
        self.assertEqual(st['experiment_id'], 'EXP-test')
        r = client.get(f'/api/v5/runs/{rid}/result').json()['result']
        h = r['coupling']['history']
        self.assertAlmostEqual(h[0]['axial'], -40.0)
        self.assertAlmostEqual(h[-1]['axial'], -2.0)
        self.assertEqual(r['coupling']['events_in_window'][0]['name'], 'cutoff')
        self.assertAlmostEqual(r['coupling']['events_in_window'][0]['t_chamber'], 0.1, places=6)
        self.assertEqual(r['flight']['flight_run_id'], 'F-1')
        names = zipfile.ZipFile(io.BytesIO(client.get(f'/api/v5/runs/{rid}/export').content)).namelist()
        self.assertTrue({'flight_specific_force.csv', 'series.csv', 'result.json', 'passport.json'} <= set(names), names)
        self.assertTrue(any(n.startswith('frames/') for n in names))

    def test_scenarios_are_served(self):
        s = client.get('/api/v5/scenarios').json()['scenarios']
        self.assertEqual(len([x for x in s if x['origin'] == 'bundled']), 12)
        one = client.get(f"/api/v5/scenarios/{s[0]['id']}").json()
        self.assertTrue(one['payload'] and one['expected_behaviour'])


class ProtectedAssetTests(unittest.TestCase):
    def test_saturn_assets_are_byte_identical_to_the_supplied_ones(self):
        sha = lambda p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
        self.assertEqual(sha('frontend/public/models/SaturnV.glb'), '6c44497bce54ee0b09d0edb8e33a6f484762a320dab1c54b383e434f5bba06b5')
        self.assertEqual(sha('frontend/src/flight/legacy/saturnPhysics.mjs'), 'f48e006aa9d1cd77f3c942d1c79d7f9eafbed0f6608c19d53386df40cd8245ba')

    def test_verification_report_is_present_and_passing(self):
        rep = json.loads((ROOT / 'docs/v5/benchmark_report.json').read_text())['benchmarks']
        self.assertGreaterEqual(len(rep), 14)
        self.assertEqual([k for k, v in rep.items() if v['status'] != 'PASS' and not v.get('external')], [])


if __name__ == '__main__':
    unittest.main()
