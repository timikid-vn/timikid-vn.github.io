// timikid-auth: đăng nhập dùng chung cho mọi app của timikid-vn (email + mật khẩu, admin duyệt).
import { hashPassword, verifyPassword, equalsSecret, randomToken, sha256hex, signJwt, getSigner, PBKDF2_ITER } from './crypto.js';
import { verifyAccess, AUDIENCE, DEFAULT_ISSUER } from '../client/verify.js';

export const ACCESS_TTL = 15 * 60;          // token truy cập 15 phút
export const REFRESH_TTL = 30 * 24 * 3600;  // token làm mới 30 ngày (xoay vòng mỗi lần dùng)
export const LOCK = { maxFails: 5, lockSec: 15 * 60, ipMaxFails: 30, ipWindowSec: 15 * 60 };
const MIN_PW = 10;

const MSG = {
  forbidden_origin: 'Nguồn (origin) không được phép.',
  not_configured: 'Máy chủ đăng nhập chưa cấu hình xong.',
  admin_login_disabled: 'Chưa đặt mật khẩu admin — đăng nhập admin đang tắt.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  locked: 'Đăng nhập sai quá nhiều lần. Thử lại sau ít phút.',
  pending: 'Tài khoản đang chờ admin duyệt.',
  revoked: 'Tài khoản đã bị thu hồi quyền truy cập.',
  weak_password: `Mật khẩu cần ít nhất ${MIN_PW} ký tự.`,
  invalid_email: 'Email không hợp lệ.',
  cannot_register: 'Không thể đăng ký với email này.',
  unauthorized: 'Cần đăng nhập.',
  forbidden: 'Chỉ admin mới làm được việc này.',
  invalid_refresh: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại.',
  not_found: 'Không tìm thấy.',
  bad_request: 'Yêu cầu không hợp lệ.',
};

export function originAllowed(env, origin) {
  if (!origin) return false;
  if (/^https:\/\/([a-z0-9-]+\.)?timikid-vn\.github\.io$/.test(origin)) return true;
  return String(env.EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}
function cors(env, req) {
  const o = req.headers.get('origin');
  const h = { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '600', vary: 'origin' };
  if (originAllowed(env, o)) h['access-control-allow-origin'] = o;
  return h;
}

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(e);
const uKey = (email) => `user:${email}`;
const adminEmail = (env) => normEmail(env.ADMIN_EMAIL || 'duylinh30190@gmail.com');
const publicUser = (u) => u && { email: u.email, name: u.name || '', status: u.status, role: u.role, apps: u.apps || ['*'], createdAt: u.createdAt, approvedAt: u.approvedAt || null, lastLoginAt: u.lastLoginAt || null };
const getUser = async (env, email) => JSON.parse((await env.USERS.get(uKey(email))) || 'null');
const putUser = (env, u) => env.USERS.put(uKey(u.email), JSON.stringify(u));

async function issue(env, u) {
  const now = Math.floor(Date.now() / 1000);
  const iss = env.AUTH_ISSUER || DEFAULT_ISSUER;
  const accessToken = await signJwt(env, { iss, aud: AUDIENCE, typ: 'access', sub: u.id, email: u.email, name: u.name || '', role: u.role, status: u.status, apps: u.apps || ['*'], tv: u.tv || 0, iat: now, exp: now + ACCESS_TTL });
  const refreshToken = randomToken(32);
  await env.USERS.put(`rt:${await sha256hex(refreshToken)}`, JSON.stringify({ email: u.email, tv: u.tv || 0, exp: now + REFRESH_TTL }), { expirationTtl: REFRESH_TTL });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL, user: publicUser(u) };
}

