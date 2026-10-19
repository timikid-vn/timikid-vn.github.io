// Durable Object giữ token của sàn cho TỪNG shop (Shopee: shopee:<shop_id>; TikTok: tiktok:<seller> vì token dùng chung theo người bán).
// Mục tiêu: mỗi shop tối đa 1 lần làm mới token đang chạy; các request đồng thời chờ và dùng lại access token mới,
// không bao giờ gửi cùng một refresh_token (dùng 1 lần) hai lần. Token lưu mã hóa AES-GCM (TOKEN_ENC_KEY) trong storage của DO.
import { encryptJSON, decryptJSON } from './crypto.js';
import * as shopee from './shopee.js';
import * as tiktok from './tiktok.js';

export const MARGIN = 300; // còn < 5 phút → làm mới
// Cron: làm mới sớm để kết nối không bao giờ hết hạn (Shopee access ~4 giờ, refresh ~30 ngày)
export const CRON_MARGIN = { shopee: 3.5 * 3600, tiktok: 2 * 86400 };
const nowSec = () => Math.floor(Date.now() / 1000);
// Lỗi vĩnh viễn từ sàn → cần kết nối lại (không thử lại)
export const isPermanent = (m) => /refresh[ _]?token|invalid_acc?c?ess_token|error_auth|invalid_token/i.test(String(m || ''));

export const doKey = (rec) => (rec.platform === 'tiktok' ? `tiktok:${rec.sellerKey || rec.id}` : `shopee:${rec.id}`);
export async function doCall(env, rec, op, body = {}) {
  if (!env.TOKENS) throw new Error('TOKENS binding missing');
  const stub = env.TOKENS.get(env.TOKENS.idFromName(doKey(rec)));
  const r = await stub.fetch(`https://tokens/${op}`, { method: 'POST', body: JSON.stringify({ platform: rec.platform, shopId: String(rec.id), seed: rec.enc || null, ...body }) });
  return r.json();
}

export class ShopTokens {
  constructor(ctx, env, fetchFn) {
    this.ctx = ctx; this.env = env; this.fetchFn = fetchFn || ((...a) => fetch(...a));
    this.state = undefined; this.loading = null; this.inflight = null;
  }
  async put(s) { this.state = s; await this.ctx.storage.put('s', s); }
  /** Đọc trạng thái; lần đầu (chưa có) thì nhận token cũ từ KV (seed) — di chuyển dữ liệu khi dùng lần đầu */
  async load(seed) {
    if (this.state === undefined) { this.loading ||= this.ctx.storage.get('s').then((s) => { if (this.state === undefined) this.state = s || null; }); await this.loading; }
    if (!this.state && seed) await this.put({ enc: seed, reauth: null, migratedAt: Date.now(), refreshCount: 0 });
    return this.state;
  }
  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const b = await request.json().catch(() => ({}));
    const J = (d) => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
    try {
      if (op === 'access') return J(await this.access(b, b.margin ?? MARGIN));
      if (op === 'cron') {
        const s = await this.load(b.seed);
        if (!s) return J({ ok: false, error: 'no_tokens' });
        if (s.reauth) return J({ ok: false, error: 'reauth_required', skipped: true });
        const r = await this.access(b, CRON_MARGIN[b.platform] ?? MARGIN);
        return J({ ok: r.ok, error: r.error, refreshed: !!r.refreshed });
      }
      if (op === 'set') { // kết nối (lại) qua OAuth: token mới, bỏ cờ cần kết nối lại
        await this.put({ enc: b.enc, reauth: null, connectedAt: Date.now(), refreshCount: 0 });
        return J({ ok: true });
      }
      if (op === 'clear') { this.state = null; await this.ctx.storage.delete('s'); return J({ ok: true }); }
      if (op === 'status') {
        const s = await this.load(null);
        if (!s) return J({ ok: true, known: false, reauth: false });
        const t = await decryptJSON(this.env.TOKEN_ENC_KEY, s.enc).catch(() => null);
        return J({ ok: true, known: true, reauth: !!s.reauth, accessExp: t?.access_exp ?? null, refreshedAt: s.refreshedAt ?? null, refreshCount: s.refreshCount || 0 });
      }
      return J({ ok: false, error: 'bad_op' });
    } catch (e) { return J({ ok: false, error: 'internal', message: String(e.message || e).slice(0, 160) }); }
  }
  /** Access token còn hạn; nếu sắp hết → làm mới đúng 1 lần (các lời gọi đồng thời chờ chung) */
  async access({ platform, shopId, seed }, margin) {
    const s = await this.load(seed);
    if (!s) return { ok: false, error: 'no_tokens' };
    if (this.inflight) return this.inflight; // đang làm mới → chờ kết quả chung
    if (s.reauth) return { ok: false, error: 'reauth_required', reason: s.reauth };
    const t = await decryptJSON(this.env.TOKEN_ENC_KEY, s.enc);
    if (t.access_exp > nowSec() + margin) return { ok: true, tokens: pub(t) };
    if (this.inflight) return this.inflight;
    this.inflight = this.refresh(platform, shopId, t).finally(() => { this.inflight = null; });
    return this.inflight;
  }
  async refresh(platform, shopId, t) {
    let nt;
    try {
      nt = platform === 'tiktok' ? await tiktok.refresh(this.env, t.refresh_token, this.fetchFn) : await shopee.refresh(this.env, t.refresh_token, shopId, this.fetchFn);
      if (!nt?.access_token) throw new Error('empty token response');
    } catch (e) {
      const m = String(e.message || e).slice(0, 200);
      console.log('token refresh failed', platform, shopId, m.replace(/[A-Za-z0-9]{24,}/g, '…'));
      if (isPermanent(m)) { await this.put({ ...this.state, reauth: m.replace(/[A-Za-z0-9]{24,}/g, '…'), reauthAt: Date.now() }); return { ok: false, error: 'reauth_required', reason: m }; }
      return { ok: false, error: 'refresh_failed', message: m };
    }
    const merged = { ...t, ...nt };
    // Lưu (mã hóa) TRƯỚC khi trả về — refresh_token cũ đã dùng, không được mất token mới
    await this.put({ ...this.state, enc: await encryptJSON(this.env.TOKEN_ENC_KEY, merged), reauth: null, refreshedAt: Date.now(), refreshCount: (this.state.refreshCount || 0) + 1 });
    return { ok: true, tokens: pub(merged), refreshed: true };
  }
}
// Chỉ trả access token ra ngoài DO (refresh_token không rời DO)
const pub = (t) => ({ access_token: t.access_token, access_exp: t.access_exp, open_id: t.open_id });
