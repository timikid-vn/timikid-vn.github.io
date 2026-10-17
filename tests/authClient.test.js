import { describe, it, expect } from 'vitest';
import { createAuth } from '../public/auth/timikid-auth.js';
import { handle } from '../auth-worker/src/index.js';
import { KV, makeSigningJwk } from '../auth-worker/test/helpers.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
describe('timikid-auth client', () => {
  it('đăng ký → chờ duyệt → admin duyệt → đăng nhập, tự làm mới token', async () => {
    const env = { USERS: new KV(), AUTH_SIGNING_JWK: await makeSigningJwk(), ADMIN_EMAIL: 'duylinh30190@gmail.com', ADMIN_PASSWORD: 'admin-pass-rat-dai' };
    const fetchFn = (u, init) => handle(new Request(u, { ...init, headers: { ...init.headers, origin: 'https://timikid-vn.github.io' } }), env);
    const store = mem(); const user = createAuth({ storage: store, fetchFn }), admin = createAuth({ storage: mem(), fetchFn });
    expect((await user.register('a@x.vn', 'mat-khau-123')).status).toBe('pending');
    await expect(user.login('a@x.vn', 'mat-khau-123')).rejects.toMatchObject({ code: 'pending' });
    await admin.login('duylinh30190@gmail.com', 'admin-pass-rat-dai');
    expect((await admin.admin.users()).map((u) => [u.email, u.status])).toEqual([['a@x.vn', 'pending'], ['duylinh30190@gmail.com', 'approved']]);
    await admin.admin.act('a@x.vn', 'approve');
    expect((await user.login('a@x.vn', 'mat-khau-123')).status).toBe('approved');
    const t1 = await user.getAccessToken();
    expect(t1).toBeTruthy();
    // ép hết hạn → client mới (cùng storage, như app khác cùng origin) tự refresh
    const saved = JSON.parse(store.getItem('timikid-auth-v1')); saved.accessExp = 0; store.setItem('timikid-auth-v1', JSON.stringify(saved));
    const other = createAuth({ storage: store, fetchFn, app: 'app-khac' });
    expect(other.user.email).toBe('a@x.vn');
    const t2 = await other.getAccessToken();
    expect(t2).toBeTruthy(); expect(t2).not.toBe(t1);
    await admin.admin.act('a@x.vn', 'revoke');
    await expect(user.login('a@x.vn', 'mat-khau-123')).rejects.toMatchObject({ code: 'revoked' });
    await user.logout(); expect(user.user).toBeNull(); expect(await user.getAccessToken()).toBeNull();
  });
});
