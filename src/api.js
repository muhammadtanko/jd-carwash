export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== null && v !== undefined && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
export const formatMoney = (n) => money.format(Number(n) || 0);

export const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', sales: 'Sales / Marketing' };