// ---- chống dò mật khẩu: khóa theo email (5 lần sai → 15 phút) và theo IP
async function lockState(env, email, ip) {
  const f = JSON.parse((await env.USERS.get(`fail:${email}`)) || '{"n":0}');
  const fi = JSON.parse((await env.USERS.get(`failip:${ip}`)) || '{"n":0}');
  const now = Date.now();
  return { locked: (f.until && f.until > now) || fi.n >= LOCK.ipMaxFails, f, fi };
}
async function recordFail(env, email, ip, st) {
  const n = st.f.n + 1;
  const until = n >= LOCK.maxFails ? Date.now() + LOCK.lockSec * 1000 * Math.min(8, 2 ** Math.floor((n - LOCK.maxFails) / LOCK.maxFails)) : 0;
  await env.USERS.put(`fail:${email}`, JSON.stringify({ n, until }), { expirationTtl: 24 * 3600 });
  await env.USERS.put(`failip:${ip}`, JSON.stringify({ n: st.fi.n + 1 }), { expirationTtl: LOCK.ipWindowSec });
}

async function bearer(env, req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const c = await verifyAccess({ ...env, AUTH_JWKS: { keys: [(await getSigner(env)).pub] } }, t);
  if (!c) return null;
  const u = await getUser(env, c.email);
  if (!u || u.status !== 'approved' || (u.tv || 0) !== (c.tv || 0)) return null;
  return u;
}
const isAdmin = (env, u) => u && u.role === 'admin' && u.email === adminEmail(env);

