// Shopee Open Platform API v2 — https://open.shopee.com/documents/v2/v2.authentication
import { hmacHex } from './crypto.js';

export const SHOPEE_LIVE = 'https://partner.shopeemobile.com';
export const SHOPEE_SANDBOX = 'https://openplatform.sandbox.test-stable.shopee.sg';
const now = () => Math.floor(Date.now() / 1000);

/** Public API (auth_partner, token/get, access_token/get): base = partner_id + path + timestamp */
export const signPublic = (key, partnerId, path, ts) => hmacHex(key, `${partnerId}${path}${ts}`);
/** Shop API: base = partner_id + path + timestamp + access_token + shop_id */
export const signShop = (key, partnerId, path, ts, accessToken, shopId) => hmacHex(key, `${partnerId}${path}${ts}${accessToken}${shopId}`);

export async function authUrl(env, redirect, ts = now()) {
  const path = '/api/v2/shop/auth_partner';
  const sign = await signPublic(env.SHOPEE_PARTNER_KEY, env.SHOPEE_PARTNER_ID, path, ts);
  const q = new URLSearchParams({ partner_id: String(env.SHOPEE_PARTNER_ID), timestamp: String(ts), sign, redirect });
  return `${env.SHOPEE_HOST || SHOPEE_LIVE}${path}?${q}`;
}

async function publicPost(env, path, body, fetchFn) {
  const ts = now();
  const sign = await signPublic(env.SHOPEE_PARTNER_KEY, env.SHOPEE_PARTNER_ID, path, ts);
  const url = `${env.SHOPEE_HOST || SHOPEE_LIVE}${path}?partner_id=${env.SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${sign}`;
  const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw new Error(`Shopee ${path}: ${j.error} ${j.message || ''}`.trim());
  return j;
}

const toTokens = (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, access_exp: now() + Number(j.expire_in || 14400) - 60 });

/** Đổi code lấy token (access 4 giờ, refresh 30 ngày, refresh_token dùng 1 lần) */
export async function exchangeCode(env, code, shopId, fetchFn = fetch) {
  return toTokens(await publicPost(env, '/api/v2/auth/token/get', { code, shop_id: Number(shopId), partner_id: Number(env.SHOPEE_PARTNER_ID) }, fetchFn));
}
export async function refresh(env, refreshToken, shopId, fetchFn = fetch) {
  return toTokens(await publicPost(env, '/api/v2/auth/access_token/get', { refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(env.SHOPEE_PARTNER_ID) }, fetchFn));
}

export async function shopGet(env, tokens, shopId, path, params = {}, fetchFn = fetch) {
  const ts = now();
  const sign = await signShop(env.SHOPEE_PARTNER_KEY, env.SHOPEE_PARTNER_ID, path, ts, tokens.access_token, shopId);
  const q = new URLSearchParams({ partner_id: String(env.SHOPEE_PARTNER_ID), timestamp: String(ts), access_token: tokens.access_token, shop_id: String(shopId), sign });
  for (const [k, v] of Object.entries(params)) q.append(k, String(v));
  const r = await fetchFn(`${env.SHOPEE_HOST || SHOPEE_LIVE}${path}?${q}`);
  const j = await r.json();
  if (j.error) throw new Error(`Shopee ${path}: ${j.error} ${j.message || ''}`.trim());
  return j.response ?? j;
}

export async function shopInfo(env, tokens, shopId, fetchFn = fetch) {
  const r = await shopGet(env, tokens, shopId, '/api/v2/shop/get_shop_info', {}, fetchFn);
  return { name: r.shop_name, region: r.region, status: r.status };
}

export async function listProducts(env, tokens, shopId, { offset = 0, pageSize = 50 } = {}, fetchFn = fetch) {
  const list = await shopGet(env, tokens, shopId, '/api/v2/product/get_item_list', { offset, page_size: pageSize, item_status: 'NORMAL' }, fetchFn);
  const ids = (list.item || []).map((i) => i.item_id);
  if (!ids.length) return { items: [], next: null };
  const base = await shopGet(env, tokens, shopId, '/api/v2/product/get_item_base_info', { item_id_list: ids.join(',') }, fetchFn);
  const items = (base.item_list || []).map((i) => ({
    id: String(i.item_id), name: i.item_name, categoryId: i.category_id,
    price: i.price_info?.[0]?.current_price ?? null, image: i.image?.image_url_list?.[0] || null, hasModel: !!i.has_model,
  }));
  return { items, next: list.has_next_page ? list.next_offset : null };
}

export async function productDetail(env, tokens, shopId, itemId, categories, fetchFn = fetch) {
  const base = await shopGet(env, tokens, shopId, '/api/v2/product/get_item_base_info', { item_id_list: itemId }, fetchFn);
  const i = base.item_list?.[0];
  if (!i) throw new Error('Không tìm thấy sản phẩm');
  let price = i.price_info?.[0]?.current_price ?? null;
  if (i.has_model) {
    const m = await shopGet(env, tokens, shopId, '/api/v2/product/get_model_list', { item_id: itemId }, fetchFn);
    const ps = (m.model || []).map((x) => x.price_info?.[0]?.current_price).filter((x) => x != null);
    if (ps.length) price = Math.min(...ps);
  }
  return { id: String(i.item_id), name: i.item_name, price, categoryId: i.category_id, categoryPath: categoryPath(categories, i.category_id) };
}

/** Lấy cây ngành của Shopee (tiếng Việt) để dựng đường dẫn tên ngành cấp 1 › 2 › 3 */
export async function getCategories(env, tokens, shopId, fetchFn = fetch) {
  const r = await shopGet(env, tokens, shopId, '/api/v2/product/get_category', { language: 'vi' }, fetchFn);
  return (r.category_list || []).map((c) => ({ id: c.category_id, parent: c.parent_category_id, name: c.display_category_name || c.original_category_name }));
}
export function categoryPath(categories, id) {
  const byId = new Map((categories || []).map((c) => [c.id, c]));
  const out = []; let c = byId.get(id), guard = 0;
  while (c && guard++ < 10) { out.unshift(c.name); c = byId.get(c.parent); }
  return out;
}

/** Gọi thử API công khai (không lộ dữ liệu): cho biết partner_id/key có hợp lệ trên host đó không */
export async function probe(env, host, fetchFn = fetch) {
  const path = '/api/v2/public/get_shops_by_partner', ts = now();
  const sign = await signPublic(env.SHOPEE_PARTNER_KEY, env.SHOPEE_PARTNER_ID, path, ts);
  try {
    const r = await fetchFn(`${host}${path}?partner_id=${env.SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${sign}&page_size=1&page_no=1`);
    const j = await r.json().catch(() => ({}));
    return { http: r.status, ok: !j.error, error: j.error || null, message: j.error ? (j.message || null) : null };
  } catch (e) { return { ok: false, error: 'network', message: String(e.message || e) }; }
}
