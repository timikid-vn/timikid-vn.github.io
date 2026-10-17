// timikid-auth client — dùng chung cho mọi app web của timikid-vn (cùng origin timikid-vn.github.io
// nên đăng nhập 1 lần là dùng được ở mọi app). Không phụ thuộc thư viện.
//
//   import { createAuth } from 'https://timikid-vn.github.io/auth/timikid-auth.js';
//   const auth = createAuth({ app: 'ten-app' });
//   await auth.login(email, password);              // hoặc auth.register(email, password, name)
//   const token = await auth.getAccessToken();       // gửi kèm: Authorization: Bearer <token>
//   auth.user  → { email, name, role, status, apps } | null
export const AUTH_URL = 'https://timikid-auth.timikid-vn.workers.dev';
const KEY = 'timikid-auth-v1';

export const MESSAGES = {
  pending: 'Tài khoản đang chờ admin duyệt.',
  revoked: 'Tài khoản đã bị thu hồi quyền truy cập.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  locked: 'Đăng nhập sai quá nhiều lần. Thử lại sau ít phút.',
  admin_login_disabled: 'Chưa đặt mật khẩu admin — đăng nhập admin đang tắt.',
  network: 'Không kết nối được máy chủ đăng nhập.',
};

export function createAuth({ url = AUTH_URL, app = '', storage = globalThis.localStorage, fetchFn = (...a) => fetch(...a) } = {}) {
  url = url.replace(/\/+$/, '');
  const listeners = new Set();
  let st = JSON.parse(storage?.getItem(KEY) || 'null') || {};
  const save = (n) => { st = n || {}; n ? storage?.setItem(KEY, JSON.stringify(st)) : storage?.removeItem(KEY); listeners.forEach((f) => f(st.user || null)); };
  async function req(path, { body, token, method } = {}) {
    let r;
    try {
      r = await fetchFn(url + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw Object.assign(new Error(MESSAGES.network), { code: 'network' }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.message || MESSAGES[j.error] || 'Lỗi ' + r.status), { code: j.error, status: r.status });
    return j;
  }
  const take = (j) => { save({ user: j.user, accessToken: j.accessToken, refreshToken: j.refreshToken, accessExp: Date.now() + (j.expiresIn - 30) * 1000 }); return j.user; };
  let refreshing = null;
  const api = {
    url, app,
    get user() { return st.user || null; },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    config: () => req('/config'),
    async register(email, password, name = '') { return (await req('/register', { body: { email, password, name } })).user; },
    async login(email, password) { return take(await req('/login', { body: { email, password } })); },
    async logout() { const rt = st.refreshToken; save(null); if (rt) await req('/logout', { body: { refreshToken: rt } }).catch(() => {}); },
    /** Token truy cập còn hạn (tự làm mới); null nếu chưa đăng nhập / hết phiên */
    async getAccessToken() {
      if (st.accessToken && st.accessExp > Date.now()) return st.accessToken;
      if (!st.refreshToken) return null;
      refreshing ||= req('/refresh', { body: { refreshToken: st.refreshToken } }).then(take, (e) => { save(null); throw e; }).finally(() => { refreshing = null; });
      try { await refreshing; return st.accessToken; } catch { return null; }
    },
    async fetch(input, init = {}) {
      const t = await api.getAccessToken();
      return fetchFn(input, { ...init, headers: { ...(init.headers || {}), ...(t ? { authorization: 'Bearer ' + t } : {}) } });
    },
    async changePassword(oldPassword, newPassword) { return take(await req('/password', { body: { oldPassword, newPassword }, token: await api.getAccessToken() })); },
    admin: {
      async users() { return (await req('/admin/users', { token: await api.getAccessToken() })).users; },
      async act(email, action, extra = {}) { return req('/admin/users/' + encodeURIComponent(email), { body: { action, ...extra }, token: await api.getAccessToken() }); },
    },
  };
  return api;
}
