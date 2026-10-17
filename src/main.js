import './style.css';
import { CATEGORIES, PLATFORM_FEES, TAX, SOURCES } from './fees.js';
import { calculate, fmtVND, parseVND, fmtThousands } from './calc.js';
import { shopeeCategories } from './shopeeCategories.js';
import { tiktokCategories } from './tiktokCategories.js';
import { buildTree, walk, leaves, searchLeaves } from './categoryTree.js';

const KEY = 'spc-state-v8'; // v2: ngành Shopee đầy đủ từ PDF, bỏ Freeship Xtra
const $ = (id) => document.getElementById(id);
const defaultFees = () => ({ shopee: [...PLATFORM_FEES.shopee, TAX].map((f) => ({ ...f })), tiktok: [...PLATFORM_FEES.tiktok, TAX].map((f) => ({ ...f })) });
const blank = { platform: 'shopee', shopType: 0, catPath: null, rateOverride: {}, values: {}, opex: { mode: 'vnd', value: '' }, ads: { mode: 'percent', value: '' }, fees: defaultFees() };
let S;
try { S = { ...blank, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { S = { ...blank }; }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

// Cây ngành theo sàn + loại shop (Shopee: tới 3 cấp từ PDF; TikTok: 1 cấp)
const SP = { 0: shopeeCategories('regular'), 1: shopeeCategories('mall') };
const TT = { 0: tiktokCategories('regular'), 1: tiktokCategories('mall') };
const TREES = {};
function tree() {
  const k = `${S.platform}-${S.shopType}`;
  if (!TREES[k]) {
    TREES[k] = buildTree(S.platform === 'shopee'
      ? SP[S.shopType].map((c) => ({ path: [c.l1, c.l2, c.l3].filter(Boolean), rate: c.rate, verified: true, note: c.note, key: c.key }))
      : TT[S.shopType].map((c) => ({ path: [c.l1, c.l2, c.l3], rate: c.rate, verified: true, note: c.note, key: c.key })));
  }
  return TREES[k];
}
const DEFAULT_PATH = { shopee: ['Thời Trang Nữ', 'Áo', 'Áo sơ mi'], tiktok: ['Trang phục nữ & Đồ lót', 'Áo nữ', 'Áo cánh & Áo sơ mi'] };
const PICK = { mobileDepth: null };
// Đường dẫn đang chọn cho sàn hiện tại (chung cho thường/Mall — chuyển loại shop giữ nếu tồn tại)
const curPath = () => (S.catPath?.[S.platform] ?? DEFAULT_PATH[S.platform]);
function selection() {
  const { nodes, complete } = walk(tree(), curPath());
  const last = nodes[nodes.length - 1];
  return { nodes, leaf: complete && last?.leaf ? last.leaf : null };
}
function setPath(p) { S.catPath = { ...(S.catPath || {}), [S.platform]: p }; }
const cat = () => selection().leaf;
const catKey = () => `${S.platform}-${S.shopType}-${cat()?.key}`;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function renderPicker() {
  const { nodes, leaf } = selection();
  const q = $('catSearch').value.trim();
  const root = tree();
  $('catCount').textContent = $('catCount2').textContent = `(${leaves(root).length.toLocaleString("vi-VN")})`;
  if (q) {
    const res = searchLeaves(root, q);
    $('catCols').innerHTML = `<div class="cat-results">${res.length ? res.map((r) => `<button type="button" class="cat-res" data-path="${esc(JSON.stringify(r.path))}">${r.path.map(esc).join(' <span>›</span> ')}<b>${r.node.leaf.rate}%</b></button>`).join('') : '<p class="muted">Không tìm thấy ngành phù hợp.</p>'}</div>`;
    $('catCols').dataset.mode = 'search';
  } else {
    $('catCols').dataset.mode = 'cols';
    const cols = [root, ...nodes.filter((n) => !n.leaf)];
    const depth = cols.length - 1;
    const md = PICK.mobileDepth == null ? depth : Math.min(PICK.mobileDepth, depth);
    $('catCols').innerHTML = cols.map((col, i) => `<div class="cat-col ${i === md ? 'm-show' : ''}" data-depth="${i}">
      ${i > 0 ? `<button type="button" class="cat-back" data-back="${i - 1}">‹ ${esc(col.name)}</button>` : ''}
      ${col.children.map((c) => `<button type="button" class="cat-item ${nodes[i] === c ? 'on' : ''}" data-depth="${i}" data-name="${esc(c.name)}"><span>${esc(c.name)}</span>${c.leaf ? '' : '<i>›</i>'}</button>`).join('')}
    </div>`).join('');
    const sel = $('catCols').querySelectorAll('.cat-item.on'); sel.forEach((b) => b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
    const last = $('catCols').lastElementChild; if (last && window.innerWidth >= 640) $('catCols').scrollLeft = $('catCols').scrollWidth;
  }
  $('catCrumb').innerHTML = nodes.length ? `Đã chọn: <b>${nodes.map((n) => esc(n.name)).join(' &gt; ')}</b>` : 'Đã chọn: <span class="muted">chưa chọn</span>';
  $('catLabel').innerHTML = leaf ? nodes.map((n) => esc(n.name)).join(' <span>›</span> ') : 'Chọn ngành hàng';
  $('catOpen').classList.toggle('empty', !leaf);
  $('rateBox').hidden = !leaf; $('catBadge').hidden = !leaf; $('catHint').hidden = !!leaf;
  if (!leaf) $('catNote').textContent = 'Bấm để chọn ngành hàng tới cấp cuối cùng — phí cố định sẽ hiện ở đây.';
  if (!leaf) $('catHint').textContent = nodes.length ? `Chọn tiếp tới cấp cuối cùng của “${nodes[nodes.length - 1].name}” để xem phí cố định.` : 'Chọn ngành hàng tới cấp cuối cùng để xem phí cố định.';
}

const PN = () => (S.platform === 'shopee' ? 'Shopee' : 'TikTok');
function renderSeg(id, val) { $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v == val)); }

function renderStatic() {
  document.body.dataset.platform = S.platform;
  renderSeg('platform', S.platform); $('mallToggle').checked = S.shopType === 1;
  renderPicker();
  const d = cat();
  $('commissionRate').value = d ? (S.rateOverride[catKey()] ?? d.rate) : '';
  if (d) {
    $('catBadge').textContent = d.verified ? '✓ đã xác minh' : '⚠️ chưa xác minh';
    $('catBadge').className = 'badge ' + (d.verified ? 'ok' : 'warn');
    $('catNote').textContent = `Mặc định ${d.rate}%${d.note ? ' (' + d.note + ')' : ''}`;
  }
  renderFees();
}

const MODES = { vnd: '₫/đơn', percent: '% giá', monthly: '₫/tháng' };
function costBox(key, label) {
  const c = S[key], pct = c.mode === 'percent';
  return `<label>${label}<div class="suffix sel"><input data-costval="${key}" class="${pct ? '' : 'money'}" inputmode="${pct ? 'decimal' : 'numeric'}" value="${pct ? c.value : fmtThousands(c.value)}" placeholder="0"/>
    <select data-costmode="${key}" aria-label="Đơn vị">${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === c.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></div></label>`;
}
function renderCosts() {
  $('opexBox').innerHTML = costBox('opex', 'Nhân sự & đóng gói');
  $('adsBox').innerHTML = costBox('ads', 'Chi phí quảng cáo');
  const monthly = S.opex.mode === 'monthly' || S.ads.mode === 'monthly';
  $('ordersBox').classList.toggle('need', monthly);
  $('ordersHint').textContent = monthly ? 'Cần nhập để chia chi phí theo tháng cho mỗi đơn' : 'Để tính lãi/lỗ cả tháng (tùy chọn)';
}

function renderFees() {
  $('fees').innerHTML = S.fees[S.platform].map((f, i) => `
    <div class="fee ${f.on ? '' : 'off'}">
      <label class="switch"><input type="checkbox" data-fee="${i}" ${f.on ? 'checked' : ''}/><span></span></label>
      <div class="fname">${f.verified ? '' : '⚠️ '}${f.name}${f.cap ? `<small> (tối đa ${fmtVND(f.cap)})</small>` : ''}${f.note ? `<small class="muted" style="display:block;font-weight:400">${f.note}</small>` : ''}</div>
      <div class="suffix mini"><input data-feeval="${i}" inputmode="decimal" value="${f.type === 'fixed' ? fmtThousands(f.value) : f.value}"/><i>${f.type === 'fixed' ? '₫' : '%'}</i></div>
    </div>`).join('');
}

function readInputs() {
  const v = {}; for (const id of ['price', 'cost', 'ordersPerMonth']) v[id] = parseVND($(id).value);
  return v;
}

function update() {
  S.values = readInputs();
  const rate = cat() ? Number(String($('commissionRate').value).replace(',', '.')) || 0 : 0;
  const r = calculate({ ...S.values, commissionRate: rate, fees: S.fees[S.platform], opex: S.opex, ads: S.ads });
  save();
  const pos = r.profit >= 0;
  const pct = (n) => (Number.isFinite(n) ? n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%' : '—');
  $('result').innerHTML = `
    <div class="big ${pos ? 'pos' : 'neg'}"><span>${pos ? 'Lợi nhuận / đơn' : 'Lỗ / đơn'}</span><b>${fmtVND(r.profit)}</b></div>
    <div class="kpis">
      <div class="w2"><span>Doanh thu ${PN()} ước tính <em>(trước thuế)</em></span><b>${fmtVND(r.revenue)}</b></div>
      <div class="w2"><span>Thực nhận sau thuế</span><b>${fmtVND(r.payout)}</b><small>${r.tax ? 'thuế ' + fmtVND(r.tax) : 'không tính thuế'}</small></div>
      <div><span>Phí sàn</span><b>${fmtVND(r.platformFees)}</b><small>${pct(r.feePct)}</small></div>
      <div><span>Biên lợi nhuận</span><b class="${pos ? 'tpos' : 'tneg'}">${pct(r.margin)}</b></div>
      <div><span>ROI</span><b class="${pos ? 'tpos' : 'tneg'}">${pct(r.roi)}</b></div>
      <div><span>Giá hòa vốn</span><b>${r.price || r.cost ? fmtVND(r.breakEvenPrice) : '—'}</b></div>
      <div><span>ROAS hòa vốn</span><b>${r.breakEvenRoas ? r.breakEvenRoas.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '—'}</b></div>
      ${r.monthlyProfit != null ? `<div class="wide"><span>Lãi/lỗ mỗi tháng (${S.values.ordersPerMonth.toLocaleString('vi-VN')} đơn)</span><b class="${r.monthlyProfit >= 0 ? 'tpos' : 'tneg'}">${fmtVND(r.monthlyProfit)}</b><small>Doanh thu ${fmtVND(r.monthlyRevenue)}</small></div>` : ''}
    </div>`;
  $('mbar').innerHTML = `<span>${pos ? 'Lãi' : 'Lỗ'}/đơn</span><b class="${pos ? 'tpos' : 'tneg'}">${fmtVND(r.profit)}</b><small>Biên ${pct(r.margin)} · Thực nhận ${fmtVND(r.payout)}</small><i>⌄</i>`;
  const on = S.fees[S.platform].filter((f) => f.on && !f.isTax);
  const pctSum = on.filter((f) => f.type === 'percent').reduce((a, f) => a + Number(f.value || 0), 0);
  const fixSum = on.filter((f) => f.type === 'fixed').reduce((a, f) => a + Number(f.value || 0), 0);
  const taxF = S.fees[S.platform].find((f) => f.isTax && f.on);
  $('feeSummary').textContent = `${(rate + pctSum).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%${fixSum ? ' + ' + fixSum.toLocaleString('vi-VN') + '₫' : ''} · thuế ${taxF ? taxF.value + '%' : 'tắt'} · ${fmtVND(r.platformFees + r.tax)}`;
  const row = (n, a, cls = '', note = '') => `<tr class="${cls}"><td>${n}${note ? `<small> ${note}</small>` : ''}</td><td>${a}</td></tr>`;
  $('breakdown').innerHTML = row('Giá bán', fmtVND(r.price)) +
    r.lines.map((l) => row('− ' + l.name, fmtVND(-l.amount), 'fl', l.rate != null ? `(${l.rate}%)` : '')).join('') +
    row(`= Doanh thu ${PN()} ước tính`, fmtVND(r.revenue), 'sum', '(như màn hình sàn, trước thuế)') +
    r.taxLines.map((l) => row('− ' + l.name, fmtVND(-l.amount), 'fl', `(${l.rate}%)`)).join('') +
    (r.taxLines.length ? row('= Thực nhận sau thuế', fmtVND(r.payout), 'sum') : '') +
    row('− Giá vốn', fmtVND(-r.cost)) + row('− Nhân sự & đóng gói', fmtVND(-r.opex)) + row('− Quảng cáo', fmtVND(-r.ads)) +
    row(pos ? '= Lợi nhuận' : '= Lỗ', fmtVND(r.profit), 'sum ' + (pos ? 'tpos' : 'tneg'));
}

// ---- events
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const seg = b.parentElement;
  if (b.id === 'catOpen') { $('catDialog').showModal(); renderPicker(); setTimeout(() => window.innerWidth >= 640 && $('catSearch').focus(), 0); return; }
  if (b.id === 'catClose') { $('catDialog').close(); return; }
  if (b.classList.contains('cat-item')) {
    const d = Number(b.dataset.depth); setPath([...curPath().slice(0, d), b.dataset.name]);
    PICK.mobileDepth = null; renderStatic();
    if (cat()) $('catDialog').close();
  } else if (b.dataset.back != null) { PICK.mobileDepth = Number(b.dataset.back); renderPicker(); return; }
  else if (b.classList.contains('cat-res')) { setPath(JSON.parse(b.dataset.path)); $('catSearch').value = ''; PICK.mobileDepth = null; renderStatic(); $('catDialog').close(); }
  else if (seg.id === 'platform') { S.platform = b.dataset.v; PICK.mobileDepth = null; renderStatic(); }
  else if (b.id === 'mbar') { $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  else if (b.id === 'resetFees') { S.fees[S.platform] = defaultFees()[S.platform]; delete S.rateOverride[catKey()]; renderStatic(); }
  else return;
  update();
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList.contains('money')) {
    const fromEnd = t.value.length - t.selectionStart;
    t.value = fmtThousands(t.value);
    const p = Math.max(0, t.value.length - fromEnd); t.setSelectionRange(p, p);
  }
  if (t.id === 'catSearch') { renderPicker(); return; }
  if (t.id === 'commissionRate') S.rateOverride[catKey()] = t.value;
  if (t.dataset.costval) S[t.dataset.costval].value = t.classList.contains('money') ? parseVND(t.value) : t.value.replace(',', '.');
  if (t.dataset.fee) { S.fees[S.platform][t.dataset.fee].on = t.checked; t.closest('.fee').classList.toggle('off', !t.checked); }
  if (t.dataset.feeval) {
    const f = S.fees[S.platform][t.dataset.feeval];
    if (f.type === 'fixed') { t.value = fmtThousands(t.value); f.value = parseVND(t.value); } else f.value = Number(t.value.replace(',', '.')) || 0;
  }
  update();
});

// ---- init
for (const [id, val] of Object.entries(S.values || {})) if ($(id)) $(id).value = fmtThousands(val);
if (!S.values?.price) { $('price').value = '199.000'; $('cost').value = '90.000'; }
$('sources').innerHTML = Object.values(SOURCES).map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a> — hiệu lực ${s.effective}</li>`).join('');
$('catDialog').addEventListener('click', (e) => { if (e.target === $('catDialog')) $('catDialog').close(); });
document.addEventListener('change', (e) => {
  if (e.target.id === 'mallToggle') { S.shopType = e.target.checked ? 1 : 0; renderStatic(); update(); return; }
  const k = e.target.dataset?.costmode; if (!k) return;
  S[k] = { mode: e.target.value, value: '' }; renderCosts(); update();
});
renderStatic(); renderCosts(); update();
// Ẩn thanh lãi/lỗ dính đáy khi khối kết quả đã hiện trên màn hình
if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => $('mbar').classList.toggle('hide', e.isIntersecting), { threshold: 0.3 }).observe($('result'));
