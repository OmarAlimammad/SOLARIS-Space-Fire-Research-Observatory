/** Per-table Data Atlas view state (from SOLARIS 3.0): restore, query serialisation and pins. Session storage only. */
export const defaultView = () => ({search:'', rules:[], field:'', page:0, pins:[]});
export function restoreView(id, storage) {
  try {
    const value = JSON.parse((storage ?? globalThis.sessionStorage).getItem(`solaris:atlas:v1:${id}`));
    if (!value || typeof value.search !== 'string' || !Array.isArray(value.rules) || !Array.isArray(value.pins)) return defaultView();
    const rules = value.rules.filter(rule => rule && typeof rule.field === 'string'
      && ['eq','contains','missing','gte','lte'].includes(rule.op)
      && (rule.op === 'missing' || typeof rule.value === 'string')).slice(0,12);
    const prefix = `${id}:row:`;
    const pins = value.pins.filter(pin => typeof pin === 'string' && pin.startsWith(prefix)
      && /^[1-9]\d*$/.test(pin.slice(prefix.length))).slice(0,50);
    return {...defaultView(), search:value.search.slice(0,200), rules, pins,
      field:typeof value.field === 'string' ? value.field : ''};
  } catch { return defaultView(); }
}
export function queryFor(view, extra={}) {
  return new URLSearchParams({search:view.search, filters:JSON.stringify(view.rules), ...extra}).toString();
}
export function togglePin(pins, id) { return pins.includes(id) ? pins.filter(x=>x!==id) : [...pins,id].slice(-50); }
/** Query parts for tablesApi (search + JSON filter rules). */
export function queryParts(view) { return { search: view.search, filters: view.rules }; }
