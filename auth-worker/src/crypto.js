import { b64url, unb64url } from '../client/verify.js';
const enc = new TextEncoder();
export const PBKDF2_ITER = 100_000; // mức tối đa Cloudflare Workers cho phép
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export const sha256hex = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** So sánh hằng thời gian */
export function safeEqual(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

/** PBKDF2-SHA256, salt 16 byte riêng từng người */
export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iter = PBKDF2_ITER) {
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256);
  return { alg: 'pbkdf2-sha256', iter, salt: b64url(salt), hash: b64url(bits) };
}
export async function verifyPassword(password, rec) {
  if (!rec?.salt) { await hashPassword(String(password || '')); return false; } // tốn thời gian như thật
  const h = await hashPassword(String(password || ''), unb64url(rec.salt), rec.iter);
  return safeEqual(h.hash, rec.hash);
}
/** So sánh mật khẩu admin với secret ADMIN_PASSWORD (so trên băm để hằng thời gian & cùng độ dài) */
export async function equalsSecret(given, secret) {
  return safeEqual(await sha256hex('a:' + String(given ?? '')), await sha256hex('a:' + String(secret ?? '')));
}

// ---- Ký JWT ES256
let signer = null;
export async function getSigner(env) {
  if (signer && signer.src === env.AUTH_SIGNING_JWK) return signer;
  const jwk = typeof env.AUTH_SIGNING_JWK === 'string' ? JSON.parse(env.AUTH_SIGNING_JWK) : env.AUTH_SIGNING_JWK;
  const pub = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  // kid = JWK thumbprint (RFC 7638)
  const kid = b64url(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y }))));
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  signer = { src: env.AUTH_SIGNING_JWK, kid, pub: { ...pub, kid, alg: 'ES256', use: 'sig' }, key };
  return signer;
}
export async function signJwt(env, claims) {
  const s = await getSigner(env);
  const h = b64url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: s.kid })));
  const p = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, s.key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
