"""Phase 1: lossless source tables, conservative typed views, isolated queries."""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
import re
from collections import Counter
from functools import lru_cache
from .tables import INVESTIGATIONS, RAW, psi_listing, psi_url, site_investigation_id

VERSION = '1.0'
NUMBER = re.compile(r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$')
UNITS = {'mg/s', 'mg/min', 'cm/s', 'sccm', 'mmHg', 'atm', 'mm', 'cm', 'K', 'C', 'W', 's', 'sec', 'minutes', 'ppm', 'mole fraction'}
MISSING = {'n/a', 'na', 'nan', 'null'}
WARNING = ('Source table rows are not verified individual experiments. No cross-investigation pooling, '
           'calibration conversion, causal inference or validated fire-risk prediction is performed.')

def definitions():
    for inv, name, topic, accession, paths in INVESTIGATIONS:
        for index, path in enumerate(paths):
            variant = ('normal' if index == 0 else 'inverse') if inv == 'ACME' else 'table'
            yield {'id': inv.lower() + '-' + variant, 'investigation': inv, 'site_investigation': site_investigation_id(inv),
                   'name': name, 'topic': topic, 'accession': accession, 'variant': variant, 'file_index': index, 'file': path}

def decode_source(raw):
    try:
        return raw.decode('utf-8-sig'), 'utf-8-sig'
    except UnicodeDecodeError:
        return raw.decode('cp1252'), 'cp1252'

def unit_for(header):
    header = header.strip()
    if '% by vol' in header: return '% by volume'
    if header.startswith('Percent O2'): return '% (basis unspecified)'
    if header == 'Oxygen Mole Fraction': return 'mole fraction'
    for unit in sorted(UNITS, key=len, reverse=True):
        if f'({unit})' in header or header.endswith('; ' + unit): return unit
    return None

def parse_cell(value, unit=None, *, require_suffix=False):
    if value is None or not value.strip(): return {'kind': 'blank', 'number': None}
    text = value.strip()
    if text.casefold() in MISSING: return {'kind': 'missing_token', 'number': None}
    numeric = text
    # Strip only an exact header-declared unit. Never convert or infer units from other columns.
    if unit in UNITS and numeric.endswith(' ' + unit):
        numeric = numeric[:-len(unit)].strip()
    elif require_suffix:
        return {'kind': 'descriptor', 'number': None}
    if NUMBER.fullmatch(numeric):
        number = float(numeric)
        if math.isfinite(number):
            upper = {'mole fraction': 1, '% by volume': 100, '% (basis unspecified)': 100}.get(unit)
            if upper is not None and not 0 <= number <= upper:
                return {'kind': 'out_of_range', 'number': None}
            return {'kind': 'scalar', 'number': number}
    return {'kind': 'descriptor', 'number': None}

def field_schema(header, values, inv):
    unit = unit_for(header)
    # SAFFIRE-III has no units in these headers. Require the audited suffix per cell.
    cell_unit = {'Sample Thickness': 'cm', 'Sample Length': 'cm', 'Sample Width': 'cm',
                 'Air Flow': 'cm/s'}.get(header.strip()) if inv == 'SAFFIRE-III' else None
    unit = unit or cell_unit
    kinds = Counter(parse_cell(v, unit, require_suffix=bool(cell_unit))['kind'] for v in values)
    identifier = any(s in header.casefold() for s in ['test', 'sample #', 'sample number', 'camera', 'gmt', 'date']) or header in ('Day', 'PI')
    instrument = header in ('Air display', 'Fan display', 'Flow restrictor') or header.startswith('Radiometer gain')
    ambiguous = header == 'Burning rate; mm' or '?' in header
    numeric = bool(kinds['scalar']) and not identifier and not ambiguous and not instrument
    notes = []
    if instrument: notes.append('Raw instrument setting/display; not calibrated air speed.')
    if unit is None: notes.append('Unit not established by the source header; no unit inferred.')
    if ambiguous: notes.append('Ambiguous source label/unit. Numeric summaries disabled pending Phase 2 documentation.')
    if inv == 'FLEX-2': notes.append('Table includes parameter ranges/options; no expansion into synthetic tests.')
    if cell_unit: notes.append('Unit appears in source cells. Only values with the explicit suffix are eligible.')
    unit_status = 'source_cell' if cell_unit else 'source_header' if unit else 'unspecified'
    return {'key': header, 'label': header.strip(), 'unit': unit, 'unit_status': unit_status,
            'numeric_summary_allowed': numeric, 'identifier': identifier, 'instrument_display': instrument,
            'counts': {k: kinds[k] for k in ('blank', 'missing_token', 'scalar', 'descriptor', 'out_of_range')}, 'notes': notes}

def row_role(investigation, values):
    if investigation in ('SAFFIRE-I', 'SAFFIRE-II'):
        sample = (values.get('Sample Number', values.get('Sample Number ')) or '').strip()
        if re.match(r'^Note \d+', sample, re.IGNORECASE):
            return 'source_note'
        if (values.get('Material') or '').casefold().startswith('pre-test flow'):
            return 'pre_test_reference'
    if investigation == 'FLEX-2':
        return 'parameter_listing'
    if investigation == 'SAME' and ': same conditions as' in (values.get('Sample Material  ') or ''):
        return 'condition_reference'
    if not any((value or '').strip() for value in values.values()):
        return 'blank'
    return 'source_record'

@lru_cache(maxsize=24)
def _snapshot(dataset_id, mtime, size):
    definition = next(d for d in definitions() if d['id'] == dataset_id)
    raw = (RAW / definition['file']).read_bytes()
    text, encoding = decode_source(raw)
    reader = csv.reader(io.StringIO(text, newline=''), strict=True)
    columns = next(reader, [])
    if not columns or len(set(columns)) != len(columns) or any(not c.strip() for c in columns):
        raise ValueError('Duplicate or blank source headers require explicit mapping')
    rows, issues = [], []
    previous_line = reader.line_num
    for n, cells in enumerate(reader, 1):
        start, end = previous_line + 1, reader.line_num
        previous_line = end
        if len(cells) != len(columns): issues.append({'source_row': n, 'kind': 'column_count', 'actual': len(cells), 'expected': len(columns)})
        values = {k: cells[j] if j < len(cells) else None for j, k in enumerate(columns)}
        rows.append({'id': f'{dataset_id}:row:{n}', 'source_row': n, 'source_line_start': start,
                     'source_line_end': end, 'role': row_role(definition['investigation'], values),
                     'values': values, 'extra_cells': cells[len(columns):]})
    schema = [field_schema(c, [r['values'][c] for r in rows], definition['investigation']) for c in columns]
    duplicate_rows = len(rows) - len({json.dumps(r['values'], sort_keys=True) for r in rows})
    listing = psi_listing(definition['file'], len(raw))
    meta = {**definition, 'available': True, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
            'encoding': encoding, 'row_count': len(rows), 'columns': columns, 'fields': schema,
            'row_semantics': 'Parameter ranges/options are present; individual-test semantics not established' if definition['investigation'] == 'FLEX-2' else 'Source table records; individual-test semantics not independently established',
            'source_url': psi_url(definition['accession']),
            'psi_listing': listing,
            'provenance_status': listing['statement'] if listing['status'] == 'name_and_size_match' else
                                 'NASA experimental table supplied with SOLARIS; it could not be matched to the PSI file listing. Treat as unverified.',
            'quality': {'structural_issues': issues, 'duplicate_content_rows': duplicate_rows,
                        'row_roles': dict(Counter(r['role'] for r in rows)),
                        'out_of_range_cells': sum(s['counts']['out_of_range'] for s in schema),
                        'blank_cells': sum(s['counts']['blank'] for s in schema),
                        'missing_token_cells': sum(s['counts']['missing_token'] for s in schema)},
            'warning': WARNING}
    return meta, rows

def dataset(dataset_id):
    definition = next((d for d in definitions() if d['id'] == dataset_id), None)
    if definition is None: raise KeyError(dataset_id)
    path = RAW / definition['file']
    stat = path.stat()
    return _snapshot(dataset_id, stat.st_mtime_ns, stat.st_size)

def registry():
    result = []
    for d in definitions():
        try: result.append(dataset(d['id'])[0])
        except (OSError, ValueError, csv.Error):
            result.append({**d, 'available': False, 'error': 'Source unavailable or invalid', 'row_count': 0})
    return {'schema_version': VERSION, 'investigation_count': len(INVESTIGATIONS), 'dataset_count': len(result),
            'available_count': sum(d['available'] for d in result), 'total_source_rows': sum(d['row_count'] for d in result), 'items': result, 'warning': WARNING}

def query_rows(meta, rows, search='', filters='[]'):
    try: rules = json.loads(filters)
    except (ValueError, TypeError): raise ValueError('filters must be a JSON array')
    if not isinstance(rules, list) or len(rules) > 12: raise ValueError('At most 12 filters are allowed')
    fields = {s['key']: s for s in meta['fields']}
    for rule in rules:
        if (not isinstance(rule, dict) or not isinstance(rule.get('field'), str)
                or rule['field'] not in fields or rule.get('op') not in ('eq','contains','missing','gte','lte')):
            raise ValueError('Unknown field or filter operator')
        if rule['op'] != 'missing' and not isinstance(rule.get('value'), str): raise ValueError('Filter values must be strings')
        if rule['op'] in ('gte','lte'):
            if not fields[rule['field']]['numeric_summary_allowed'] or parse_cell(rule['value'])['kind'] != 'scalar':
                raise ValueError('Numeric filters require a permitted field and finite scalar')
    def matches(row):
        if search.strip().casefold() not in ' '.join(v or '' for v in row['values'].values()).casefold(): return False
        for rule in rules:
            value = row['values'][rule['field']]
            schema = fields[rule['field']]
            parsed = parse_cell(value, schema['unit'], require_suffix=schema['unit_status'] == 'source_cell')
            op, wanted = rule['op'], rule.get('value', '')
            if op == 'eq' and (value or '') != wanted: return False
            if op == 'contains' and wanted.casefold() not in (value or '').casefold(): return False
            if op == 'missing' and parsed['kind'] not in ('blank','missing_token'): return False
            if op in ('gte','lte'):
                number = parsed['number']
                if number is None or (op == 'gte' and number < float(wanted)) or (op == 'lte' and number > float(wanted)): return False
        return True
    return [r for r in rows if matches(r)]

def summarize(meta, rows, field):
    schema = next((s for s in meta['fields'] if s['key'] == field), None)
    if schema is None: raise ValueError('Unknown summary field')
    parsed = [parse_cell(r['values'][field], schema['unit'],
                         require_suffix=schema['unit_status'] == 'source_cell') for r in rows]
    kinds = Counter(p['kind'] for p in parsed)
    categories = Counter(r['values'][field] for r in rows if r['values'][field] is not None)
    top = categories.most_common(20)
    values = [p['number'] for p in parsed if p['number'] is not None] if schema['numeric_summary_allowed'] else []
    numeric = None
    if values:
        ordered = sorted(values); n = len(values)
        # Values retained in source units; no derived physical claim.
        lower, upper = ordered[(n-1)//2], ordered[n//2]
        numeric = {'count': n, 'min': ordered[0], 'max': ordered[-1],
                   'median': lower if lower == upper else lower / 2 + upper / 2,
                   'excluded_rows': len(rows)-n, 'unit': schema['unit']}
    return {'field': schema, 'scope': 'all filtered source rows in this dataset only', 'row_count': len(rows),
            'counts': dict(kinds), 'numeric': numeric,
            'categories': [{'value': value, 'count': count} for value,count in top],
            'other_category_rows': sum(categories.values()) - sum(c for _,c in top)}
