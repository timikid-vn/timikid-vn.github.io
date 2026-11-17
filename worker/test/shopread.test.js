import { describe, it, expect, beforeEach } from 'vitest';
import { shopeeRead, shopeeStatus, READ_PATHS } from '../src/shopread.js';
import { mockNamespace } from './doMock.js';
import { encryptJSON } from '../src/crypto.js';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const now = () => Math.floor(Date.now() / 1000);
let env, calls, rt, mode;
async function fakeFetch(url, init = {}) {
  const u = new URL(url); calls.push({ path: u.pathname, method: init.method || 'GET', q: u.searchParams });
  const ok = (d) => new Response(JSON.stringify(d));
  if (u.pathname === '/api/v2/auth/access_token/get') { rt.push(JSON.parse(init.body).refresh_token); await new Promise((r) => setTimeout(r, 20)); return mode === 'dead' ? ok({ error: 'error_param', message: 'Invalid refresh_token' }) : ok({ access_token: 'AT' + rt.length, refresh_token: 'RT' + rt.length, expire_in: 14400 }); }
  if (u.pathname === '/api/v2/product/get_item_list') return ok({ response: { item: [{ item_id: 1, item_status: 'NORMAL' }], has_next_page: false, total_count: 1 } });
  if (u.pathname === '/api/v2/product/get_item_base_info') return mode === 'badat' ? ok({ error: 'invalid_access_token', message: 'Invalid access_token.' }) : ok({ response: { item_list: [{ item_id: 1 }] } });
  return new Response('{}', { status: 404 });
}
const seed = async (tokens) => env.SHOPS.put('shop:shopee:272596844', JSON.stringify({ platform: 'shopee', id: '272596844', name: 'Timikid', enc: await encryptJSON(KEY, tokens) }));
beforeEach(() => {
  calls = []; rt = []; mode = 'ok';
  env = { SHOPS: new KV(), TOKEN_ENC_KEY: KEY, SHOPEE_PARTNER_ID: '2001', SHOPEE_PARTNER_KEY: 'pk' };
  env.TOKENS = mockNamespace(env, (...a) => fakeFetch(...a));
});

describe('ShopRead (RPC chỉ đọc cho app khác)', () => {
  it('chỉ cho phép API đọc trong danh sách; không có API ghi', async () => {
    await seed({ access_token: 'A', refresh_token: 'R', access_exp: now() + 3600 });
    for (const p of ['/api/v2/product/update_price', '/api/v2/product/update_item', '/api/v2/auth/access_token/get', '/api/v2/product/delete_item', '/api/v2/order/get_order_list', '/api/v2/order/get_order_detail', '/api/v2/payment/get_escrow_detail'])
      expect((await shopeeRead(env, '272596844', p, {}, fakeFetch)).error).toBe('path_not_allowed');
    expect([...READ_PATHS].every((p) => /\/(get_|search_)/.test(p))).toBe(true);
    expect(calls.length).toBe(0);
  });
  it('gọi đúng GET, mảng → lặp tham số, KHÔNG trả token ra ngoài', async () => {
    await seed({ access_token: 'SECRET_AT', refresh_token: 'SECRET_RT', access_exp: now() + 3600 });
    const r = await shopeeRead(env, '272596844', '/api/v2/product/get_item_list', { offset: 0, page_size: 50, item_status: ['NORMAL', 'UNLIST'] }, fakeFetch);
    expect(r.ok).toBe(true);
    expect(r.response.item[0].item_id).toBe(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].q.getAll('item_status')).toEqual(['NORMAL', 'UNLIST']);
    expect(JSON.stringify(r)).not.toMatch(/SECRET_/);
  });
  it('không cho ghi đè tham số ký (access_token, sign…)', async () => {
    await seed({ access_token: 'A', refresh_token: 'R', access_exp: now() + 3600 });
    expect((await shopeeRead(env, '272596844', '/api/v2/product/get_item_list', { access_token: 'x' }, fakeFetch)).error).toBe('bad_param');
    expect((await shopeeRead(env, '272596844', '/api/v2/product/get_item_list', { sign: 'x' }, fakeFetch)).error).toBe('bad_param');
  });
  it('token sắp hết hạn: nhiều lời gọi đồng thời → chỉ 1 lần refresh (qua DO ShopTokens)', async () => {
    await seed({ access_token: 'OLD', refresh_token: 'R0', access_exp: now() + 10 });
    const rs = await Promise.all(Array.from({ length: 6 }, () => shopeeRead(env, '272596844', '/api/v2/product/get_item_list', {}, fakeFetch)));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(rt).toEqual(['R0']);
  });
  it('refresh_token chết → reauth_required + link kết nối lại; trạng thái không gọi Shopee', async () => {
    mode = 'dead';
    await seed({ access_token: 'OLD', refresh_token: 'R0', access_exp: now() - 10 });
    const r = await shopeeRead(env, '272596844', '/api/v2/product/get_item_list', {}, fakeFetch);
    expect(r).toMatchObject({ ok: false, error: 'reauth_required', reconnectUrl: 'https://timikid-vn.github.io/' });
    const n = calls.length;
    const s = await shopeeStatus(env, '272596844');
    expect(s).toMatchObject({ ok: true, reauth: true, name: 'Timikid' });
    expect(calls.length).toBe(n);
  });
  it('access_token bị Shopee từ chối → reauth_required (không tự refresh lần 2)', async () => {
    mode = 'badat';
    await seed({ access_token: 'A', refresh_token: 'R', access_exp: now() + 3600 });
    const r = await shopeeRead(env, '272596844', '/api/v2/product/get_item_base_info', { item_id_list: '1' }, fakeFetch);
    expect(r.error).toBe('reauth_required');
    expect(rt.length).toBe(0);
  });
  it('shop chưa kết nối / shop_id sai', async () => {
    expect((await shopeeStatus(env, '999')).error).toBe('shop_not_found');
    expect((await shopeeRead(env, 'abc', '/api/v2/product/get_item_list', {}, fakeFetch)).error).toBe('bad_shop_id');
  });
});
