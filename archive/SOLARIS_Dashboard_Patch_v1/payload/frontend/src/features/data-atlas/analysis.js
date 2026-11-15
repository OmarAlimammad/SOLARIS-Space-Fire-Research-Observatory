/** Source-only analysis of the NASA PSI-25 / BASS-II table.
 * No flame-risk score, flow calibration, or flame-spread inference is made.
 */
export const SOURCE_URL = 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-25';
export const COVERAGE_FIELDS = [
  { key: 'fuel', label: 'Fuel description' },
  { key: 'date', label: 'Test date' },
  { key: 'initial_oxygen_pct', label: 'Initial O₂' },
  { key: 'final_oxygen_pct', label: 'Final O₂' },
  { key: 'flow_restrictor', label: 'Flow restrictor setting' },
  { key: 'air_display', label: 'Air display (raw)' },
  { key: 'fan_display', label: 'Fan display (raw)' },
];

export function present(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}
export function isValidOxygen(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}
export function materialGroup(fuel) {
  const t = String(fuel || '').toUpperCase();
  if (!t.trim()) return 'Not reported';
  if (/\bPMMA\b/.test(t)) return 'PMMA (explicit)';
  if (/\bSIBAL\b/.test(t)) return 'SIBAL (explicit)';
  if (/\bNOMEX\b/.test(t)) return 'Nomex (explicit)';
  if (/\bWAX\b/.test(t)) return 'Wax (explicit)';
  return 'Other descriptions';
}
export function recordYear(date) {
  if (!present(date)) return null;
  const m = String(date).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]), year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month-1 && d.getUTCDate() === day ? year : null;
}
export function coverageCount(record) {
  return COVERAGE_FIELDS.filter(({key}) => key.endsWith('oxygen_pct') ? isValidOxygen(record[key]) : key === 'date' ? recordYear(record[key]) !== null : present(record[key])).length;
}
export function reviewCues(record) {
  const issues = [];
  if (!present(record.fuel)) issues.push('Fuel description missing');
  if (!recordYear(record.date)) issues.push('Date missing or not parsed');
  for (const [key,label] of [['initial_oxygen_pct','Initial O₂'],['final_oxygen_pct','Final O₂']]) {
    if (!isValidOxygen(record[key])) issues.push(`${label} missing or outside 0–100%`);
  }
  return issues;
}
export function oxygenBin(value) {
  return isValidOxygen(value) ? Math.min(100, Math.floor(value / 2) * 2) : null;
}
export function enrich(records) {
  return records.map((r) => ({
    ...r,
    material_group: materialGroup(r.fuel),
    year: recordYear(r.date),
    coverage: coverageCount(r),
    review_cues: reviewCues(r),
  }));
}
export function countBy(records, accessor) {
  const groups = new Map();
  for (const record of records) {
    const key = accessor(record);
    if (key === null || key === undefined) continue;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()].map(([key, count]) => ({key, count}));
}
export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const k = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[k] : (sorted[k-1]+sorted[k])/2;
}
export function describe(records) {
  const initial = records.map(r=>r.initial_oxygen_pct).filter(isValidOxygen);
  const unique = new Set(records.filter(r=>present(r.fuel)).map(r=>r.fuel.trim()));
  return {
    total: records.length,
    oxygenCount: initial.length,
    medianOxygen: median(initial),
    distinctDescriptions: unique.size,
    reviewCount: records.filter(r=>r.review_cues.length).length,
    fullCoverage: records.filter(r=>r.coverage === COVERAGE_FIELDS.length).length,
  };
}
export function applyFilters(records, filters) {
  const term = filters.search.trim().toLocaleLowerCase();
  return records.filter((r)=>{
    if (term && !`${r.id} ${r.fuel} ${r.sample_id || ''}`.toLocaleLowerCase().includes(term)) return false;
    if (filters.material !== 'all' && r.material_group !== filters.material) return false;
    if (filters.year !== 'all' && String(r.year ?? 'unknown') !== String(filters.year)) return false;
    if (filters.oxygen !== 'all' && String(oxygenBin(r.initial_oxygen_pct) ?? 'unknown') !== String(filters.oxygen)) return false;
    if (filters.quality === 'review' && !r.review_cues.length) return false;
    if (filters.quality === 'complete' && r.coverage !== COVERAGE_FIELDS.length) return false;
    if (filters.quality === 'missing-oxygen' && isValidOxygen(r.initial_oxygen_pct)) return false;
    return true;
  });
}
export function sortRecords(records, sort) {
  const arr = [...records];
  const idNumber = id => Number(String(id || '').match(/\d+/)?.[0] || 0);
  arr.sort((a,b)=>{
    if (sort === 'coverage') return (b.coverage - a.coverage) || (idNumber(a.id)-idNumber(b.id));
    if (sort === 'oxygen') return (isValidOxygen(a.initial_oxygen_pct)? 0:1)-(isValidOxygen(b.initial_oxygen_pct)?0:1) || (a.initial_oxygen_pct ?? 999) - (b.initial_oxygen_pct ?? 999) || idNumber(a.id)-idNumber(b.id);
    if (sort === 'date') return (b.year ?? -1)-(a.year ?? -1) || (idNumber(a.id)-idNumber(b.id));
    return a.id.localeCompare(b.id, undefined, {numeric:true, sensitivity:'base'});
  });
  return arr;
}
export function toCSV(records) {
  const cols = [['id','Test ID'],['fuel','Fuel description'],['date','Test date'],['initial_oxygen_pct','Initial O2 percent'],['final_oxygen_pct','Final O2 percent'],['flow_restrictor','Flow restrictor raw'],['air_display','Air display raw'],['fan_display','Fan display raw'],['coverage','Documented fields out of 7'],['source_url','NASA source URL']];
  const cell = x => {
    let s = x === null || x === undefined ? '' : String(x);
    // Prevent spreadsheet formula execution when opening CSV in Excel.
    if (/^[\s]*[=+\-@]/.test(s)) s = "'"+s;
    return '"' + s.replaceAll('"','""') + '"';
  };
  return '\uFEFF'+[cols.map(v=>cell(v[1])).join(','), ...records.map(r=>cols.map(([key])=>cell(r[key])).join(','))].join('\r\n');
}
