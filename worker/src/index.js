// Cloudflare Worker: kết nối shop Shopee & TikTok Shop cho máy tính lãi lỗ.
// Token của sàn chỉ nằm trong KV (mã hóa AES-GCM), không bao giờ trả về trình duyệt.
import { encryptJSON, decryptJSON, randomId } from './crypto.js';
import { verifyAccess, DEFAULT_ISSUER } from '../../auth-worker/client/verify.js';

export const APP_ID = 'shop-connect';
import * as shopee from './shopee.js';
import * as tiktok from './tiktok.js';
import { ShopTokens, doCall } from './tokens.js';
export { ShopTokens };

const STATE_TTL = 600;
// Shopee chỉ chấp nhận redirect thuộc "Redirect URL Domain" khai trong Console. Nếu domain đó không phải Worker
// (vd. n8n.timikid.com), đặt SHOPEE_REDIRECT_URL = relay; relay phải 302 chuyển NGUYÊN query sang /oauth/shopee/callback.
const SHOPEE_RELAY_CANDIDATE = 'https://n8n.timikid.com/webhook/shopee-callback';
export const shopeeRedirectBase = (env, url) => (env.SHOPEE_REDIRECT_URL || `${url.origin}/oauth/shopee/callback`).replace(/\?.*$/, '');

const configured = (env) => ({
  shopee: !!(env.SHOPEE_PARTNER_ID && env.SHOPEE_PARTNER_KEY),
  tiktok: !!(env.TIKTOK_APP_KEY && env.TIKTOK_APP_SECRET),
  // lõi: khóa mã hóa + KV. Đăng nhập dùng tài khoản chung timikid-auth (admin duyệt).
  ready: !!(env.TOKEN_ENC_KEY && env.SHOPS),
  auth: env.AUTH_ISSUER || DEFAULT_ISSUER,
});
const MSG = {
  use_central_login: 'Đăng nhập bằng tài khoản timikid (timikid-auth), không dùng mật khẩu riêng nữa.',
  unauthorized: 'Cần đăng nhập bằng tài khoản timikid đã được admin duyệt.',
  platform_not_configured: 'Chưa cấu hình khóa app của sàn này — đang chờ sàn duyệt app.',
  not_configured: 'Máy chủ kết nối chưa được cấu hình.',
  forbidden_origin: 'Nguồn (origin) không được phép.',
};

function cors(env, req) {
  const origin = req.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGIN || 'https://timikid-vn.github.io').split(',').map((s) => s.trim());
  const h = { 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '600', vary: 'origin' };
  if (origin && allowed.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const json = (env, req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(env, req) } });

// ---- lưu trữ
const shopKey = (p, id) => `shop:${p}:${id}`;
async function saveShop(env, rec) {
  const { tokens, ...meta } = rec;
  delete meta.enc;
  const enc = await encryptJSON(env.TOKEN_ENC_KEY, tokens);
  await env.SHOPS.put(shopKey(rec.platform, rec.id), JSON.stringify({ ...meta, enc }));
  return enc;
}
async function loadShop(env, p, id) {
  const raw = await env.SHOPS.get(shopKey(p, id));
  if (!raw) return null;
  const { enc, ...meta } = JSON.parse(raw);
  return { ...meta, enc, tokens: await decryptJSON(env.TOKEN_ENC_KEY, enc) };
}
const publicShop = ({ tokens, enc, cipher, ...m }) => m;

/** Access token còn hạn — qua Durable Object của shop (khóa làm mới: tối đa 1 lần refresh đang chạy / shop).
 *  Token trong KV chỉ là bản gốc để DO nhận lần đầu (di chuyển dữ liệu); sau đó DO là nguồn chuẩn. */
export async function validTokens(env, rec) {
  const r = await doCall(env, rec, 'access');
  if (r.ok) return r.tokens;
  throw Object.assign(new Error(r.reason || r.message || r.error), { code: r.error });
}

