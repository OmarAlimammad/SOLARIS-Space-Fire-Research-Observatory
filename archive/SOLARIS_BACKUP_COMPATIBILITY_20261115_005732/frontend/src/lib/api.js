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