export async function handle(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const H = cors(env, req);
  const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...H } });
  const E = (error, s, extra = {}) => J({ error, message: MSG[error], ...extra }, s);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  const origin = req.headers.get('origin');
  if (origin && !originAllowed(env, origin)) return E('forbidden_origin', 403);

  const ready = !!(env.USERS && env.AUTH_SIGNING_JWK);
  if (p === '/' || p === '/health' || p === '/config') return J({ ok: true, ready, adminLogin: !!env.ADMIN_PASSWORD, issuer: env.AUTH_ISSUER || DEFAULT_ISSUER, minPassword: MIN_PW });
  if (!ready) return E('not_configured', 503);
  if (p === '/.well-known/jwks.json') return new Response(JSON.stringify({ keys: [(await getSigner(env)).pub] }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600', 'access-control-allow-origin': '*' } });
  if (req.method !== 'POST' && req.method !== 'GET') return E('bad_request', 405);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const ip = req.headers.get('cf-connecting-ip') || 'local';

  if (p === '/register' && req.method === 'POST') {
    const email = normEmail(body.email), pw = String(body.password || '');
    if (!validEmail(email)) return E('invalid_email', 400);
    if (pw.length < MIN_PW) return E('weak_password', 400);
    if (email === adminEmail(env) || (await getUser(env, email))) return E('cannot_register', 409);
    const u = { id: randomToken(12), email, name: String(body.name || '').slice(0, 80), status: 'pending', role: 'user', apps: ['*'], tv: 0, pw: await hashPassword(pw), createdAt: Date.now() };
    await putUser(env, u);
    return J({ ok: true, user: publicUser(u), message: MSG.pending }, 201);
  }

  if (p === '/login' && req.method === 'POST') {
    const email = normEmail(body.email), pw = String(body.password || '');
    const st = await lockState(env, email, ip);
    if (st.locked) return E('locked', 429);
    let u = await getUser(env, email), ok;
    if (email === adminEmail(env)) {
      if (!env.ADMIN_PASSWORD) return E('admin_login_disabled', 503);
      ok = await equalsSecret(pw, env.ADMIN_PASSWORD);
      if (ok && !u) { u = { id: randomToken(12), email, name: 'Admin', status: 'approved', role: 'admin', apps: ['*'], tv: 0, createdAt: Date.now(), approvedAt: Date.now() }; }
      if (ok) { u.role = 'admin'; u.status = 'approved'; }
    } else ok = await verifyPassword(pw, u?.pw);
    if (!ok || !u) { await recordFail(env, email, ip, st); return E('invalid_credentials', 401); }
    await env.USERS.delete(`fail:${email}`);
    if (u.status === 'pending') return E('pending', 403, { status: 'pending' });
    if (u.status !== 'approved') return E('revoked', 403, { status: u.status });
    u.lastLoginAt = Date.now(); await putUser(env, u);
    return J(await issue(env, u));
  }

  if (p === '/refresh' && req.method === 'POST') {
    const k = `rt:${await sha256hex(String(body.refreshToken || ''))}`;
    const rt = JSON.parse((await env.USERS.get(k)) || 'null');
    if (!rt) return E('invalid_refresh', 401);
    await env.USERS.delete(k); // dùng 1 lần
    const u = await getUser(env, rt.email);
    if (!u || (u.tv || 0) !== rt.tv || rt.exp < Date.now() / 1000) return E('invalid_refresh', 401);
    if (u.status !== 'approved') return E(u.status === 'pending' ? 'pending' : 'revoked', 403, { status: u.status });
    return J(await issue(env, u));
  }
  if (p === '/logout' && req.method === 'POST') {
    if (body.refreshToken) await env.USERS.delete(`rt:${await sha256hex(String(body.refreshToken))}`);
    return J({ ok: true });
  }

  const me = await bearer(env, req);
  if (p === '/me') return me ? J({ user: publicUser(me) }) : E('unauthorized', 401);
  if (p === '/password' && req.method === 'POST') {
    if (!me) return E('unauthorized', 401);
    if (isAdmin(env, me)) return E('bad_request', 400, { message: 'Mật khẩu admin đổi trong Cloudflare (secret ADMIN_PASSWORD).' });
    if (!(await verifyPassword(body.oldPassword, me.pw))) return E('invalid_credentials', 401);
    if (String(body.newPassword || '').length < MIN_PW) return E('weak_password', 400);
    me.pw = await hashPassword(String(body.newPassword)); me.tv = (me.tv || 0) + 1; me.mustChange = false;
    await putUser(env, me); return J(await issue(env, me));
  }

  // ---- admin
  if (p.startsWith('/admin/')) {
    if (!me) return E('unauthorized', 401);
    if (!isAdmin(env, me)) return E('forbidden', 403);
    if (p === '/admin/users' && req.method === 'GET') {
      const users = [];
      let cursor;
      do {
        const l = await env.USERS.list({ prefix: 'user:', cursor });
        for (const k of l.keys) { const u = JSON.parse((await env.USERS.get(k.name)) || 'null'); if (u) users.push(publicUser(u)); }
        cursor = l.list_complete === false ? l.cursor : undefined;
      } while (cursor);
      users.sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || b.createdAt - a.createdAt);
      return J({ users });
    }
    const m = p.match(/^\/admin\/users\/([^/]+)$/);
    if (m && req.method === 'POST') {
      const email = normEmail(decodeURIComponent(m[1]));
      if (email === adminEmail(env)) return E('bad_request', 400, { message: 'Không thể thay đổi tài khoản admin.' });
      const u = await getUser(env, email);
      if (!u) return E('not_found', 404);
      const a = body.action;
      if (a === 'remove') { await env.USERS.delete(uKey(email)); return J({ ok: true, removed: email }); }
      if (a === 'approve') { u.status = 'approved'; u.approvedAt = Date.now(); }
      else if (a === 'revoke') { u.status = 'revoked'; u.tv = (u.tv || 0) + 1; }
      else if (a === 'reset') {
        const temp = randomToken(9); // ~12 ký tự, chỉ hiện 1 lần cho admin
        u.pw = await hashPassword(temp); u.tv = (u.tv || 0) + 1; u.mustChange = true;
        await putUser(env, u); return J({ ok: true, user: publicUser(u), tempPassword: temp });
      } else if (a === 'set_apps') {
        const apps = Array.isArray(body.apps) ? body.apps.map((s) => String(s).trim()).filter((s) => /^[\w*-]{1,40}$/.test(s)) : [];
        u.apps = apps.length ? apps : ['*']; u.tv = (u.tv || 0) + 1;
      } else return E('bad_request', 400);
      await putUser(env, u); return J({ ok: true, user: publicUser(u) });
    }
    return E('not_found', 404);
  }
  return E('not_found', 404);
}
export { PBKDF2_ITER };
export default { fetch: (req, env) => handle(req, env) };
