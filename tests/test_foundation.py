import csv
import hashlib
import io
import json
import unittest
from urllib.parse import urlencode

from backend.main import app
from backend.scientific.foundation import RAW
from tests.asgi_client import ASGIClient


client = ASGIClient(app)
BASE = '/api/v1/datasets'
COUNTS = {
    'bass-table': 122, 'bass-ii-table': 129, 'acme-normal': 207, 'acme-inverse': 120,
    'flex-table': 274, 'flex-2-table': 8, 'saffire-i-table': 4, 'saffire-ii-table': 15,
    'saffire-iii-table': 2, 'same-table': 8, 'same-r-table': 109, 'spice-table': 469,
}


def get(path, **params):
    return client.get(path + ('?' + urlencode(params) if params else ''))


class FoundationTests(unittest.TestCase):
    def test_all_original_files_rows_and_exports(self):
        inventory = get(BASE).json()
        self.assertEqual((inventory['investigation_count'], inventory['available_count'], inventory['total_source_rows']),
                         (11, 12, 1467))
        self.assertEqual({item['id']: item['row_count'] for item in inventory['items']}, COUNTS)
        for dataset in inventory['items']:
            with self.subTest(dataset=dataset['id']):
                url = f"{BASE}/{dataset['id']}"
                original = (RAW / dataset['file']).read_bytes()
                download = get(url + '/original')
                self.assertEqual(download.content, original)
                self.assertEqual(dataset['sha256'], hashlib.sha256(original).hexdigest())
                header, *raw_rows = list(csv.reader(io.StringIO(original.decode(dataset['encoding']), newline='')))
                evidence = get(url + '/export', format='json').json()
                self.assertEqual([list(r['values'].values()) for r in evidence['rows']], raw_rows)
                self.assertEqual(dataset['columns'], header)
                first = get(url + '/rows', limit=1).json()['items'][0]
                self.assertEqual(get(url + '/rows/1').json()['id'], first['id'])
                entries = get(url + '/rows', offset=len(raw_rows)-1).json()['items']
                self.assertEqual(entries[0]['source_row'], len(raw_rows))
                self.assertFalse(dataset['quality']['structural_issues'])
                for field in dataset['fields']:
                    self.assertEqual(sum(field['counts'].values()), len(raw_rows))
                distribution = get(url + '/summary', field=header[0]).json()
                self.assertEqual(distribution['row_count'], len(raw_rows))
                rules = json.dumps([{'field': header[0], 'op': 'eq', 'value': raw_rows[0][0]}])
                matching_count = sum(row[0] == raw_rows[0][0] for row in raw_rows)
                self.assertEqual(get(url + '/rows', filters=rules).json()['total'], matching_count)
                derived = list(csv.reader(io.StringIO(get(url + '/export', filters=rules).content.decode('utf-8-sig'))))
                self.assertEqual(len(derived), matching_count + 1)

    def test_dataset_specific_semantics_and_units(self):
        self.assertEqual(get(BASE + '/flex-table').json()['encoding'], 'cp1252')
        roles = get(BASE + '/saffire-ii-table').json()['quality']['row_roles']
        self.assertEqual(roles, {'source_record': 9, 'pre_test_reference': 2, 'source_note': 4})
        shelf = get(BASE + '/same-table').json()['quality']['row_roles']
        self.assertEqual(shelf['condition_reference'], 4)
        self.assertEqual(get(BASE + '/flex-2-table').json()['quality']['row_roles'], {'parameter_listing': 8})
        for dataset, key in [('bass-ii-table', 'Air display'), ('flex-table', 'Burning rate; mm'),
                             ('flex-2-table', 'Initial Droplet Diameter (mm)')]:
            self.assertIsNone(get(f'{BASE}/{dataset}/summary', field=key).json()['numeric'])
        results = get(BASE + '/saffire-iii-table/summary', field='Air Flow ').json()
        self.assertEqual(results['field']['unit_status'], 'source_cell')
        self.assertEqual(results['numeric']['median'], 30)
        for variant, expected in [('normal', 207), ('inverse', 120)]:
            result = get(f'{BASE}/acme-{variant}/rows', search='RAMP').json()
            self.assertTrue(0 < result['total'] < expected)
            self.assertTrue(all(row['values']['Flame Type'].lower() == variant for row in result['items']))

    def test_bad_inputs_and_combined_filters(self):
        url = BASE + '/bass-ii-table'
        for rules in ['oops', '[{"field":[]}]', '[{"field":"Air display","op":"gte","value":"1"}]']:
            self.assertEqual(get(url + '/rows', filters=rules).status_code, 422)
        self.assertEqual(get(url + '/rows/130').status_code, 404)
        self.assertEqual(get(BASE + '/unknown').status_code, 404)
        rules = json.dumps([{'field': 'Calibrated  initial O2 % by vol ', 'op': 'gte', 'value': '22'}])
        result = get(url + '/rows', filters=rules, search='PMMA', limit=100).json()
        self.assertGreater(result['total'], 0)
        for row in result['items']:
            self.assertIn('PMMA', row['values']['Fuel Sample Material'].upper())
            self.assertGreaterEqual(float(row['values']['Calibrated  initial O2 % by vol ']), 22)
