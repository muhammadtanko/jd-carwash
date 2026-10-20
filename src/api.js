import { handle } from './backend/routes';

/** All data is handled in the browser (see src/backend); there is no server. */
export async function api(path, { method = 'GET', body } = {}) {
  try {
    return await handle(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
  } catch (e) {
    const err = new Error(e.status ? e.message : 'Something went wrong');
    err.status = e.status || 500;
    if (!e.status) console.error(e);
    throw err;
  }
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
