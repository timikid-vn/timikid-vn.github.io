import { describe, it, expect, beforeEach } from 'vitest';
import { handle, refreshAll } from '../src/index.js';
import { handle as authHandle } from '../../auth-worker/src/index.js';
import { KV as AKV, makeSigningJwk } from '../../auth-worker/test/helpers.js';
import { mockNamespace } from './doMock.js';
import { encryptJSON, decryptJSON } from '../src/crypto.js';
import { isPermanent } from '../src/tokens.js';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}
const ORIGIN = 'https://timikid-vn.github.io';
const authEnv = { USERS: new AKV(), AUTH_SIGNING_JWK: await makeSigningJwk(), ADMIN_EMAIL: 'duylinh30190@gmail.com', ADMIN_PASSWORD: 'admin-pass-rat-dai' };
const A = async (path, body) => (await authHandle(new Request('https://a.dev' + path, { method: body ? 'POST' : 'GET', headers: { origin: ORIGIN }, body: body ? JSON.stringify(body) : undefined }), authEnv)).json();
const JWKS = await A('/.well-known/jwks.json');
const TOKEN = (await A('/login', { email: 'duylinh30190@gmail.com', password: 'admin-pass-rat-dai' })).accessToken;
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let env, calls, mode, rtSeen;
async function fakeFetch(url, init = {}) {
  const u = new URL(url); const path = u.pathname;
  calls.push(path);
  const ok = (d) => new Response(JSON.stringify(d));
  if (path === '/api/v2/auth/access_token/get') {
    const { refresh_token } = JSON.parse(init.body);
    rtSeen.push(refresh_token);
    await sleep(30); // refresh chậm → các request đồng thời chồng lên nhau
    if (mode === 'dead') return ok({ error: 'refresh_token_expired', message: 'Your refresh_token expired.' });
    if (mode === 'busy') return ok({ error: 'error_busy', message: 'server busy' });
    if (mode === 'network') throw new TypeError('fetch failed');
    const n = rtSeen.length;
    return ok({ access_token: 'AT' + n, refresh_token: 'RT' + n, expire_in: 14400 });
  }
  if (path === '/api/v2/token/refresh') {
    rtSeen.push(u.searchParams.get('refresh_token')); await sleep(30);
    return ok({ code: 0, data: { access_token: 'TTAT' + rtSeen.length, refresh_token: 'TTRT' + rtSeen.length, access_token_expire_in: now() + 7 * 86400, refresh_token_expire_in: now() + 365 * 86400 } });
  }
  if (path === '/api/v2/product/get_item_list') return ok({ response: { item: [{ item_id: 1 }], has_next_page: false } });
  if (path === '/api/v2/product/get_item_base_info') return ok({ response: { item_list: [{ item_id: 1, item_name: 'SP', has_model: false, price_info: [{ original_price: 100, current_price: 90 }], _at: u.searchParams.get('access_token') }] } });
  if (path === '/product/202309/products/search') return ok({ code: 0, data: { products: [] } });
  return new Response('{}', { status: 404 });
}
const mkEnv = () => { const e = { SHOPS: new KV(), AUTH_JWKS: JWKS, TOKEN_ENC_KEY: KEY, SHOPEE_PARTNER_ID: '2001', SHOPEE_PARTNER_KEY: 'pk', TIKTOK_APP_KEY: 'ak', TIKTOK_APP_SECRET: 'as', ALLOWED_ORIGIN: ORIGIN }; e.TOKENS = mockNamespace(e, (...a) => fakeFetch(...a)); return e; };
// Bản ghi KV kiểu cũ (chưa có DO) — để kiểm tra di chuyển dữ liệu khi dùng lần đầu
async function seedKV(platform, id, tokens, extra = {}) {
  await env.SHOPS.put(`shop:${platform}:${id}`, JSON.stringify({ platform, id: String(id), name: 'Shop ' + id, mall: true, ...extra, enc: await encryptJSON(KEY, tokens) }));
}
const get = (path) => handle(new Request('https://w.dev' + path, { headers: { origin: ORIGIN, authorization: 'Bearer ' + TOKEN } }), env, fakeFetch).then(async (r) => ({ status: r.status, j: await r.json() }));
const refreshCalls = () => calls.filter((p) => /access_token\/get|token\/refresh/.test(p)).length;
const doState = async (key) => { const o = env.TOKENS.inst.get(key); return o?.state ? { ...o.state, tokens: await decryptJSON(KEY, o.state.enc) } : null; };

