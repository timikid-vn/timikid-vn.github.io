import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { handle, LOCK, PBKDF2_ITER } from '../src/index.js';
import { verifyAccess, resetJwksCache } from '../client/verify.js';
import { KV, makeSigningJwk } from './helpers.js';

const O = 'https://timikid-vn.github.io';
const ADMIN = 'duylinh30190@gmail.com';
let env, JWK;
beforeAll(async () => { JWK = await makeSigningJwk(); });
beforeEach(() => { env = { USERS: new KV(), AUTH_SIGNING_JWK: JWK, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD: 'admin-pass-rat-dai' }; resetJwksCache(); });
const call = async (path, { method = 'GET', body, token, origin = O, ip = '1.1.1.1' } = {}) => {
  const r = await handle(new Request('https://timikid-auth.timikid-vn.workers.dev' + path, { method, headers: { origin, 'cf-connecting-ip': ip, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  return { r, j: await r.json().catch(() => null) };
};
const jwks = async () => (await call('/.well-known/jwks.json')).j;
const adminLogin = async () => (await call('/login', { method: 'POST', body: { email: ADMIN, password: 'admin-pass-rat-dai' } })).j;

describe('timikid-auth', () => {
  it('CORS: cho phép timikid-vn.github.io (kể cả trang con), chặn origin khác', async () => {
    expect((await call('/config')).r.headers.get('access-control-allow-origin')).toBe(O);
    expect((await call('/config', { origin: 'https://abc.timikid-vn.github.io' })).r.headers.get('access-control-allow-origin')).toBe('https://abc.timikid-vn.github.io');
    for (const bad of ['https://evil.example', 'https://timikid-vn.github.io.evil.com', 'http://timikid-vn.github.io', 'https://eviltimikid-vn.github.io']) {
      const { r } = await call('/login', { method: 'POST', body: {}, origin: bad });
      expect(r.status).toBe(403); expect(r.headers.get('access-control-allow-origin')).toBeNull();
    }
  });
  it('chưa đặt ADMIN_PASSWORD → đăng nhập admin tắt, báo rõ', async () => {
    delete env.ADMIN_PASSWORD;
    expect((await call('/config')).j.adminLogin).toBe(false);
    const { r, j } = await call('/login', { method: 'POST', body: { email: ADMIN, password: 'gi-cung-duoc' } });
    expect(r.status).toBe(503); expect(j.error).toBe('admin_login_disabled');
  });
  it('không ai đăng ký được email admin', async () => {
    expect((await call('/register', { method: 'POST', body: { email: ADMIN.toUpperCase(), password: 'x'.repeat(12) } })).r.status).toBe(409);
  });
  it('đăng ký → pending (không có token); mật khẩu băm PBKDF2 ≥100k, salt riêng', async () => {
    const reg = await call('/register', { method: 'POST', body: { email: 'Ban@Gmail.com', password: 'mat-khau-123', name: 'Bạn' } });
    expect(reg.r.status).toBe(201); expect(reg.j.user.status).toBe('pending'); expect(reg.j.accessToken).toBeUndefined();
    await call('/register', { method: 'POST', body: { email: 'b2@x.vn', password: 'mat-khau-123' } });
    const u1 = JSON.parse(env.USERS.m.get('user:ban@gmail.com')), u2 = JSON.parse(env.USERS.m.get('user:b2@x.vn'));
    expect(u1.pw.iter).toBeGreaterThanOrEqual(100000); expect(PBKDF2_ITER).toBeGreaterThanOrEqual(100000);
    expect(u1.pw.salt).not.toBe(u2.pw.salt); expect(u1.pw.hash).not.toBe(u2.pw.hash);
    expect(JSON.stringify([...env.USERS.m.values()])).not.toContain('mat-khau-123');
    const l = await call('/login', { method: 'POST', body: { email: 'ban@gmail.com', password: 'mat-khau-123' } });
    expect(l.r.status).toBe(403); expect(l.j.status).toBe('pending'); expect(l.j.accessToken).toBeUndefined();
    // sai mật khẩu không tiết lộ trạng thái
    expect((await call('/login', { method: 'POST', body: { email: 'ban@gmail.com', password: 'sai-sai-sai' } })).j.error).toBe('invalid_credentials');
    expect((await call('/register', { method: 'POST', body: { email: 'c@x.vn', password: 'ngan' } })).j.error).toBe('weak_password');
  });
  it('admin duyệt → người dùng đăng nhập được; app khác xác minh bằng JWKS (không cần bí mật)', async () => {
    await call('/register', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } });
    const a = await adminLogin();
    expect(a.user.role).toBe('admin');
    expect((await call('/admin/users', { token: a.accessToken })).j.users.map((u) => [u.email, u.status])).toEqual(expect.arrayContaining([['u@x.vn', 'pending']]));
    expect((await call('/admin/users/u%40x.vn', { method: 'POST', token: a.accessToken, body: { action: 'approve' } })).j.user.status).toBe('approved');
    const l = (await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } })).j;
    expect(l.accessToken).toBeTruthy(); expect(l.refreshToken).toBeTruthy();
    const appEnv = { AUTH_JWKS: await jwks() };
    const c = await verifyAccess(appEnv, l.accessToken, { app: 'shop-connect' });
    expect(c).toMatchObject({ email: 'u@x.vn', status: 'approved', role: 'user', apps: ['*'] });
    // giả mạo / hết hạn / sai issuer → null
    const [h, p, s] = l.accessToken.split('.');
    const forged = btoa(JSON.stringify({ ...c, role: 'admin' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(await verifyAccess(appEnv, `${h}.${forged}.${s}`)).toBeNull();
    expect(await verifyAccess(appEnv, l.accessToken, { now: Date.now() + 16 * 60 * 1000 })).toBeNull();
    expect(await verifyAccess({ ...appEnv, AUTH_ISSUER: 'https://khac.example' }, l.accessToken)).toBeNull();
    expect(await verifyAccess({ AUTH_JWKS: { keys: [] } }, l.accessToken)).toBeNull();
    // giới hạn app
    await call('/admin/users/u%40x.vn', { method: 'POST', token: a.accessToken, body: { action: 'set_apps', apps: ['app-khac'] } });
    const l2 = (await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } })).j;
    expect(await verifyAccess(appEnv, l2.accessToken, { app: 'shop-connect' })).toBeNull();
    expect(await verifyAccess(appEnv, l2.accessToken, { app: 'app-khac' })).toBeTruthy();
  });
  it('chỉ admin gọi được /admin/*; không sửa được tài khoản admin', async () => {
    await call('/register', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } });
    const a = await adminLogin();
    await call('/admin/users/u%40x.vn', { method: 'POST', token: a.accessToken, body: { action: 'approve' } });
    const u = (await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } })).j;
    expect((await call('/admin/users', { token: u.accessToken })).r.status).toBe(403);
    expect((await call('/admin/users/u%40x.vn', { method: 'POST', token: u.accessToken, body: { action: 'revoke' } })).r.status).toBe(403);
    expect((await call('/admin/users')).r.status).toBe(401);
    expect((await call(`/admin/users/${encodeURIComponent(ADMIN)}`, { method: 'POST', token: a.accessToken, body: { action: 'revoke' } })).r.status).toBe(400);
  });
  it('thu hồi → token làm mới & phiên cũ mất hiệu lực; refresh dùng 1 lần; xóa; reset mật khẩu', async () => {
    await call('/register', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } });
    const a = await adminLogin();
    const act = (action) => call('/admin/users/u%40x.vn', { method: 'POST', token: a.accessToken, body: { action } });
    await act('approve');
    const u = (await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } })).j;
    const r1 = (await call('/refresh', { method: 'POST', body: { refreshToken: u.refreshToken } })).j;
    expect(r1.accessToken).toBeTruthy();
    expect((await call('/refresh', { method: 'POST', body: { refreshToken: u.refreshToken } })).r.status).toBe(401);
    await act('revoke');
    expect((await call('/refresh', { method: 'POST', body: { refreshToken: r1.refreshToken } })).r.status).toBe(401);
    expect((await call('/me', { token: r1.accessToken })).r.status).toBe(401);
    expect((await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } })).j.error).toBe('revoked');
    await act('approve');
    const rs = (await act('reset')).j;
    expect(rs.tempPassword.length).toBeGreaterThanOrEqual(12);
    expect((await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } })).r.status).toBe(401);
    expect((await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: rs.tempPassword } })).r.status).toBe(200);
    await act('remove');
    expect(env.USERS.m.has('user:u@x.vn')).toBe(false);
  });
  it('khóa sau 5 lần sai (kể cả mật khẩu đúng sau đó), theo IP sau 30 lần', async () => {
    await call('/register', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } });
    for (let i = 0; i < LOCK.maxFails; i++) expect((await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'sai' + i } })).r.status).toBe(401);
    const l = await call('/login', { method: 'POST', body: { email: 'u@x.vn', password: 'mat-khau-123' } });
    expect(l.r.status).toBe(429); expect(l.j.error).toBe('locked');
    // admin cũng bị khóa khi sai nhiều
    for (let i = 0; i < LOCK.maxFails; i++) await call('/login', { method: 'POST', body: { email: ADMIN, password: 'sai' }, ip: '2.2.2.2' });
    expect((await call('/login', { method: 'POST', body: { email: ADMIN, password: 'admin-pass-rat-dai' }, ip: '3.3.3.3' })).r.status).toBe(429);
    for (let i = 0; i < LOCK.ipMaxFails; i++) await call('/login', { method: 'POST', body: { email: `x${i}@x.vn`, password: 'sai' }, ip: '9.9.9.9' });
    expect((await call('/login', { method: 'POST', body: { email: 'moi@x.vn', password: 'sai' }, ip: '9.9.9.9' })).r.status).toBe(429);
  });
});
