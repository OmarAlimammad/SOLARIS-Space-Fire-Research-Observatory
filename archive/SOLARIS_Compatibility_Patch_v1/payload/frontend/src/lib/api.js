const API_ROOT = import.meta.env.VITE_API_BASE_URL || '';

async function getJSON(endpoint, { signal } = {}) {
  const response = await fetch(`${API_ROOT}${endpoint}`, { signal });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
}

export const getMetadata = ({ signal } = {}) => getJSON('/api/metadata', { signal });
export const getExperiments = ({ search = '', offset = 0, limit = 24, signal } = {}) => {
  const params = new URLSearchParams({ search, offset: String(offset), limit: String(limit) });
  return getJSON(`/api/experiments?${params}`, { signal });
};

/** Deterministic source-metadata comparison; NOT a validated flame-risk model. */
export async function compareExperiments({ firstId, secondId, signal } = {}) {
  const response = await fetch(`${API_ROOT}/api/compatibility`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_id: firstId, second_id: secondId }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail.detail === 'string'
      ? detail.detail
      : `Comparison request failed (${response.status})`);
  }
  return response.json();
}

// SOLARIS_COMPAT_PATCH_APPLIED