beforeEach(() => { env = mkEnv(); calls = []; mode = 'ok'; rtSeen = []; });

describe('Khóa làm mới token (Durable Object / shop)', () => {
  it('20 request đồng thời với token đã hết hạn → đúng 1 lần refresh, tất cả thành công, token mới được lưu', async () => {
    await seedKV('shopee', 272596844, { access_token: 'OLD_AT', refresh_token: 'OLD_RT', access_exp: now() - 10 });
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => get(i % 2 ? '/api/shops/shopee/272596844/products' : '/api/shops/shopee/272596844/products/1')));
    expect(rs.map((r) => r.status)).toEqual(Array(20).fill(200));
    expect(refreshCalls()).toBe(1);
    expect(rtSeen).toEqual(['OLD_RT']); // refresh_token dùng 1 lần — không bao giờ gửi 2 lần
    const st = await doState('shopee:272596844');
    expect(st.tokens).toMatchObject({ access_token: 'AT1', refresh_token: 'RT1' });
    expect(st.tokens.access_exp).toBeGreaterThan(now() + 3600);
    expect(st.enc).not.toMatch(/AT1|RT1/); // lưu mã hóa
    // mọi lời gọi Shopee sau refresh đều dùng access token mới
    const shopCalls = calls.filter((p) => p.startsWith('/api/v2/product'));
    expect(shopCalls.length).toBeGreaterThan(0);
    // lần sau: token còn hạn → không refresh nữa (dù KV vẫn giữ token cũ)
    calls = [];
    expect((await get('/api/shops/shopee/272596844/products')).status).toBe(200);
    expect(refreshCalls()).toBe(0);
  });
  it('token còn hạn (>5 phút) → dùng luôn, không refresh; < 5 phút → refresh', async () => {
    await seedKV('shopee', 1, { access_token: 'A', refresh_token: 'R', access_exp: now() + 3600 });
    await Promise.all(Array.from({ length: 5 }, () => get('/api/shops/shopee/1/products')));
    expect(refreshCalls()).toBe(0);
    await seedKV('shopee', 2, { access_token: 'A', refresh_token: 'R', access_exp: now() + 200 });
    await Promise.all(Array.from({ length: 5 }, () => get('/api/shops/shopee/2/products')));
    expect(refreshCalls()).toBe(1);
  });
  it('refresh_token chết (refresh_token_expired) → cần kết nối lại, không thử lại', async () => {
    mode = 'dead';
    await seedKV('shopee', 272596844, { access_token: 'OLD_AT', refresh_token: 'DEAD_RT', access_exp: now() - 10 });
    const rs = await Promise.all(Array.from({ length: 20 }, () => get('/api/shops/shopee/272596844/products')));
    expect(rs.every((r) => r.status === 502 && r.j.error === 'reauth_required')).toBe(true);
    expect(rs[0].j.message).toMatch(/kết nối lại/);
    expect(refreshCalls()).toBe(1);
    // gọi tiếp: không gọi Shopee nữa (không có vòng lặp thử lại)
    calls = [];
    expect((await get('/api/shops/shopee/272596844/products')).j.error).toBe('reauth_required');
    expect(calls).toEqual([]);
    expect((await refreshAll(env))[0]).toMatchObject({ key: 'shopee:272596844', ok: false, error: 'reauth_required' });
    expect(calls).toEqual([]);
    // danh sách shop báo cần kết nối lại
    expect((await get('/api/shops')).j.shops[0]).toMatchObject({ id: '272596844', reauth: true });
    // kết nối lại (OAuth) → DO nhận token mới, bỏ cờ
    const o = env.TOKENS.get('shopee:272596844');
    await o.fetch('https://tokens/set', { method: 'POST', body: JSON.stringify({ enc: await encryptJSON(KEY, { access_token: 'NEW', refresh_token: 'NEWRT', access_exp: now() + 14000 }) }) });
    mode = 'ok';
    expect((await get('/api/shops/shopee/272596844/products')).status).toBe(200);
    expect((await get('/api/shops')).j.shops[0].reauth).toBe(false);
  });
  it('lỗi tạm thời (sàn bận / mạng) → không đánh dấu kết nối lại, lần sau thử lại 1 lần', async () => {
    await seedKV('shopee', 5, { access_token: 'A', refresh_token: 'R5', access_exp: now() - 10 });
    for (const m of ['busy', 'network']) {
      mode = m; calls = [];
      const rs = await Promise.all(Array.from({ length: 10 }, () => get('/api/shops/shopee/5/products')));
      expect(rs.every((r) => r.status === 502 && r.j.error === 'platform_error')).toBe(true);
      expect(refreshCalls()).toBe(1);
      expect((await doState('shopee:5')).reauth).toBeNull();
    }
    mode = 'ok';
    expect((await get('/api/shops/shopee/5/products')).status).toBe(200);
    expect((await doState('shopee:5')).tokens.refresh_token).toMatch(/^RT/);
  });
  it('cron: làm mới sớm token sắp hết (trong 3,5 giờ), bỏ qua token còn lâu & shop cần kết nối lại; chạy cùng lúc với request vẫn chỉ 1 refresh', async () => {
    await seedKV('shopee', 10, { access_token: 'A', refresh_token: 'R10', access_exp: now() + 2 * 3600 }); // còn 2 giờ → làm mới
    await seedKV('shopee', 11, { access_token: 'A', refresh_token: 'R11', access_exp: now() + 14000 }); // vừa kết nối → để yên
    const [cron, ...rs] = await Promise.all([refreshAll(env), ...Array.from({ length: 10 }, () => get('/api/shops/shopee/10/products'))]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(cron).toEqual([{ key: 'shopee:10', ok: true, refreshed: true, error: null }, { key: 'shopee:11', ok: true, refreshed: false, error: null }]);
    expect(rtSeen).toEqual(['R10']);
    expect((await doState('shopee:10')).tokens.refresh_token).toBe('RT1');
    // chạy cron lần nữa ngay: không refresh
    calls = [];
    await refreshAll(env); expect(refreshCalls()).toBe(0);
  });
  it('TikTok: 2 shop cùng người bán dùng chung 1 khóa → 1 refresh', async () => {
    const tk = { access_token: 'TA', refresh_token: 'TR', access_exp: now() - 10 };
    await seedKV('tiktok', 71, tk, { sellerKey: 'seller1', cipher: 'c1' });
    await seedKV('tiktok', 72, tk, { sellerKey: 'seller1', cipher: 'c2' });
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => get(`/api/shops/tiktok/${i % 2 ? 71 : 72}/products`)));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(rtSeen).toEqual(['TR']);
    expect((await doState('tiktok:seller1')).tokens.refresh_token).toBe('TTRT1');
    expect((await refreshAll(env)).map((x) => x.key)).toEqual(['tiktok:seller1']);
  });
  it('phân loại lỗi vĩnh viễn', () => {
    expect(isPermanent('Shopee /api/v2/auth/access_token/get: refresh_token_expired Your refresh_token expired.')).toBe(true);
    expect(isPermanent('Shopee /api/v2/auth/access_token/get: error_auth invalid refresh_token')).toBe(true);
    expect(isPermanent('Shopee x: error_busy server busy')).toBe(false);
    expect(isPermanent('fetch failed')).toBe(false);
  });
});