/** Phiên do timikid-auth cấp (JWT ES256), chỉ người đã được duyệt và có quyền vào app này */
async function authed(env, req) {
  const h = req.headers.get('authorization') || '';
  return verifyAccess(env, h.replace(/^Bearer\s+/i, ''), { app: APP_ID });
}

export async function handle(req, env, fetchFn = fetch) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const J = (d, s) => json(env, req, d, s);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
  const cfg = configured(env);
  const E = (error, status) => J({ error, message: MSG[error] }, status);
  // Gọi API từ trang web khác → từ chối hẳn (không chỉ thiếu header CORS)
  const origin = req.headers.get('origin');
  if (p.startsWith('/api/') && origin && !cors(env, req)['access-control-allow-origin']) return E('forbidden_origin', 403);

  if (p === '/api/status' || p === '/health' || p === '/') return J({ ...cfg, ok: true });
  if (p === '/api/diag/shopee' && cfg.shopee) {
    if (!(await authed(env, req))) return E('unauthorized', 401); // chẩn đoán gọi Shopee bằng khóa app → chỉ cho người đã đăng nhập
    // Chỉ trả mã lỗi, không trả dữ liệu shop
    const [live, sandbox] = await Promise.all([shopee.probe(env, shopee.SHOPEE_LIVE, fetchFn), shopee.probe(env, shopee.SHOPEE_SANDBOX, fetchFn)]);
    // Thử mở link ủy quyền với từng redirect ứng viên (state giả "diag", không lưu) — chỉ xem Shopee có báo lỗi không
    const tryAuth = async (redirect) => {
      try {
        const r = await fetchFn(await shopee.authUrl(env, redirect), { redirect: 'manual' });
        const txt = r.status < 300 ? (await r.text()).slice(0, 4000) : '';
        const err = txt.match(/"error"\s*:\s*"([^"]+)"/)?.[1] || null;
        return { redirect_host: new URL(redirect).host, http: r.status, error: err, message: (txt.match(/"message"\s*:\s*"([^"]{0,200})"/) || [])[1] || null, location: r.headers.get('location') ? (({ host, pathname }) => host + pathname)(new URL(r.headers.get('location'), 'https://x')) : null, looks_like_page: /<html/i.test(txt) && !err };
      } catch { return { error: 'network' }; }
    };
    const candidates = [`${url.origin}/oauth/shopee/callback?state=diag`, `${SHOPEE_RELAY_CANDIDATE}?state=diag`];
    if (env.SHOPEE_REDIRECT_URL && !candidates.some((c) => c.startsWith(env.SHOPEE_REDIRECT_URL))) candidates.push(`${env.SHOPEE_REDIRECT_URL}?state=diag`);
    const auth_partner = await Promise.all(candidates.map(tryAuth));
    return J({ partner_id: String(env.SHOPEE_PARTNER_ID), redirect_in_use: shopeeRedirectBase(env, url), auth_partner, host_in_use: env.SHOPEE_HOST || shopee.SHOPEE_LIVE, live, sandbox });
  }
  if (!cfg.ready) return E('not_configured', 503);

  if (p === '/api/login') return E('use_central_login', 410);

  // ---- OAuth callback: sàn chuyển trình duyệt về đây (không có header Authorization) → kiểm tra state
  const cb = p.match(/^\/oauth\/(shopee|tiktok)\/callback$/);
  if (cb) {
    const platform = cb[1];
    const state = url.searchParams.get('state');
    const front = env.FRONTEND_URL || 'https://timikid-vn.github.io/';
    const back = (msg) => Response.redirect(`${front}#ket-noi=${encodeURIComponent(msg)}`, 302);
    if (!state || !(await env.SHOPS.get(`state:${platform}:${state}`))) return back('loi_state');
    await env.SHOPS.delete(`state:${platform}:${state}`);
    try {
      if (platform === 'shopee') {
        const code = url.searchParams.get('code'), shopId = url.searchParams.get('shop_id');
        if (!code || !shopId) return back('thieu_code');
        const tokens = await shopee.exchangeCode(env, code, shopId, fetchFn);
        const info = await shopee.shopInfo(env, tokens, shopId, fetchFn).catch(() => ({}));
        const old = await loadShop(env, 'shopee', shopId).catch(() => null);
        const rec = { platform, id: String(shopId), name: info.name || `Shop ${shopId}`, region: info.region || 'VN', mall: old?.mall ?? false, connectedAt: Date.now(), tokens };
        const enc = await saveShop(env, rec);
        await doCall(env, rec, 'set', { enc }); // token mới → DO (bỏ cờ cần kết nối lại)
      } else {
        const code = url.searchParams.get('code');
        if (!code) return back('thieu_code');
        const tokens = await tiktok.exchangeCode(env, code, fetchFn);
        const shops = await tiktok.authorizedShops(env, tokens, fetchFn);
        const sellerKey = tokens.open_id || randomId(8);
        let enc = null, first = null;
        for (const s of shops) {
          const old = await loadShop(env, 'tiktok', s.id).catch(() => null);
          first ||= { platform, id: String(s.id), sellerKey };
          enc = await saveShop(env, { platform, id: String(s.id), name: s.name, region: s.region, code: s.code, cipher: s.cipher, sellerKey, mall: old?.mall ?? false, connectedAt: Date.now(), tokens });
        }
        if (first) await doCall(env, first, 'set', { enc }); // 1 DO cho mọi shop của người bán
      }
      return back(`ok_${platform}`);
    } catch (e) { console.log('oauth error', e.message); return back('loi_doi_token'); }
  }

  if (!p.startsWith('/api/')) return J({ error: 'not_found' }, 404);
  const start = p.match(/^\/api\/oauth\/(shopee|tiktok)\/url$/);
  // Thiếu khóa app của sàn → báo rõ ngay (thông tin này vốn công khai ở /api/status)
  if (start && !cfg[start[1]]) return E('platform_not_configured', 409);
  if (!(await authed(env, req))) return E('unauthorized', 401);

  if (start && req.method === 'POST') {
    const platform = start[1];
    const state = randomId();
    await env.SHOPS.put(`state:${platform}:${state}`, '1', { expirationTtl: STATE_TTL });
    // Shopee không trả lại "state" → nhét state vào redirect URL (qua relay thì relay chuyển tiếp nguyên query)
    const authUrl = platform === 'shopee' ? await shopee.authUrl(env, `${shopeeRedirectBase(env, url)}?state=${state}`) : tiktok.authUrl(env, state);
    return J({ url: authUrl });
  }

  if (p === '/api/shops' && req.method === 'GET') {
    const list = await env.SHOPS.list({ prefix: 'shop:' });
    const shops = [];
    for (const k of list.keys) {
      const raw = await env.SHOPS.get(k.name); if (!raw) continue;
      const rec = JSON.parse(raw);
      const st = await doCall(env, rec, 'status').catch(() => ({}));
      shops.push({ ...publicShop(rec), reauth: !!st.reauth });
    }
    return J({ shops });
  }

  const m = p.match(/^\/api\/shops\/(shopee|tiktok)\/([^/]+)(?:\/(products|categories)(?:\/([^/]+))?)?$/);
  if (m) {
    const [, platform, id, sub, pid] = m;
    const isProducts = !!sub;
    if (sub && req.method !== 'GET') return J({ error: 'method_not_allowed' }, 405); // chỉ đọc
    const rec = await loadShop(env, platform, id);
    if (!rec) return J({ error: 'shop_not_found' }, 404);
    if (!isProducts && req.method === 'DELETE') {
      await env.SHOPS.delete(shopKey(platform, id));
      // TikTok: DO dùng chung theo người bán → chỉ xóa khi không còn shop nào của người bán đó
      let shared = false;
      if (platform === 'tiktok' && rec.sellerKey) for (const k of (await env.SHOPS.list({ prefix: 'shop:tiktok:' })).keys) { const o = JSON.parse((await env.SHOPS.get(k.name)) || 'null'); if (o?.sellerKey === rec.sellerKey) shared = true; }
      if (!shared) await doCall(env, rec, 'clear').catch(() => {});
      return J({ ok: true });
    }
    if (!isProducts && req.method === 'PATCH') {
      const b = await req.json().catch(() => ({}));
      if (typeof b.mall === 'boolean') rec.mall = b.mall;
      await saveShop(env, rec); return J({ shop: publicShop(rec) });
    }
    if (!isProducts) return J({ shop: publicShop(rec) });
    try {
      const tokens = await validTokens(env, rec);
      if (platform === 'shopee') {
        const getCats = async () => {
          let cats = JSON.parse((await env.SHOPS.get('cache:shopee:categories')) || 'null');
          if (!cats) { cats = await shopee.getCategories(env, tokens, id, fetchFn); await env.SHOPS.put('cache:shopee:categories', JSON.stringify(cats), { expirationTtl: 86400 }); }
          return cats;
        };
        if (sub === 'categories') return J({ categories: (await getCats()).map((c) => [c.id, c.parent, c.name]) });
        if (pid) {
          const cats = await getCats();
          return J({ product: await shopee.productDetail(env, tokens, id, pid, cats, fetchFn) });
        }
        return J(await shopee.listProducts(env, tokens, id, { offset: url.searchParams.get('next') || 0, q: url.searchParams.get('q') || '' }, fetchFn));
      }
      if (sub === 'categories') return J({ categories: [] });
      if (pid) return J({ product: await tiktok.productDetail(env, tokens, rec.cipher, pid, fetchFn) });
      return J(await tiktok.listProducts(env, tokens, rec.cipher, { pageToken: url.searchParams.get('next') || '' }, fetchFn));
    } catch (e) {
      console.log('platform error', platform, String(e.message || e).slice(0, 200).replace(/[A-Za-z0-9]{24,}/g, '…'));
      if (e.code === 'reauth_required') return J({ error: 'reauth_required', message: `Kết nối ${platform === 'shopee' ? 'Shopee' : 'TikTok Shop'} của shop này đã hết hạn. Hãy bấm “Kết nối ${platform === 'shopee' ? 'Shopee' : 'TikTok Shop'}” để kết nối lại.` }, 502);
      if (e.code === 'refresh_failed' || e.code === 'internal') return J({ error: 'platform_error', message: 'Chưa làm mới được kết nối với sàn (sàn bận hoặc lỗi mạng). Thử lại sau ít giây.' }, 502);
      if (e.code === 'no_tokens') return J({ error: 'reauth_required', message: 'Shop chưa có token — hãy kết nối lại.' }, 502);
      const msg = platform === 'shopee' ? shopee.friendlyError(e) : String(e.message || e);
      return J({ error: /hết hạn/.test(msg) ? 'reauth_required' : 'platform_error', message: msg }, 502);
    }
  }
  return J({ error: 'not_found' }, 404);
}

/** Cron: làm mới token sớm cho mọi shop (qua cùng khóa DO) để kết nối không bao giờ hết hạn khi ít dùng */
export async function refreshAll(env) {
  const out = [], seen = new Set();
  const list = await env.SHOPS.list({ prefix: 'shop:' });
  for (const k of list.keys) {
    const raw = await env.SHOPS.get(k.name); if (!raw) continue;
    const rec = JSON.parse(raw);
    const key = rec.platform === 'tiktok' ? `tiktok:${rec.sellerKey || rec.id}` : `shopee:${rec.id}`;
    if (seen.has(key)) continue; seen.add(key);
    if (!configured(env)[rec.platform]) continue;
    const r = await doCall(env, rec, 'cron').catch((e) => ({ ok: false, error: 'internal', message: e.message }));
    out.push({ key, ok: !!r.ok, refreshed: !!r.refreshed, error: r.error || null });
  }
  console.log('cron refresh', JSON.stringify(out));
  return out;
}

export default {
  fetch: (req, env) => handle(req, env),
  scheduled: (event, env, ctx) => ctx.waitUntil(refreshAll(env)),
};
