import { describe, it, expect, vi } from 'vitest';
import { accessState, createAccessGate, pendingStore } from '../src/shopAccess.js';
import { createAuth } from '../public/auth/timikid-auth.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const fakeAuth = (user = null) => { const ls = new Set(); return { user, onChange: (f) => ls.add(f), set(u) { this.user = u; ls.forEach((f) => f(u)); } }; };
const U = (o = {}) => ({ email: 'a@x.vn', status: 'approved', role: 'user', apps: ['*'], ...o });

describe('Quyền "Chọn shop"', () => {
  it('accessState', () => {
    expect(accessState(null)).toBe('out');
    expect(accessState(U({ status: 'pending' }))).toBe('pending');
    expect(accessState(U({ status: 'revoked' }))).toBe('out');
    expect(accessState(U({ apps: ['app-khac'] }))).toBe('noapp');
    expect(accessState(U({ apps: ['shop-connect'] }))).toBe('ok');
    expect(accessState(U({ apps: [], role: 'admin' }))).toBe('ok');
    expect(accessState(U())).toBe('ok');
  });
  it('gate: báo ngay lúc khởi tạo, chỉ báo khi đổi trạng thái (làm mới token không báo lại)', () => {
    const a = fakeAuth(null), f = vi.fn();
    const g = createAccessGate(a, f);
    expect(f).toHaveBeenLastCalledWith(false, 'out'); expect(g.ok).toBe(false);
    a.set(U()); expect(f).toHaveBeenLastCalledWith(true, 'ok'); expect(g.ok).toBe(true);
    a.set(U()); a.set(U({ name: 'x' })); // refresh token → cùng trạng thái
    expect(f).toHaveBeenCalledTimes(2);
    a.set(null); expect(f).toHaveBeenLastCalledWith(false, 'out'); expect(f).toHaveBeenCalledTimes(3);
    a.set(U({ apps: ['app-khac'] })); expect(f).toHaveBeenCalledTimes(3); // vẫn "không được dùng"
  });
  it('gate với client thật: hết phiên (refresh thất bại) → báo đăng xuất', async () => {
    const storage = mem();
    storage.setItem('timikid-auth-v1', JSON.stringify({ user: U(), accessToken: 'x', refreshToken: 'r', accessExp: 0 }));
    const auth = createAuth({ storage, fetchFn: async () => new Response(JSON.stringify({ error: 'invalid_refresh' }), { status: 401 }) });
    const f = vi.fn(); createAccessGate(auth, f);
    expect(f).toHaveBeenLastCalledWith(true, 'ok');
    expect(await auth.getAccessToken()).toBeNull();
    expect(f).toHaveBeenLastCalledWith(false, 'out');
    expect(storage.getItem('timikid-auth-v1')).toBeNull();
  });
  it('ghi nhớ email chờ duyệt', () => {
    const p = pendingStore(mem());
    expect(p.get()).toBe(''); p.set('b@x.vn'); expect(p.get()).toBe('b@x.vn'); p.set(''); expect(p.get()).toBe('');
  });
});
