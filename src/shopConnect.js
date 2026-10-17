// Popup "Chọn shop": kết nối Shopee / TikTok Shop qua backend (Cloudflare Worker).
// Token của sàn không bao giờ tới trình duyệt — ở đây chỉ giữ phiên đăng nhập chủ shop.
const API = (import.meta.env?.VITE_SHOP_API || '').replace(/\/+$/, '');
import { createAuth } from '../public/auth/timikid-auth.js';
const auth = createAuth({ url: import.meta.env?.VITE_AUTH_URL || undefined, app: 'shop-connect' });
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('vi-VN') + ' ₫');
const ICON = { shopee: '<svg viewBox="0 0 32 32" width="20" height="20"><rect width="32" height="32" rx="9" fill="#ee4d2d"/><path d="M7.5 12.5h17l-1.3 12a2 2 0 0 1-2 1.8H10.8a2 2 0 0 1-2-1.8z" fill="#fff"/></svg>', tiktok: '<svg viewBox="0 0 32 32" width="20" height="20"><rect width="32" height="32" rx="9" fill="#111"/><path d="M18 7v12.5a3.5 3.5 0 1 1-3-3.46V13a6.5 6.5 0 1 0 6 6.48V12.5a7 7 0 0 0 4 1.3V10.6A4 4 0 0 1 21 7z" fill="#fff"/></svg>' };
const PNAME = { shopee: 'Shopee', tiktok: 'TikTok Shop' };

