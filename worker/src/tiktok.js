// TikTok Shop Open API (202309) — https://partner.tiktokshop.com/docv2/page/sign-your-api-request
import { hmacHex } from './crypto.js';

export const TT_API = 'https://open-api.tiktokglobalshop.com';
export const TT_AUTH = 'https://auth.tiktok-shops.com';
const now = () => Math.floor(Date.now() / 1000);

/** sign = HMAC-SHA256(secret, secret + path + sorted{key}{value} (bỏ sign, access_token) + body + secret) */
export function signString(secret, path, params, body = '') {
  const keys = Object.keys(params).filter((k) => k !== 'sign' && k !== 'access_token').sort();
  return `${secret}${path}${keys.map((k) => `${k}${params[k]}`).join('')}${body}${secret}`;
}
export const sign = (secret, path, params, body = '') => hmacHex(secret, signString(secret, path, params, body));

/** Link ủy quyền cho người bán (ROW/VN) */
export function authUrl(env, state) {
  const q = new URLSearchParams(env.TIKTOK_SERVICE_ID ? { service_id: env.TIKTOK_SERVICE_ID, state } : { app_key: env.TIKTOK_APP_KEY, state });
  return `https://services.tiktokshop.com/open/authorize?${q}`;
}

const toTokens = (d) => ({
  access_token: d.access_token, refresh_token: d.refresh_token,
  access_exp: Number(d.access_token_expire_in) - 60, refresh_exp: Number(d.refresh_token_expire_in), seller: d.seller_name, open_id: d.open_id,
});
async function authGet(env, path, params, fetchFn) {
  const q = new URLSearchParams({ app_key: env.TIKTOK_APP_KEY, app_secret: env.TIKTOK_APP_SECRET, ...params });
  const j = await (await fetchFn(`${env.TIKTOK_AUTH_HOST || TT_AUTH}${path}?${q}`)).json();
  if (j.code !== 0) throw new Error(`TikTok ${path}: ${j.code} ${j.message || ''}`.trim());
  return toTokens(j.data);
}
export const exchangeCode = (env, code, fetchFn = fetch) => authGet(env, '/api/v2/token/get', { auth_code: code, grant_type: 'authorized_code' }, fetchFn);
export const refresh = (env, refreshToken, fetchFn = fetch) => authGet(env, '/api/v2/token/refresh', { refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchFn);

export async function call(env, tokens, method, path, params = {}, body = null, fetchFn = fetch) {
  const q = { app_key: env.TIKTOK_APP_KEY, timestamp: String(now()), ...params };
  const bodyStr = body ? JSON.stringify(body) : '';
  q.sign = await sign(env.TIKTOK_APP_SECRET, path, q, bodyStr);
  const r = await fetchFn(`${env.TIKTOK_API_HOST || TT_API}${path}?${new URLSearchParams(q)}`, {
    method, headers: { 'content-type': 'application/json', 'x-tts-access-token': tokens.access_token }, ...(body ? { body: bodyStr } : {}),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`TikTok ${path}: ${j.code} ${j.message || ''}`.trim());
  return j.data;
}

export async function authorizedShops(env, tokens, fetchFn = fetch) {
  const d = await call(env, tokens, 'GET', '/authorization/202309/shops', {}, null, fetchFn);
  return (d.shops || []).map((s) => ({ id: s.id, name: s.name, region: s.region, cipher: s.cipher, code: s.code }));
}

const minPrice = (skus) => {
  const ps = (skus || []).map((s) => Number(s.price?.sale_price ?? s.price?.tax_exclusive_price)).filter((n) => Number.isFinite(n));
  return ps.length ? Math.min(...ps) : null;
};

export async function listProducts(env, tokens, cipher, { pageToken = '', pageSize = 50 } = {}, fetchFn = fetch) {
  const params = { shop_cipher: cipher, page_size: String(pageSize), ...(pageToken ? { page_token: pageToken } : {}) };
  const d = await call(env, tokens, 'POST', '/product/202309/products/search', params, { status: 'ACTIVATE' }, fetchFn);
  return { items: (d.products || []).map((p) => ({ id: String(p.id), name: p.title, price: minPrice(p.skus) })), next: d.next_page_token || null };
}

export async function productDetail(env, tokens, cipher, id, fetchFn = fetch) {
  const p = await call(env, tokens, 'GET', `/product/202309/products/${id}`, { shop_cipher: cipher }, null, fetchFn);
  // category_chains: [{id, parent_id, local_name, is_leaf}] — sắp xếp từ gốc tới lá
  const chain = p.category_chains || [];
  const byParent = new Map(chain.map((c) => [String(c.parent_id), c]));
  const path = []; let c = byParent.get('0'), guard = 0;
  while (c && guard++ < 10) { path.push(c.local_name); c = byParent.get(String(c.id)); }
  return { id: String(p.id), name: p.title, price: minPrice(p.skus), categoryPath: path.length ? path : chain.map((x) => x.local_name) };
}
