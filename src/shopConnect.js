// Popup "Chọn shop": kết nối Shopee / TikTok Shop qua backend (Cloudflare Worker).
// Token của sàn không bao giờ tới trình duyệt — ở đây chỉ giữ phiên đăng nhập chủ shop.
const API = (import.meta.env?.VITE_SHOP_API || '').replace(/\/+$/, '');
import { createAuth } from '../public/auth/timikid-auth.js';
import { choosePrice, priceRange } from './productPrice.js';
import { createAccessGate, pendingStore } from './shopAccess.js';
const auth = createAuth({ url: import.meta.env?.VITE_AUTH_URL || undefined, app: 'shop-connect' });
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('vi-VN') + ' ₫');
const ICON = { shopee: '<svg viewBox="0 0 32 32" width="20" height="20"><rect width="32" height="32" rx="9" fill="#ee4d2d"/><path d="M7.5 12.5h17l-1.3 12a2 2 0 0 1-2 1.8H10.8a2 2 0 0 1-2-1.8z" fill="#fff"/></svg>', tiktok: '<svg viewBox="0 0 32 32" width="20" height="20"><rect width="32" height="32" rx="9" fill="#111"/><path d="M18 7v12.5a3.5 3.5 0 1 1-3-3.46V13a6.5 6.5 0 1 0 6 6.48V12.5a7 7 0 0 0 4 1.3V10.6A4 4 0 0 1 21 7z" fill="#fff"/></svg>' };
const PNAME = { shopee: 'Shopee', tiktok: 'TikTok Shop' };

