// Thư viện dùng chung cho MỌI Worker của timikid-vn: kiểm tra phiên đăng nhập do timikid-auth cấp.
// Chỉ cần KHÓA CÔNG KHAI (JWKS) — không chia sẻ bí mật giữa các app.
//   import { verifyAccess } from './verify.js';
//   const user = await verifyAccess(env, bearerToken, { app: 'shop-connect' }); // null nếu không hợp lệ
const enc = new TextEncoder();
const dec = new TextDecoder();
export const DEFAULT_ISSUER = 'https://timikid-auth.timikid-vn.workers.dev';
export const AUDIENCE = 'timikid-vn';
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

let cache = { at: 0, keys: null, src: null };
/** Lấy JWKS: biến AUTH_JWKS (JSON) → service binding AUTH → fetch issuer. Cache 10 phút. */
async function getJwks(env, fetchFn) {
  if (env.AUTH_JWKS) return typeof env.AUTH_JWKS === 'string' ? JSON.parse(env.AUTH_JWKS) : env.AUTH_JWKS;
  const iss = env.AUTH_ISSUER || DEFAULT_ISSUER;
  if (cache.keys && cache.src === iss && Date.now() - cache.at < 600_000) return cache.keys;
  const url = `${iss}/.well-known/jwks.json`;
  const r = env.AUTH?.fetch ? await env.AUTH.fetch(url) : await (fetchFn || fetch)(url);
  if (!r.ok) throw new Error('jwks ' + r.status);
  cache = { at: Date.now(), keys: await r.json(), src: iss };
  return cache.keys;
}
export function resetJwksCache() { cache = { at: 0, keys: null, src: null }; }

/** Xác minh JWT ES256 (chữ ký, iss, aud, exp, trạng thái approved, quyền vào app). Trả claims hoặc null. */
export async function verifyAccess(env, token, { app, fetchFn, now = Date.now() } = {}) {
  try {
    const [h, p, s] = String(token || '').split('.');
    if (!h || !p || !s) return null;
    const header = JSON.parse(dec.decode(unb64url(h)));
    if (header.alg !== 'ES256') return null;
    let jwk = (await getJwks(env, fetchFn)).keys?.find((k) => k.kid === header.kid);
    // khóa mới (xoay khóa) → tải lại JWKS ngay, tối đa 1 lần/30 giây
    if (!jwk && !env.AUTH_JWKS && Date.now() - cache.at > 30_000) { cache.at = 0; jwk = (await getJwks(env, fetchFn)).keys?.find((k) => k.kid === header.kid); }
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64url(s), enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const c = JSON.parse(dec.decode(unb64url(p)));
    const sec = Math.floor(now / 1000);
    if (c.iss !== (env.AUTH_ISSUER || DEFAULT_ISSUER) || c.aud !== AUDIENCE || !(c.exp > sec) || c.typ !== 'access') return null;
    if (c.status !== 'approved') return null;
    if (app && !(c.apps || []).includes('*') && !(c.apps || []).includes(app) && c.role !== 'admin') return null;
    return c;
  } catch { return null; }
}
