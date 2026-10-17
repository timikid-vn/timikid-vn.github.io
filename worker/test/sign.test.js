import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import * as tiktok from '../src/tiktok.js';
import * as shopee from '../src/shopee.js';
import { encryptJSON, decryptJSON, makeSession, verifySession, safeEqual } from '../src/crypto.js';

describe('TikTok sign — ví dụ chính thức trong "Sign your API request"', () => {
  it('Get Authorized Shops: secret e59af819cc → b596b73e…', async () => {
    const params = { app_key: '29a39d', timestamp: '1623812664', sign: 'bỏ qua', access_token: 'bỏ qua' };
    expect(tiktok.signString('e59af819cc', '/authorization/202309/shops', params)).toBe('e59af819cc/authorization/202309/shopsapp_key29a39dtimestamp1623812664e59af819cc');
    expect(await tiktok.sign('e59af819cc', '/authorization/202309/shops', params)).toBe('b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8');
  });
  it('chuỗi ký có body + shop_cipher theo đúng ví dụ Update Shop Webhook', () => {
    const s = tiktok.signString('S', '/event/202309/webhooks', { timestamp: '1696909648', shop_cipher: 'ROW_xkMbgAAAeVAQra0eZWebFQq5aIK', app_key: '68xu9ks5p4i8' }, '{"address":"https://partner.tiktokshop.com","event_type":"PACKAGE_UPDATE"}');
    expect(s).toBe('S/event/202309/webhooksapp_key68xu9ks5p4i8shop_cipherROW_xkMbgAAAeVAQra0eZWebFQq5aIKtimestamp1696909648{"address":"https://partner.tiktokshop.com","event_type":"PACKAGE_UPDATE"}S');
  });
});

describe('Shopee sign (HMAC-SHA256 hex, theo tài liệu v2.authentication)', () => {
  const ref = (k, m) => createHmac('sha256', k).update(m).digest('hex');
  it('public: partner_id + path + timestamp', async () => {
    expect(await shopee.signPublic('key123', 1000016, '/api/v2/shop/auth_partner', 1657254106)).toBe(ref('key123', '1000016/api/v2/shop/auth_partner1657254106'));
  });
  it('shop: partner_id + path + timestamp + access_token + shop_id', async () => {
    expect(await shopee.signShop('k', 1, '/api/v2/shop/get_shop_info', 2, 'AT', 99)).toBe(ref('k', '1/api/v2/shop/get_shop_info2AT99'));
  });
  it('auth URL chứa partner_id, timestamp, sign, redirect', async () => {
    const u = new URL(await shopee.authUrl({ SHOPEE_PARTNER_ID: '1000016', SHOPEE_PARTNER_KEY: 'k' }, 'https://x.dev/oauth/shopee/callback?state=abc', 1657254106));
    expect(u.origin + u.pathname).toBe('https://partner.shopeemobile.com/api/v2/shop/auth_partner');
    expect(u.searchParams.get('redirect')).toBe('https://x.dev/oauth/shopee/callback?state=abc');
    expect(u.searchParams.get('sign')).toBe(ref('k', '1000016/api/v2/shop/auth_partner1657254106'));
  });
});

describe('crypto', () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  it('AES-GCM mã hóa/giải mã token, bản mã không chứa token gốc', async () => {
    const c = await encryptJSON(key, { access_token: 'SECRET_TOKEN' });
    expect(c).not.toContain('SECRET_TOKEN');
    expect(await decryptJSON(key, c)).toEqual({ access_token: 'SECRET_TOKEN' });
  });
  it('phiên: đúng chữ ký & còn hạn mới hợp lệ', async () => {
    const t = await makeSession('s', 60, 1_000_000_000_000);
    expect(await verifySession('s', t, 1_000_000_000_000)).toBe(true);
    expect(await verifySession('s', t, 1_000_000_000_000 + 61_000)).toBe(false);
    expect(await verifySession('other', t, 1_000_000_000_000)).toBe(false);
    expect(await verifySession('s', t.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), 1_000_000_000_000)).toBe(false);
  });
  it('safeEqual', () => { expect(safeEqual('abc', 'abc')).toBe(true); expect(safeEqual('abc', 'abd')).toBe(false); expect(safeEqual('', undefined)).toBe(true); });
});