export function initShopConnect({ apply, onAccess = () => {} }) {
  const dlg = document.getElementById('shopDialog');
  const body = document.getElementById('shopBody');
  let status = null, view = 'shops', curShop = null, products = [], next = null, msg = '', query = '', detail = null, loading = false, reqId = 0, io = null;
  let authTab = 'login', noAccess = false, gate = null, booted = false, submitting = false;
  const pending = pendingStore();
  function resetShop() { curShop = null; view = 'shops'; products = []; next = null; detail = null; query = ''; reqId++; loading = false; io?.disconnect(); }
  async function api(path, opt = {}) {
    const t = await auth.getAccessToken();
    if (!t) throw Object.assign(new Error('Cần đăng nhập'), { auth: true });
    const r = await fetch(API + path, { ...opt, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t, ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      // Token bị từ chối (hết hạn / bị thu hồi) → thoát phiên ngay, xóa shop/sản phẩm đã chọn
      msg = 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi — hãy đăng nhập lại.';
      submitting = true; await auth.logout(); submitting = false;
      throw Object.assign(new Error(msg), { auth: true });
    }
    if (!r.ok) throw new Error(j.message || j.error || 'Lỗi ' + r.status);
    return j;
  }
  const notReady = (extra = '') => `<div class="sc-empty"><b>Chưa cấu hình kết nối — đang chờ sàn duyệt app</b><p class="muted">Tính năng chọn shop sẽ hoạt động sau khi app Shopee / TikTok Shop được duyệt và máy chủ kết nối được cài đặt.${extra}</p><a class="link" href="https://github.com/timikid-vn/timikid-vn.github.io/blob/main/docs/ket-noi-san.md" target="_blank" rel="noopener">Xem hướng dẫn đăng ký ↗</a></div>`;
  const set = (h) => { body.innerHTML = (msg ? `<p class="sc-msg">${esc(msg)}</p>` : '') + h; msg = ''; };

  function loginForm() {
      const pend = pending.get();
      const reg = authTab === 'register';
      return `<div class="sc-tabs"><button type="button" data-tab="login" class="${reg ? '' : 'on'}">Đăng nhập</button><button type="button" data-tab="register" class="${reg ? 'on' : ''}">Đăng ký</button></div>
        <form id="scLogin" class="sc-login" data-mode="${reg ? 'register' : 'login'}">
          ${reg ? '<label>Tên<input id="scName" autocomplete="name" maxlength="80"/></label>' : ''}
          <label>Email<input type="email" id="scEmail" autocomplete="username" required/></label>
          <label>Mật khẩu<input type="password" id="scPass" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${reg ? 10 : 1}" required/></label>
          <button class="btn" type="submit">${reg ? 'Đăng ký' : 'Đăng nhập'}</button>
          ${pend ? `<p class="sc-msg warn">⏳ Tài khoản <b>${esc(pend)}</b> đang chờ admin duyệt — duyệt xong đăng nhập là dùng được.</p>` : ''}<p class="muted">${reg ? 'Mật khẩu ít nhất 10 ký tự. Tài khoản mới cần admin duyệt mới dùng được.' : 'Tài khoản timikid dùng chung cho mọi app của timikid-vn.'}</p></form>`;
  }
  async function render() {
    if (!API) return set(notReady());
    const st = gate.state();
    if (st === 'noapp') noAccess = true;
    // Chưa đăng nhập / chờ duyệt: chỉ hiện form đăng nhập — KHÔNG gọi máy chủ kết nối shop
    if (st !== 'ok' && st !== 'noapp') return set(loginForm());
    if (!(await auth.getAccessToken())) return set(loginForm()); // phiên hết hạn, làm mới thất bại
    if (noAccess) return set(`<div class="sc-empty"><b>Tài khoản chưa có quyền dùng app này</b><p class="muted">Nhờ admin cấp quyền “shop-connect” hoặc “tất cả app”.</p><button type="button" class="link" id="scLogout">Đăng xuất</button></div>`);
    try { status = status || (await fetch(API + '/api/status').then((r) => r.json())); } catch { return set(notReady('<br/>(Không liên lạc được máy chủ kết nối.)')); }
    if (!status.ready) return set(notReady());
    if (view === 'products') return renderProducts();
    set('<p class="muted">Đang tải danh sách shop…</p>');
    try {
      const { shops } = await api('/api/shops');
      const off = (p) => (p === 'tiktok' ? 'Tạm chưa hỗ trợ' : status[p] ? '' : 'chờ duyệt');
      const btn = (p) => `<button type="button" class="sc-connect" data-connect="${p}" ${off(p) ? `disabled title="${off(p)}"` : ''}>${ICON[p]}<span>Kết nối ${PNAME[p]}</span>${off(p) ? `<small>${off(p)}</small>` : ''}</button>`;
      set(`${shops.length ? `<div class="sc-list">${shops.map((s) => `<div class="sc-shop"><button type="button" class="sc-pick" data-shop="${esc(s.platform)}|${esc(s.id)}" ${s.platform === 'tiktok' ? 'disabled title="Tạm chưa hỗ trợ"' : ''}>${ICON[s.platform]}<span><b>${esc(s.name)}</b><small>${PNAME[s.platform]} · ${s.mall ? 'Mall' : 'Shop thường'}${s.platform === 'tiktok' ? ' · tạm chưa hỗ trợ' : ''}</small></span><i>›</i></button>
          <label class="sc-mall" title="Shop Mall?"><span class="switch"><input type="checkbox" data-mall="${esc(s.platform)}|${esc(s.id)}" ${s.mall ? 'checked' : ''}/><span></span></span>Mall</label>
          <button type="button" class="sc-x" data-disc="${esc(s.platform)}|${esc(s.id)}" title="Ngắt kết nối" aria-label="Ngắt kết nối">✕</button></div>`).join('')}</div>` : '<p class="muted">Chưa có shop nào được kết nối.</p>'}
        <div class="sc-actions">${btn('shopee')}${btn('tiktok')}</div>
        <p class="muted sc-foot">TikTok Shop: tạm chưa hỗ trợ kết nối — vẫn tính phí TikTok bình thường bằng tay. Bạn sẽ được chuyển sang trang ủy quyền chính thức của sàn. <button type="button" class="link" id="scLogout">Đăng xuất ${esc(auth.user?.email || '')}</button></p>`);
    } catch (e) { if (e.auth) return render(); set(`<p class="sc-msg err">${esc(e.message)}</p>`); }
  }

  // ---- Chọn sản phẩm (Shopee): tìm theo tên/SKU trên Shopee, tải dần khi cuộn
  const prodHead = () => `<div class="sc-head"><button type="button" class="link" id="scBack">‹ Shop</button><b>${esc(curShop.name)}</b><span class="badge ${curShop.mall ? 'mall' : ''}">${curShop.mall ? 'Mall' : 'Thường'}</span></div>
    <div class="sc-search"><input type="search" id="scFilter" placeholder="Tìm tên sản phẩm hoặc SKU…" autocomplete="off" value="${esc(query)}" enterkeyhint="search"/></div>`;
  async function renderProducts(append = false) {
    if (!append) { products = []; next = null; set(prodHead() + '<div class="sc-prods" id="scProds"><p class="muted sc-load">Đang tải sản phẩm…</p></div>'); }
    await loadMore();
  }
  async function loadMore() {
    if (loading) return;
    loading = true; const my = ++reqId;
    try {
      const qs = new URLSearchParams(); if (query) qs.set('q', query); if (next != null) qs.set('next', next);
      const j = await api(`/api/shops/${curShop.platform}/${curShop.id}/products?${qs}`);
      if (my !== reqId) return; // đã có tìm kiếm mới hơn
      products = products.concat(j.items || []); next = j.next ?? null;
      drawProducts();
    } catch (e) {
      if (e.auth) return render();
      const box = document.getElementById('scProds');
      if (box) box.innerHTML = errBox(e.message) + (products.length ? '' : '');
    } finally { if (my === reqId) loading = false; }
  }
  const errBox = (m) => `<div class="sc-msg err">${esc(m)}${/kết nối lại/i.test(m) ? ' <button type="button" class="link" data-connect="shopee">Kết nối lại</button>' : ''} <button type="button" class="link" id="scRetry">Thử lại</button></div>`;
  const priceHtml = (p) => {
    if (p.hasModel) return '<span class="sc-pv">Nhiều phân loại ›</span>';
    if (p.price == null) return '<span class="sc-pv muted">—</span>';
    return `<span class="sc-pv">${p.promo ? `<s>${fmt(p.originalPrice)}</s>` : ''}<b>${fmt(p.price)}</b></span>`;
  };
  function drawProducts() {
    const box = document.getElementById('scProds'); if (!box) return;
    box.innerHTML = (products.length ? products.map((p) => `<button type="button" class="sc-prod" data-prod="${esc(p.id)}">
        ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" width="44" height="44"/>` : '<span class="sc-noimg"></span>'}
        <span class="sc-pn"><span class="sc-name">${esc(p.name)}</span><small>${p.sku ? 'SKU ' + esc(p.sku) : ''}${p.statusText ? ` <em class="tag">${esc(p.statusText)}</em>` : ''}${p.stock === 0 ? ' <em class="tag warn">Hết hàng</em>' : ''}${p.promo ? ' <em class="tag ok">KM</em>' : ''}</small></span>
        ${priceHtml(p)}</button>`).join('') : `<p class="muted sc-load">${query ? 'Không tìm thấy sản phẩm khớp “' + esc(query) + '”.' : 'Shop chưa có sản phẩm.'}</p>`)
      + (next != null ? '<div id="scSentinel" class="sc-load muted">Đang tải thêm…</div>' : '');
    const sen = document.getElementById('scSentinel');
    io?.disconnect();
    if (sen && 'IntersectionObserver' in window) { io = new IntersectionObserver(([en]) => en.isIntersecting && loadMore(), { root: box, rootMargin: '200px' }); io.observe(sen); }
    else if (sen) sen.outerHTML = '<button type="button" class="link" id="scMore">Tải thêm…</button>';
  }
  function renderModels() {
    const p = detail, r = priceRange(p.models);
    set(`<div class="sc-head"><button type="button" class="link" id="scBackList">‹ Sản phẩm</button><b>Chọn phân loại</b></div>
      <div class="sc-pd">${p.image ? `<img src="${esc(p.image)}" alt="" width="56" height="56"/>` : ''}<div><b>${esc(p.name)}</b><small class="muted">${r ? (r.min === r.max ? fmt(r.min) : fmt(r.min) + ' – ' + fmt(r.max)) : ''} · ${p.models.length} phân loại${p.statusText ? ' · ' + esc(p.statusText) : ''}</small></div></div>
      <div class="sc-prods">${p.models.map((m) => `<button type="button" class="sc-prod sc-model" data-model="${esc(m.id)}" ${m.price == null ? 'disabled' : ''}>
        <span class="sc-pn"><span class="sc-name">${esc(m.name)}</span><small>${m.sku ? 'SKU ' + esc(m.sku) + ' · ' : ''}${m.stock === 0 ? '<em class="tag warn">Hết hàng</em>' : m.stock != null ? 'Còn ' + m.stock : ''}${m.promo ? ` <em class="tag ok">−${m.discountPct}%</em>` : ''}</small></span>
        <span class="sc-pv">${m.promo ? `<s>${fmt(m.originalPrice)}</s>` : ''}<b>${fmt(m.price)}</b></span></button>`).join('')}</div>`);
  }
  function choose(model) {
    const c = choosePrice(detail, model);
    const res = apply({ platform: curShop.platform, mall: !!curShop.mall, price: c.price, categoryPath: detail.categoryPath, productName: detail.name, modelName: model?.name || '', priceInfo: c });
    dlg.close();
    return res;
  }

  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close();
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'shopClose') return dlg.close();
    if (b.id === 'scLogout') { noAccess = false; await auth.logout(); return render(); }
    if (b.dataset.tab) { authTab = b.dataset.tab; return render(); }
    if (b.id === 'scBack') { view = 'shops'; return render(); }
    if (b.id === 'scMore') return loadMore();
    if (b.id === 'scRetry') return renderProducts();
    if (b.id === 'scBackList') { view = 'products'; set(prodHead() + '<div class="sc-prods" id="scProds"></div>'); return drawProducts(); }
    if (b.dataset.model) { const m = detail.models.find((x) => x.id === b.dataset.model); return choose(m); }
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
      view = 'products'; query = ''; return renderProducts();
    }
    if (b.dataset.prod) {
      b.classList.add('busy');
      try {
        const { product } = await api(`/api/shops/${curShop.platform}/${curShop.id}/products/${b.dataset.prod}`);
        detail = product;
        if (product.models?.length) { view = 'models'; return renderModels(); }
        choose(null);
      } catch (err) {
        if (err.auth) return render();
        b.classList.remove('busy');
        const box = document.getElementById('scProds'); box?.insertAdjacentHTML('afterbegin', errBox(err.message));
      }
    }
  });
  dlg.addEventListener('change', async (e) => {
    const k = e.target.dataset?.mall; if (!k) return;
    const [p, id] = k.split('|');
    await api(`/api/shops/${p}/${id}`, { method: 'PATCH', body: JSON.stringify({ mall: e.target.checked }) }).catch((err) => { msg = err.message; });
    render();
  });
  let deb = null;
  dlg.addEventListener('input', (e) => {
    if (e.target.id !== 'scFilter') return;
    clearTimeout(deb);
    deb = setTimeout(() => { query = e.target.value.trim(); reqId++; loading = false; products = []; next = null; const box = document.getElementById('scProds'); if (box) box.innerHTML = '<p class="muted sc-load">Đang tìm…</p>'; loadMore(); }, 350);
  });
  dlg.addEventListener('submit', async (e) => {
    if (e.target.id !== 'scLogin') return;
    e.preventDefault();
    const v = (id) => document.getElementById(id)?.value || '';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    submitting = true;
    try {
      if (e.target.dataset.mode === 'register') { await auth.register(v('scEmail'), v('scPass'), v('scName')); pending.set(v('scEmail').trim().toLowerCase()); msg = 'Đã đăng ký. Tài khoản đang chờ admin duyệt.'; authTab = 'login'; }
      else { noAccess = false; await auth.login(v('scEmail'), v('scPass')); pending.set(''); }
    } catch (err) {
      if (err.code === 'pending') { pending.set(v('scEmail').trim().toLowerCase()); msg = ''; } else msg = err.message;
      if (err.code === 'revoked') pending.set('');
    }
    submitting = false;
    render();
  });
  document.getElementById('shopOpen').addEventListener('click', () => { view = 'shops'; dlg.showModal(); render(); });

  // ---- Khóa "Chọn shop" khi chưa đăng nhập / chưa được duyệt
  const openBtn = document.getElementById('shopOpen');
  function syncLock(ok, st) {
    openBtn.classList.toggle('locked', !ok);
    const t = ok ? 'Chọn shop đã kết nối' : st === 'noapp' ? 'Tài khoản chưa có quyền chọn shop' : pending.get() ? 'Tài khoản đang chờ admin duyệt' : 'Đăng nhập để chọn shop & sản phẩm';
    openBtn.title = t; openBtn.setAttribute('aria-label', t);
  }
  gate = createAccessGate(auth, (ok, st) => {
    syncLock(ok, st);
    if (!ok) { resetShop(); status = null; }
    onAccess(ok);
    if (dlg.open && booted && !submitting) render();
  });
  booted = true;

  // Quay về từ trang ủy quyền của sàn: #ket-noi=ok_shopee | loi_...
  const m = location.hash.match(/ket-noi=([\w-]+)/);
  if (m) {
    msg = m[1].startsWith('ok_') ? `Đã kết nối ${PNAME[m[1].slice(3)] || ''} thành công.` : `Kết nối chưa thành công (${m[1]}). Thử lại nhé.`;
    history.replaceState(null, '', location.pathname + location.search);
    dlg.showModal(); render();
  }
}
