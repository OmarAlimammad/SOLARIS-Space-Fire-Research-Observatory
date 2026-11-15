"""Versioned API for isolated experimental table exploration."""
import csv
import io
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from .foundation import dataset, registry, query_rows, summarize, RAW

router = APIRouter(prefix='/api/v1')

def source(dataset_id):
    try: return dataset(dataset_id)
    except KeyError: raise HTTPException(404, 'Unknown dataset ID')
    except (OSError, ValueError, csv.Error): raise HTTPException(503, 'Source file unavailable or invalid')

def filtered(meta, rows, search, filters):
    try: return query_rows(meta, rows, search, filters)
    except ValueError as exc: raise HTTPException(422, str(exc))

@router.get('/datasets')
def datasets(): return registry()

@router.get('/datasets/{dataset_id}')
def metadata(dataset_id: str): return source(dataset_id)[0]

@router.get('/datasets/{dataset_id}/rows')
def rows(dataset_id: str, search: str = Query('', max_length=200), filters: str = Query('[]', max_length=6000),
         offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    meta, records = source(dataset_id)
    matching = filtered(meta, records, search, filters)
    return {'dataset_id': dataset_id, 'sha256': meta['sha256'], 'total': len(matching), 'offset': offset,
            'limit': limit, 'items': matching[offset:offset+limit]}

@router.get('/datasets/{dataset_id}/summary')
def summary(dataset_id: str, field: str, search: str = Query('', max_length=200), filters: str = Query('[]', max_length=6000)):
    meta, records = source(dataset_id)
    matching = filtered(meta, records, search, filters)
    try: return summarize(meta, matching, field)
    except ValueError as exc: raise HTTPException(422, str(exc))

@router.get('/datasets/{dataset_id}/rows/{source_row}')
def row_detail(dataset_id: str, source_row: int):
    meta, records = source(dataset_id)
    if not 1 <= source_row <= len(records):
        raise HTTPException(404, 'Source row not found')
    return {**records[source_row - 1], 'sha256': meta['sha256']}

@router.get('/datasets/{dataset_id}/export')
def export(dataset_id: str, search: str = Query('', max_length=200), filters: str = Query('[]', max_length=6000),
           format: str = Query('csv', pattern='^(csv|json)$')):
    meta, records = source(dataset_id)
    matching = filtered(meta, records, search, filters)
    if format == 'json':
        from fastapi.responses import JSONResponse
        return JSONResponse({'dataset': meta, 'query': {'search': search, 'filters': filters}, 'rows': matching,
                             'export_note': 'Derived export with preserved cell strings.'},
                            headers={'Content-Disposition': f'attachment; filename="{dataset_id}_evidence.json"'})
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    def safe(value):
        text = '' if value is None else str(value)
        return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) or text.startswith(('\t','\r','\n')) else text
    writer.writerow(['_solaris_record_id', '_source_row', '_source_sha256', *map(safe, meta['columns'])])
    for r in matching:
        writer.writerow([r['id'], r['source_row'], meta['sha256'], *[safe(r['values'][c]) for c in meta['columns']]])
    return Response('\ufeff'+stream.getvalue(), media_type='text/csv', headers={
        'Content-Disposition': f'attachment; filename="{dataset_id}_filtered.csv"',
        'X-Source-SHA256': meta['sha256']})

@router.get('/datasets/{dataset_id}/original')
def original(dataset_id: str):
    meta, _ = source(dataset_id)
    return Response((RAW / meta['file']).read_bytes(), media_type='text/csv', headers={
        'Content-Disposition': f'attachment; filename="{dataset_id}_original.csv"', 'X-Source-SHA256': meta['sha256']})
