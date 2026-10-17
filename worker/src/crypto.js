// Hàm mật mã dùng Web Crypto (chạy được cả trên Cloudflare Workers lẫn Node 20 để test).
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

/** So sánh chuỗi thời gian hằng (tránh dò mật khẩu theo thời gian phản hồi) */
export function safeEqual(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function randomId(bytes = 16) { return hex(crypto.getRandomValues(new Uint8Array(bytes))); }

// ---- Mã hóa token sàn trước khi lưu KV: AES-256-GCM, khóa TOKEN_ENC_KEY (base64, 32 byte)
async function aesKey(b64key) {
  const raw = unb64(b64key);
  if (raw.length !== 32) throw new Error('TOKEN_ENC_KEY phải là 32 byte base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptJSON(b64key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(b64key), enc.encode(JSON.stringify(obj)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decryptJSON(b64key, s) {
  const [iv, ct] = s.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(b64key), unb64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---- Phiên đăng nhập chủ shop: token ký HMAC "exp.sig" (không lưu gì ở trình duyệt ngoài token này)
export async function makeSession(secret, ttlSec, now = Date.now()) {
  const payload = b64url(JSON.stringify({ sub: 'owner', exp: Math.floor(now / 1000) + ttlSec }));
  return `${payload}.${await hmacHex(secret, payload)}`;
}
export async function verifySession(secret, token, now = Date.now()) {
  if (!token || !secret) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !safeEqual(sig, await hmacHex(secret, payload))) return false;
  try { return JSON.parse(unb64url(payload)).exp > Math.floor(now / 1000); } catch { return false; }
}
