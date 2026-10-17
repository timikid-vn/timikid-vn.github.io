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

export async function shopGet(env, tokens, shopId, path, params = {}, fetchFn = fetch, extra = null) {
  const ts = now();
  const sign = await signShop(env.SHOPEE_PARTNER_KEY, env.SHOPEE_PARTNER_ID, path, ts, tokens.access_token, shopId);
  const q = new URLSearchParams({ partner_id: String(env.SHOPEE_PARTNER_ID), timestamp: String(ts), access_token: tokens.access_token, shop_id: String(shopId), sign });
  for (const [k, v] of Object.entries(params)) q.append(k, String(v));
  if (extra) for (const [k, v] of extra) q.append(k, v);
  const r = await fetchFn(`${env.SHOPEE_HOST || SHOPEE_LIVE}${path}?${q}`);
  const j = await r.json();
  if (j.error) throw new Error(`Shopee ${path}: ${j.error} ${j.message || ''}`.trim());
  return j.response ?? j;
}

export async function shopInfo(env, tokens, shopId, fetchFn = fetch) {
  const r = await shopGet(env, tokens, shopId, '/api/v2/shop/get_shop_info', {}, fetchFn);
  return { name: r.shop_name, region: r.region, status: r.status };
}

/** Giá từ price_info: current_price là giá sau khuyến mãi của shop (Shop's Discount/Flash Sale của shop), original_price là giá gốc */
export function pickPrice(priceInfo) {
  const p = Array.isArray(priceInfo) ? priceInfo[0] : priceInfo;
  if (!p) return null;
  const original = num(p.original_price), current = num(p.current_price ?? p.original_price);
  if (original == null && current == null) return null;
  const o = original ?? current, c = current ?? original;
  return { original: o, current: c, promo: c < o, discountPct: c < o ? Math.round((1 - c / o) * 100) : 0 };
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const stockOf = (x) => num(x?.stock_info_v2?.summary_info?.total_available_stock) ?? (Array.isArray(x?.stock_info) ? x.stock_info.reduce((a, s) => a + (num(s.current_stock ?? s.normal_stock) || 0), 0) : null);
const STATUS_VI = { NORMAL: null, UNLIST: 'Đang ẩn', BANNED: 'Bị khóa', SELLER_DELETE: 'Đã xóa', SHOPEE_DELETE: 'Shopee đã xóa', REVIEWING: 'Đang duyệt' };

/** Lỗi Shopee → câu tiếng Việt dễ hiểu */
export function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/auth\/access_token\/get|auth\/token\/get|invalid_access_token|invalid_acceess_token|error_auth|access_token.*(expired|invalid)|refresh_token/i.test(m)) return 'Phiên kết nối Shopee đã hết hạn. Hãy bấm “Kết nối Shopee” để kết nối lại shop.';
  if (/error_permission|no permission|permission denied/i.test(m)) return 'App chưa được Shopee cấp quyền đọc sản phẩm. Kiểm tra quyền API Product trong Shopee Open Platform.';
  if (/error_item_not_found|item.*not.*(found|exist)|Không tìm thấy/i.test(m)) return 'Không tìm thấy sản phẩm (có thể đã bị xóa).';
  if (/too many|rate|limit|error_busy|server_busy/i.test(m)) return 'Shopee đang bận hoặc giới hạn lượt gọi. Thử lại sau ít giây.';
  if (/fetch failed|network|timeout|Failed to fetch/i.test(m)) return 'Không kết nối được Shopee. Kiểm tra mạng rồi thử lại.';
  return 'Shopee báo lỗi: ' + m.replace(/^Shopee \S+: /, '').slice(0, 160);
}

const mapBase = (i) => {
  const price = i.has_model ? null : pickPrice(i.price_info);
  return {
    id: String(i.item_id), name: i.item_name, sku: i.item_sku || '', categoryId: i.category_id,
    image: i.image?.image_url_list?.[0] ? i.image.image_url_list[0] + '_tn' : null,
    hasModel: !!i.has_model, price: price?.current ?? null, originalPrice: price?.original ?? null, promo: !!price?.promo,
    stock: i.has_model ? null : stockOf(i), status: i.item_status || 'NORMAL', statusText: STATUS_VI[i.item_status] ?? null,
  };
};
async function baseInfo(env, tokens, shopId, ids, fetchFn) {
  const out = [];
  for (let k = 0; k < ids.length; k += 50) {
    const r = await shopGet(env, tokens, shopId, '/api/v2/product/get_item_base_info', { item_id_list: ids.slice(k, k + 50).join(',') }, fetchFn);
    out.push(...(r.item_list || []));
  }
  return out;
}

