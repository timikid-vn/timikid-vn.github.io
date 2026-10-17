// Trang admin: duyệt / thu hồi / xóa / đặt lại mật khẩu tài khoản timikid (dùng chung mọi app).
import { createAuth } from '../public/auth/timikid-auth.js';
const auth = createAuth({ url: import.meta.env?.VITE_AUTH_URL || undefined, app: 'admin' });
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const dt = (t) => (t ? new Date(t).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const ST = { pending: 'Chờ duyệt', approved: 'Đã duyệt', revoked: 'Đã thu hồi' };
let tab = 'pending', users = [], msg = '', err = false;
const say = (m, e = false) => { msg = m; err = e; };
const flash = () => { const h = msg ? `<div class="msg ${err ? 'err' : ''}">${esc(msg)}</div>` : ''; msg = ''; return h; };

async function render() {
  const app = $('app');
  $('who').textContent = auth.user ? auth.user.email : '';
  let cfg;
  try { cfg = await auth.config(); } catch (e) { app.innerHTML = `<div class="card"><div class="msg err">${esc(e.message)}</div></div>`; return; }
  if (!cfg.ready) { app.innerHTML = '<div class="card"><b>Máy chủ đăng nhập chưa cấu hình xong.</b></div>'; return; }
  const token = await auth.getAccessToken();
  if (!token || auth.user?.role !== 'admin') {
    app.innerHTML = `<div class="card">${flash()}${!cfg.adminLogin ? '<div class="msg err">Chưa đặt mật khẩu admin — đăng nhập admin đang tắt.</div>' : ''}
      ${auth.user && auth.user.role !== 'admin' ? `<p class="muted">Bạn đang đăng nhập ${esc(auth.user.email)} (không phải admin). <button class="link" id="out">Đăng xuất</button></p>` : ''}
      <form class="login" id="login"><label>Email admin<input type="email" id="em" autocomplete="username" required/></label>
      <label>Mật khẩu<input type="password" id="pw" autocomplete="current-password" required/></label><button class="btn">Đăng nhập</button></form></div>`;
    return;
  }
  try { users = await auth.admin.users(); } catch (e) { say(e.message, true); }
  const count = (s) => users.filter((u) => u.status === s).length;
  const list = users.filter((u) => (tab === 'all' ? true : u.status === tab));
  const tabs = [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['revoked', 'Thu hồi'], ['all', 'Tất cả']]
    .map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}${k === 'pending' && count('pending') ? `<i>${count('pending')}</i>` : ''}</button>`).join('');
  app.innerHTML = `${flash()}<div class="tabs">${tabs}</div><div class="card">${list.length ? list.map((u) => {
    const admin = u.role === 'admin', e = esc(u.email);
    const acts = admin ? '' : [
      u.status !== 'approved' && `<button class="ok" data-a="approve" data-e="${e}">Duyệt</button>`,
      u.status === 'approved' && `<button data-a="revoke" data-e="${e}">Thu hồi</button>`,
      `<button data-a="apps" data-e="${e}">App: ${esc((u.apps || ['*']).join(', ').replace('*', 'tất cả'))}</button>`,
      `<button data-a="reset" data-e="${e}">Đặt lại mật khẩu</button>`,
      `<button class="bad" data-a="remove" data-e="${e}">Xóa</button>`,
    ].filter(Boolean).join('');
    return `<div class="u"><div><b>${esc(u.name || u.email)}</b><small>${e} · tạo ${dt(u.createdAt)} · đăng nhập ${dt(u.lastLoginAt)}</small></div>
      <span class="badge ${admin ? 'b-admin' : 'b-' + u.status}">${admin ? 'Admin' : ST[u.status] || u.status}</span>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  }).join('') : '<p class="muted">Không có tài khoản nào.</p>'}</div>
  <p class="muted">Tài khoản mới tự đăng ký sẽ ở “Chờ duyệt” và không truy cập được app nào cho tới khi admin duyệt. <button class="link" id="out">Đăng xuất</button></p>`;
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.id === 'out') { await auth.logout(); return render(); }
  if (b.dataset.tab) { tab = b.dataset.tab; return render(); }
  const a = b.dataset.a, email = b.dataset.e; if (!a) return;
  try {
    if (a === 'remove' && !confirm(`Xóa hẳn tài khoản ${email}?`)) return;
    if (a === 'reset' && !confirm(`Đặt lại mật khẩu cho ${email}? Mật khẩu tạm sẽ hiện 1 lần.`)) return;
    if (a === 'apps') {
      const v = prompt('Các app được dùng (cách nhau dấu phẩy). Để trống = tất cả app.\nVí dụ: shop-connect', '');
      if (v === null) return;
      await auth.admin.act(email, 'set_apps', { apps: v.split(',').map((s) => s.trim()).filter(Boolean) });
      say('Đã cập nhật quyền app.');
    } else {
      const r = await auth.admin.act(email, a);
      say(a === 'reset' ? `Mật khẩu tạm của ${email}: ${r.tempPassword} — gửi riêng cho người dùng (chỉ hiện 1 lần).` : { approve: 'Đã duyệt ', revoke: 'Đã thu hồi ', remove: 'Đã xóa ' }[a] + email);
    }
  } catch (e) { say(e.message, true); }
  render();
});
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'login') return;
  ev.preventDefault();
  try {
    const u = await auth.login($('em').value, $('pw').value);
    if (u.role !== 'admin') say('Tài khoản này không phải admin.', true);
  } catch (e) { say(e.message, true); }
  render();
});
render();
