// Đọc dữ liệu shop Shopee CỦA MÌNH cho app khác trong cùng tài khoản Cloudflare (qua service binding RPC, entrypoint ShopRead).
// - Token KHÔNG rời Worker này: Worker tự ký và tự gọi Shopee, chỉ trả về dữ liệu (response).
// - Token lấy qua đúng Durable Object ShopTokens (doCall 'access') → vẫn là NƠI DUY NHẤT làm mới token (refresh_token dùng 1 lần).
// - Chỉ cho phép các API ĐỌC trong danh sách dưới đây (Shopee: GET). Không có đường ghi/sửa.
import * as shopee from './shopee.js';
import { doCall } from './tokens.js';

export const READ_PATHS = new Set([
  '/api/v2/shop/get_shop_info',
  '/api/v2/product/get_item_list',
  '/api/v2/product/get_item_base_info',
  '/api/v2/product/get_model_list',
  '/api/v2/product/get_item_extra_info',
  '/api/v2/product/search_item',
  // Đơn hàng (dữ liệu người mua) CHƯA mở: thêm lại khi có tính năng cần và được duyệt.
]);
export const RECONNECT_URL = 'https://timikid-vn.github.io/';
const redact = (s) => String(s || '').slice(0, 200).replace(/[A-Za-z0-9]{24,}/g, '…');

async function shopRec(env, shopId) {
  const id = String(shopId ?? '');
  if (!/^\d{1,15}$/.test(id)) return { error: 'bad_shop_id' };
  if (!(env.SHOPEE_PARTNER_ID && env.SHOPEE_PARTNER_KEY && env.TOKEN_ENC_KEY && env.SHOPS)) return { error: 'not_configured' };
  const raw = await env.SHOPS.get(`shop:shopee:${id}`);
  if (!raw) return { error: 'shop_not_found' };
  return { rec: JSON.parse(raw), id };
}

/** Trạng thái kết nối (KHÔNG làm mới token, không gọi Shopee) */
export async function shopeeStatus(env, shopId) {
  const { rec, id, error } = await shopRec(env, shopId);
  if (error) return { ok: false, error, reconnectUrl: error === 'shop_not_found' ? RECONNECT_URL : undefined };
  const st = await doCall(env, rec, 'status').catch((e) => ({ ok: false, error: 'internal', message: redact(e.message) }));
  if (!st.ok) return { ok: false, error: st.error || 'internal' };
  return { ok: true, shopId: id, name: rec.name || null, region: rec.region || null, connectedAt: rec.connectedAt || null, reauth: !!st.reauth, accessExp: st.accessExp ?? null, refreshedAt: st.refreshedAt ?? null, reconnectUrl: st.reauth ? RECONNECT_URL : undefined };
}

/** 1 lời gọi API ĐỌC của Shopee cho shop đã kết nối. params: { k: v } — v là mảng → lặp tham số (vd item_status). */
export async function shopeeRead(env, shopId, path, params = {}, fetchFn = fetch) {
  if (!READ_PATHS.has(path)) return { ok: false, error: 'path_not_allowed' };
  const { rec, id, error } = await shopRec(env, shopId);
  if (error) return { ok: false, error, reconnectUrl: error === 'shop_not_found' ? RECONNECT_URL : undefined };
  const t = await doCall(env, rec, 'access').catch((e) => ({ ok: false, error: 'internal', message: e.message }));
  if (!t.ok) {
    const reauth = t.error === 'reauth_required' || t.error === 'no_tokens';
    return { ok: false, error: reauth ? 'reauth_required' : (t.error || 'internal'), reconnectUrl: reauth ? RECONNECT_URL : undefined };
  }
  const simple = {}, extra = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (!/^[a-z_]{1,40}$/.test(k) || ['partner_id', 'timestamp', 'access_token', 'shop_id', 'sign'].includes(k)) return { ok: false, error: 'bad_param' };
    if (Array.isArray(v)) for (const x of v) extra.push([k, String(x)]); else if (v != null) simple[k] = v;
  }
  try {
    const response = await shopee.shopGet(env, t.tokens, id, path, simple, fetchFn, extra.length ? extra : null);
    return { ok: true, response };
  } catch (e) {
    const msg = redact(e.message);
    const reauth = /invalid_acc?c?ess_token|error_auth|access_token.*(expired|invalid)/i.test(msg);
    console.log('shopread error', path, msg);
    return { ok: false, error: reauth ? 'reauth_required' : 'platform_error', message: shopee.friendlyError({ message: msg }), reconnectUrl: reauth ? RECONNECT_URL : undefined };
  }
}