/** Danh sách sản phẩm (đang bán + đang ẩn). q: tìm theo tên (search_item) hoặc SKU. */
export async function listProducts(env, tokens, shopId, { offset = 0, pageSize = 30, q = '' } = {}, fetchFn = fetch) {
  let ids = [], next = null;
  q = String(q || '').trim();
  if (q) {
    const params = { offset, page_size: pageSize };
    const byName = await shopGet(env, tokens, shopId, '/api/v2/product/search_item', { ...params, item_name: q }, fetchFn).catch(() => ({}));
    ids = byName.item_id_list || [];
    next = byName.next_offset && ids.length >= pageSize ? byName.next_offset : null;
    if (/^[\w.-]{3,}$/.test(q) && /\d/.test(q) && !Number(offset)) {
      const bySku = await shopGet(env, tokens, shopId, '/api/v2/product/search_item', { ...params, item_sku: q }, fetchFn).catch(() => ({}));
      ids = [...new Set([...(bySku.item_id_list || []), ...ids])];
    }
  } else {
    const q2 = new URLSearchParams({ offset, page_size: pageSize });
    q2.append('item_status', 'NORMAL'); q2.append('item_status', 'UNLIST');
    const list = await shopGet(env, tokens, shopId, '/api/v2/product/get_item_list', Object.fromEntries([]), fetchFn, q2);
    ids = (list.item || []).map((i) => i.item_id);
    next = list.has_next_page ? list.next_offset : null;
  }
  if (!ids.length) return { items: [], next: null };
  const items = (await baseInfo(env, tokens, shopId, ids, fetchFn)).map(mapBase);
  return { items, next };
}

/** Chi tiết: giá gốc / giá sau KM của shop theo từng phân loại, tồn kho, ngành hàng */
export async function productDetail(env, tokens, shopId, itemId, categories, fetchFn = fetch) {
  const [i] = await baseInfo(env, tokens, shopId, [itemId], fetchFn);
  if (!i) throw new Error('error_item_not_found');
  const base = mapBase(i);
  let models = [];
  if (i.has_model) {
    const m = await shopGet(env, tokens, shopId, '/api/v2/product/get_model_list', { item_id: itemId }, fetchFn);
    const tiers = m.tier_variation || [];
    const ti = (x) => (x.tier_index || []).reduce((a, v) => a * 1000 + v, 0);
    models = (m.model || []).slice().sort((a, b) => ti(a) - ti(b)).map((x) => {
      const pr = pickPrice(x.price_info);
      const name = x.model_name || (x.tier_index || []).map((ti, k) => tiers[k]?.option_list?.[ti]?.option).filter(Boolean).join(' / ') || x.model_sku || String(x.model_id);
      return { id: String(x.model_id), name, sku: x.model_sku || '', price: pr?.current ?? null, originalPrice: pr?.original ?? null, promo: !!pr?.promo, discountPct: pr?.discountPct || 0, stock: stockOf(x), status: x.model_status || null };
    });
  }
  // Chương trình KM đang áp dụng (chỉ để hiển thị; giá đã nằm trong current_price)
  let promotions = [];
  try {
    const pr = await shopGet(env, tokens, shopId, '/api/v2/product/get_item_promotion', { item_id_list: itemId }, fetchFn);
    const nowS = Math.floor(Date.now() / 1000);
    promotions = (pr.success_list?.[0]?.promotion || [])
      .filter((x) => !x.end_time || x.end_time > nowS)
      .map((x) => ({ type: x.promotion_type, id: x.promotion_id, start: x.start_time, end: x.end_time, staging: x.promotion_staging, ongoing: (!x.start_time || x.start_time <= nowS) }));
  } catch { /* không bắt buộc */ }
  const price = i.has_model ? null : pickPrice(i.price_info);
  const mp = models.map((x) => x.price).filter((x) => x != null);
  const seen = new Set(); promotions = promotions.filter((x) => { const k = x.type + '|' + x.id; return !seen.has(k) && seen.add(k); });
  return {
    ...base, promotions,
    price: price?.current ?? (mp.length ? Math.min(...mp) : null),
    originalPrice: price?.original ?? null, promo: !!price?.promo, discountPct: price?.discountPct || 0,
    models, categoryPath: categoryPath(categories, i.category_id),
  };
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
