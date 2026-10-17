import { describe, it, expect, beforeEach } from 'vitest';
import { handle } from '../src/index.js';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}
const ORIGIN = 'https://timikid-vn.github.io';
const W = 'https://w.example.dev';
let env, calls;
const mkEnv = () => ({
  SHOPS: new KV(), OWNER_PASSWORD: 'mat-khau-dai', SESSION_SECRET: 'sess', TOKEN_ENC_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(3))),
  SHOPEE_PARTNER_ID: '2001', SHOPEE_PARTNER_KEY: 'pk', TIKTOK_APP_KEY: 'ak', TIKTOK_APP_SECRET: 'as', ALLOWED_ORIGIN: ORIGIN, FRONTEND_URL: ORIGIN + '/',
});
const ok = (data) => new Response(JSON.stringify(data));
// Giả lập phản hồi của Shopee/TikTok
async function fakeFetch(url, init = {}) {
  const u = new URL(url); calls.push({ path: u.pathname, init, q: Object.fromEntries(u.searchParams) });
  const now = Math.floor(Date.now() / 1000);
  switch (u.pathname) {
    case '/api/v2/auth/token/get': return ok({ access_token: 'SP_AT', refresh_token: 'SP_RT', expire_in: 14400 });
    case '/api/v2/auth/access_token/get': return ok({ access_token: 'SP_AT2', refresh_token: 'SP_RT2', expire_in: 14400 });
    case '/api/v2/shop/get_shop_info': return ok({ response: { shop_name: 'Timikid Shopee', region: 'VN', status: 'NORMAL' } });
    case '/api/v2/product/get_item_list': return ok({ response: { item: [{ item_id: 11 }, { item_id: 12 }], has_next_page: false } });
    case '/api/v2/product/get_item_base_info': return ok({ response: { item_list: u.searchParams.get('item_id_list').split(',').map((id) => ({ item_id: +id, item_name: 'SP ' + id, category_id: 300, has_model: id === '12', price_info: id === '12' ? undefined : [{ current_price: 173000 }] })) } });
    case '/api/v2/product/get_model_list': return ok({ response: { model: [{ price_info: [{ current_price: 99000 }] }, { price_info: [{ current_price: 89000 }] }] } });
    case '/api/v2/product/get_category': return ok({ response: { category_list: [{ category_id: 100, parent_category_id: 0, display_category_name: 'Mẹ & Bé' }, { category_id: 200, parent_category_id: 100, display_category_name: 'Chăm sóc sức khỏe mẹ' }, { category_id: 300, parent_category_id: 200, display_category_name: 'Sữa bầu' }] } });
    case '/api/v2/token/get': return ok({ code: 0, data: { access_token: 'TT_AT', refresh_token: 'TT_RT', access_token_expire_in: now + 7 * 86400, refresh_token_expire_in: now + 365 * 86400, open_id: 'seller1' } });
    case '/api/v2/token/refresh': return ok({ code: 0, data: { access_token: 'TT_AT2', refresh_token: 'TT_RT2', access_token_expire_in: now + 7 * 86400, refresh_token_expire_in: now + 365 * 86400, open_id: 'seller1' } });
    case '/authorization/202309/shops': return ok({ code: 0, data: { shops: [{ id: '7001', name: 'Timikid TikTok', region: 'VN', cipher: 'ROW_cipher', code: 'VNABC' }] } });
    case '/product/202309/products/search': return ok({ code: 0, data: { products: [{ id: '9', title: 'Mascara', skus: [{ price: { sale_price: '159000' } }, { price: { sale_price: '149000' } }] }] } });
    case '/product/202309/products/9': return ok({ code: 0, data: { id: '9', title: 'Mascara', skus: [{ price: { sale_price: '149000' } }], category_chains: [{ id: '3', parent_id: '2', local_name: 'Mascara', is_leaf: true }, { id: '1', parent_id: '0', local_name: 'Chăm sóc sắc đẹp & Chăm sóc cá nhân' }, { id: '2', parent_id: '1', local_name: 'Trang điểm' }] } });
  }
  return new Response('{}', { status: 404 });
}
const req = (path, { method = 'GET', body, token, origin = ORIGIN } = {}) => new Request(W + path, { method, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const call = async (...a) => { const r = await handle(req(...a), env, fakeFetch); return { r, j: r.headers.get('content-type')?.includes('json') ? await r.json() : null }; };
const login = async () => (await call('/api/login', { method: 'POST', body: { password: 'mat-khau-dai' } })).j.token;

beforeEach(() => { env = mkEnv(); calls = []; });

describe('Worker API', () => {
  it('status công khai; chưa cấu hình → 503 not_configured', async () => {
    expect((await call('/api/status')).j.shopee).toBe(true);
    env = { ALLOWED_ORIGIN: ORIGIN };
    const { r, j } = await call('/api/shops');
    expect(r.status).toBe(503); expect(j.error).toBe('not_configured');
  });
  it('CORS chỉ cho phép timikid-vn.github.io', async () => {
    expect((await call('/api/status')).r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect((await call('/api/status', { origin: 'https://evil.example' })).r.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('không có phiên → 401; sai mật khẩu → 401', async () => {
    expect((await call('/api/shops')).r.status).toBe(401);
    expect((await call('/api/login', { method: 'POST', body: { password: 'sai' } })).r.status).toBe(401);
    expect((await call('/api/shops', { token: 'gia.mao' })).r.status).toBe(401);
  });
  it('Shopee: OAuth url → callback → shop lưu mã hóa → sản phẩm & chi tiết (giá model thấp nhất, đường dẫn ngành)', async () => {
    const t = await login();
    const { j } = await call('/api/oauth/shopee/url', { method: 'POST', token: t });
    const u = new URL(j.url);
    expect(u.pathname).toBe('/api/v2/shop/auth_partner');
    const state = new URL(u.searchParams.get('redirect')).searchParams.get('state');
    const cb = await handle(req(`/oauth/shopee/callback?state=${state}&code=C1&shop_id=555`), env, fakeFetch);
    expect(cb.status).toBe(302); expect(cb.headers.get('location')).toBe(ORIGIN + '/#ket-noi=ok_shopee');
    // token không lộ ra KV dạng rõ, cũng không lộ ra API
    expect([...env.SHOPS.m.values()].join()).not.toContain('SP_AT');
    const shops = (await call('/api/shops', { token: t })).j.shops;
    expect(shops).toEqual([expect.objectContaining({ platform: 'shopee', id: '555', name: 'Timikid Shopee', mall: false })]);
    expect(JSON.stringify(shops)).not.toMatch(/SP_AT|SP_RT|enc/);
    const list = (await call('/api/shops/shopee/555/products', { token: t })).j;
    expect(list.items.map((i) => [i.id, i.price])).toEqual([['11', 173000], ['12', null]]);
    const d = (await call('/api/shops/shopee/555/products/12', { token: t })).j.product;
    expect(d).toMatchObject({ price: 89000, categoryPath: ['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Sữa bầu'] });
    // state dùng 1 lần
    const again = await handle(req(`/oauth/shopee/callback?state=${state}&code=C1&shop_id=555`), env, fakeFetch);
    expect(again.headers.get('location')).toContain('loi_state');
  });
  it('Shopee: token sắp hết hạn → tự refresh', async () => {
    const t = await login();
    const { j } = await call('/api/oauth/shopee/url', { method: 'POST', token: t });
    const state = new URL(new URL(j.url).searchParams.get('redirect')).searchParams.get('state');
    await handle(req(`/oauth/shopee/callback?state=${state}&code=C&shop_id=1`), env, fakeFetch);
    // ép hết hạn
    const { decryptJSON, encryptJSON } = await import('../src/crypto.js');
    const rec = JSON.parse(env.SHOPS.m.get('shop:shopee:1'));
    const tok = await decryptJSON(env.TOKEN_ENC_KEY, rec.enc); tok.access_exp = 0;
    env.SHOPS.m.set('shop:shopee:1', JSON.stringify({ ...rec, enc: await encryptJSON(env.TOKEN_ENC_KEY, tok) }));
    calls = [];
    await call('/api/shops/shopee/1/products', { token: t });
    expect(calls[0].path).toBe('/api/v2/auth/access_token/get');
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ refresh_token: 'SP_RT', shop_id: 1, partner_id: 2001 });
    expect(calls[1].q.access_token).toBe('SP_AT2');
  });
  it('TikTok: callback → danh sách shop được ủy quyền → sản phẩm ký đúng, có x-tts-access-token', async () => {
    const t = await login();
    const { j } = await call('/api/oauth/tiktok/url', { method: 'POST', token: t });
    const state = new URL(j.url).searchParams.get('state');
    expect(new URL(j.url).searchParams.get('app_key')).toBe('ak');
    const cb = await handle(req(`/oauth/tiktok/callback?state=${state}&code=TC`), env, fakeFetch);
    expect(cb.headers.get('location')).toContain('ok_tiktok');
    const shops = (await call('/api/shops', { token: t })).j.shops;
    expect(shops[0]).toMatchObject({ platform: 'tiktok', id: '7001', name: 'Timikid TikTok' });
    expect(JSON.stringify(shops)).not.toMatch(/cipher|TT_AT/);
    calls = [];
    const list = (await call('/api/shops/tiktok/7001/products', { token: t })).j;
    expect(list.items).toEqual([{ id: '9', name: 'Mascara', price: 149000 }]);
    const c = calls[0];
    expect(c.init.headers['x-tts-access-token']).toBe('TT_AT');
    expect(c.q.shop_cipher).toBe('ROW_cipher');
    const { sign } = await import('../src/tiktok.js');
    const { sign: s, ...q } = c.q;
    expect(s).toBe(await sign('as', '/product/202309/products/search', q, c.init.body));
    const d = (await call('/api/shops/tiktok/7001/products/9', { token: t })).j.product;
    expect(d.categoryPath).toEqual(['Chăm sóc sắc đẹp & Chăm sóc cá nhân', 'Trang điểm', 'Mascara']);
  });
  it('đặt cờ Mall & ngắt kết nối', async () => {
    const t = await login();
    const { j } = await call('/api/oauth/shopee/url', { method: 'POST', token: t });
    const state = new URL(new URL(j.url).searchParams.get('redirect')).searchParams.get('state');
    await handle(req(`/oauth/shopee/callback?state=${state}&code=C&shop_id=8`), env, fakeFetch);
    expect((await call('/api/shops/shopee/8', { method: 'PATCH', token: t, body: { mall: true } })).j.shop.mall).toBe(true);
    expect((await call('/api/shops/shopee/8', { method: 'DELETE', token: t })).j.ok).toBe(true);
    expect((await call('/api/shops', { token: t })).j.shops).toEqual([]);
  });
});