export function initShopConnect({ apply }) {
  const dlg = document.getElementById('shopDialog');
  const body = document.getElementById('shopBody');
  let status = null, view = 'shops', curShop = null, products = [], next = null, msg = '';
  let authTab = 'login', noAccess = false;
  async function api(path, opt = {}) {
    const t = await auth.getAccessToken();
    if (!t) throw Object.assign(new Error('Cần đăng nhập'), { auth: true });
    const r = await fetch(API + path, { ...opt, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t, ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { noAccess = true; throw Object.assign(new Error(j.message || 'Không có quyền'), { auth: true }); }
    if (!r.ok) throw new Error(j.message || j.error || 'Lỗi ' + r.status);
    return j;
  }
  const notReady = (extra = '') => `<div class="sc-empty"><b>Chưa cấu hình kết nối — đang chờ sàn duyệt app</b><p class="muted">Tính năng chọn shop sẽ hoạt động sau khi app Shopee / TikTok Shop được duyệt và máy chủ kết nối được cài đặt.${extra}</p><a class="link" href="https://github.com/timikid-vn/timikid-vn.github.io/blob/main/docs/ket-noi-san.md" target="_blank" rel="noopener">Xem hướng dẫn đăng ký ↗</a></div>`;
  const set = (h) => { body.innerHTML = (msg ? `<p class="sc-msg">${esc(msg)}</p>` : '') + h; msg = ''; };

  async function render() {
    if (!API) return set(notReady());
    try { status = status || (await fetch(API + '/api/status').then((r) => r.json())); } catch { return set(notReady('<br/>(Không liên lạc được máy chủ kết nối.)')); }
    if (!status.ready) return set(notReady());
    if (!auth.user || !(await auth.getAccessToken())) {
      const reg = authTab === 'register';
      return set(`<div class="sc-tabs"><button type="button" data-tab="login" class="${reg ? '' : 'on'}">Đăng nhập</button><button type="button" data-tab="register" class="${reg ? 'on' : ''}">Đăng ký</button></div>
        <form id="scLogin" class="sc-login" data-mode="${reg ? 'register' : 'login'}">
          ${reg ? '<label>Tên<input id="scName" autocomplete="name" maxlength="80"/></label>' : ''}
          <label>Email<input type="email" id="scEmail" autocomplete="username" required/></label>
          <label>Mật khẩu<input type="password" id="scPass" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${reg ? 10 : 1}" required/></label>
          <button class="btn" type="submit">${reg ? 'Đăng ký' : 'Đăng nhập'}</button>
          <p class="muted">${reg ? 'Mật khẩu ít nhất 10 ký tự. Tài khoản mới cần admin duyệt mới dùng được.' : 'Tài khoản timikid dùng chung cho mọi app của timikid-vn.'}</p></form>`);
    }
    if (noAccess) return set(`<div class="sc-empty"><b>Tài khoản chưa có quyền dùng app này</b><p class="muted">Nhờ admin cấp quyền “shop-connect” hoặc “tất cả app”.</p><button type="button" class="link" id="scLogout">Đăng xuất</button></div>`);
    if (view === 'products') return renderProducts();
    set('<p class="muted">Đang tải danh sách shop…</p>');
    try {
      const { shops } = await api('/api/shops');
      const btn = (p) => `<button type="button" class="sc-connect" data-connect="${p}" ${status[p] ? '' : 'disabled title="Chờ sàn duyệt app"'}>${ICON[p]}<span>Kết nối ${PNAME[p]}</span>${status[p] ? '' : '<small>chờ duyệt</small>'}</button>`;
      set(`${shops.length ? `<div class="sc-list">${shops.map((s) => `<div class="sc-shop"><button type="button" class="sc-pick" data-shop="${esc(s.platform)}|${esc(s.id)}">${ICON[s.platform]}<span><b>${esc(s.name)}</b><small>${PNAME[s.platform]} · ${s.mall ? 'Mall' : 'Shop thường'}</small></span><i>›</i></button>
          <label class="sc-mall" title="Shop Mall?"><span class="switch"><input type="checkbox" data-mall="${esc(s.platform)}|${esc(s.id)}" ${s.mall ? 'checked' : ''}/><span></span></span>Mall</label>
          <button type="button" class="sc-x" data-disc="${esc(s.platform)}|${esc(s.id)}" title="Ngắt kết nối" aria-label="Ngắt kết nối">✕</button></div>`).join('')}</div>` : '<p class="muted">Chưa có shop nào được kết nối.</p>'}
        <div class="sc-actions">${btn('shopee')}${btn('tiktok')}</div>
        <p class="muted sc-foot">Bạn sẽ được chuyển sang trang ủy quyền chính thức của sàn. <button type="button" class="link" id="scLogout">Đăng xuất ${esc(auth.user?.email || '')}</button></p>`);
    } catch (e) { if (e.auth) return render(); set(`<p class="sc-msg err">${esc(e.message)}</p>`); }
  }

  async function renderProducts(append = false) {
    const head = `<div class="sc-head"><button type="button" class="link" id="scBack">‹ Shop</button><b>${esc(curShop.name)}</b></div><input type="search" id="scFilter" placeholder="🔍 Lọc sản phẩm theo tên..." autocomplete="off"/>`;
    if (!append) { products = []; next = null; set(head + '<p class="muted">Đang tải sản phẩm…</p>'); }
    try {
      const j = await api(`/api/shops/${curShop.platform}/${curShop.id}/products${next != null ? '?next=' + encodeURIComponent(next) : ''}`);
      products = products.concat(j.items || []); next = j.next;
      set(head + '<div class="sc-prods" id="scProds"></div>' + (next != null ? '<button type="button" class="link" id="scMore">Tải thêm…</button>' : ''));
      drawProducts();
    } catch (e) { if (e.auth) return render(); set(head + `<p class="sc-msg err">${esc(e.message)}</p>`); }
  }
  function drawProducts() {
    const q = (document.getElementById('scFilter')?.value || '').toLowerCase();
    const list = products.filter((p) => !q || p.name.toLowerCase().includes(q));
    document.getElementById('scProds').innerHTML = list.length ? list.map((p) => `<button type="button" class="sc-prod" data-prod="${esc(p.id)}"><span>${esc(p.name)}</span><b>${p.price != null ? fmt(p.price) : 'nhiều giá'}</b></button>`).join('') : '<p class="muted">Không có sản phẩm.</p>';
  }

  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close();
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'shopClose') return dlg.close();
    if (b.id === 'scLogout') { await auth.logout(); noAccess = false; return render(); }
    if (b.dataset.tab) { authTab = b.dataset.tab; return render(); }
    if (b.id === 'scBack') { view = 'shops'; return render(); }
    if (b.id === 'scMore') return renderProducts(true);
    if (b.dataset.connect) {
      try { const { url } = await api(`/api/oauth/${b.dataset.connect}/url`, { method: 'POST' }); location.href = url; } catch (err) { msg = err.message; render(); }
    }
    if (b.dataset.disc) {
      const [p, id] = b.dataset.disc.split('|');
      if (!confirm('Ngắt kết nối shop này? App sẽ xóa token đã lưu.')) return;
      await api(`/api/shops/${p}/${id}`, { method: 'DELETE' }).catch((err) => { msg = err.message; });
      return render();
    }
    if (b.dataset.shop) {
      const [platform, id] = b.dataset.shop.split('|');
      const { shops } = await api('/api/shops');
      curShop = shops.find((s) => s.platform === platform && s.id === id);
      apply({ platform, mall: !!curShop.mall });
      view = 'products'; return renderProducts();
    }
    if (b.dataset.prod) {
      b.disabled = true;
      try {
        const { product } = await api(`/api/shops/${curShop.platform}/${curShop.id}/products/${b.dataset.prod}`);
        const res = apply({ platform: curShop.platform, mall: !!curShop.mall, price: product.price, categoryPath: product.categoryPath, productName: product.name });
        if (res?.matched === false) { msg = `Đã điền giá. Không tìm thấy ngành “${(product.categoryPath || []).join(' › ')}” trong biểu phí — hãy chọn ngành thủ công.`; b.disabled = false; return renderProducts(); }
        dlg.close();
      } catch (err) { msg = err.message; renderProducts(); }
    }
  });
  dlg.addEventListener('change', async (e) => {
    const k = e.target.dataset?.mall; if (!k) return;
    const [p, id] = k.split('|');
    await api(`/api/shops/${p}/${id}`, { method: 'PATCH', body: JSON.stringify({ mall: e.target.checked }) }).catch((err) => { msg = err.message; });
    render();
  });
  dlg.addEventListener('input', (e) => { if (e.target.id === 'scFilter') drawProducts(); });
  dlg.addEventListener('submit', async (e) => {
    if (e.target.id !== 'scLogin') return;
    e.preventDefault();
    const v = (id) => document.getElementById(id)?.value || '';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (e.target.dataset.mode === 'register') { await auth.register(v('scEmail'), v('scPass'), v('scName')); msg = 'Đã đăng ký. Tài khoản đang chờ admin duyệt.'; authTab = 'login'; }
      else { await auth.login(v('scEmail'), v('scPass')); noAccess = false; }
    } catch (err) { msg = err.message; }
    render();
  });
  document.getElementById('shopOpen').addEventListener('click', () => { view = 'shops'; dlg.showModal(); render(); });

  // Quay về từ trang ủy quyền của sàn: #ket-noi=ok_shopee | loi_...
  const m = location.hash.match(/ket-noi=([\w-]+)/);
  if (m) {
    msg = m[1].startsWith('ok_') ? `Đã kết nối ${PNAME[m[1].slice(3)] || ''} thành công.` : `Kết nối chưa thành công (${m[1]}). Thử lại nhé.`;
    history.replaceState(null, '', location.pathname + location.search);
    dlg.showModal(); render();
  }
}
