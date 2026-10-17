import './style.css';
import { CATEGORIES, PLATFORM_FEES, TAX, SOURCES } from './fees.js';
import { calculate, fmtVND, parseVND, fmtThousands } from './calc.js';
import { shopeeCategories, SHOPEE_FIXED_SOURCES } from './shopeeCategories.js';

const KEY = 'spc-state-v3'; // v2: ngành Shopee đầy đủ từ PDF, bỏ Freeship Xtra
const $ = (id) => document.getElementById(id);
const defaultFees = () => ({ shopee: [...PLATFORM_FEES.shopee, TAX].map((f) => ({ ...f })), tiktok: [...PLATFORM_FEES.tiktok, TAX].map((f) => ({ ...f })) });
const blank = { platform: 'shopee', shopType: 0, cats: {}, catSearch: '', rateOverride: {}, values: {}, staff: { mode: 'monthly', value: '' }, ads: { mode: 'percent', value: '' }, fees: defaultFees() };
let S;
try { S = { ...blank, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { S = { ...blank }; }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

// Danh sách ngành theo sàn + loại shop: [{key, group, name, rate, verified, note}]
const SP = { 0: shopeeCategories('regular'), 1: shopeeCategories('mall') };
const norm = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
function catList() {
  if (S.platform === 'shopee') return SP[S.shopType].map((c) => ({ key: c.key, group: c.l1, name: c.path, rate: c.rate, verified: true, note: c.note }));
  return CATEGORIES.map((c) => ({ key: c.id, group: 'TikTok Shop', name: c.name, ...c.tiktok[S.shopType] }));
}
const catSelKey = () => `${S.platform}-${S.shopType}`;
const cat = () => { const l = catList(); return l.find((c) => c.key === S.cats?.[catSelKey()]) || l.find((c) => c.key === DEFAULT_CAT[S.platform]) || l[0]; };
const DEFAULT_CAT = { shopee: 'Thời Trang Nữ|Áo|Áo sơ mi', tiktok: 'thoitrang' };
const catKey = () => `${S.platform}-${S.shopType}-${cat().key}`;
const defRate = () => cat();

const PN = () => (S.platform === 'shopee' ? 'Shopee' : 'TikTok');
function renderSeg(id, val) { $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v == val)); }

function renderStatic() {
  document.body.dataset.platform = S.platform;
  renderSeg('platform', S.platform); renderSeg('shopType', S.shopType);
  renderCatOptions();
  const d = defRate();
  $('commissionRate').value = S.rateOverride[catKey()] ?? d.rate;
  $('catBadge').textContent = d.verified ? '✓ đã xác minh' : '⚠️ chưa xác minh';
  $('catBadge').className = 'badge ' + (d.verified ? 'ok' : 'warn');
  $('catNote').textContent = `${d.group !== 'TikTok Shop' ? d.group + ' › ' : ''}${d.name} — mặc định ${d.rate}%${d.note ? ' (' + d.note + ')' : ''}`;
  renderFees();
}

function renderCatOptions() {
  const q = norm($('catSearch').value || '');
  const cur = cat();
  const list = catList().filter((c) => !q || norm(c.group + ' ' + c.name).includes(q) || c.key === cur.key);
  const groups = new Map();
  for (const c of list) { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  $('category').innerHTML = [...groups].map(([g, items]) => `<optgroup label="${esc(g)}">${items.map((c) => `<option value="${esc(c.key)}" ${c.key === cur.key ? 'selected' : ''}>${esc(c.name)} — ${c.rate}%</option>`).join('')}</optgroup>`).join('');
  $('catCount').textContent = q ? `${list.length} kết quả` : `${catList().length} ngành hàng`;
}

function costBox(key, label) {
  const c = S[key];
  const unit = c.mode === 'percent' ? '%' : '₫';
  return `<div class="costbox"><span class="lbl">${label}</span>
    <div class="seg small" data-cost="${key}">
      <button data-v="vnd" class="${c.mode === 'vnd' ? 'on' : ''}">₫ / đơn</button>
      <button data-v="percent" class="${c.mode === 'percent' ? 'on' : ''}">% giá bán</button>
      <button data-v="monthly" class="${c.mode === 'monthly' ? 'on' : ''}">Tổng / tháng</button></div>
    <div class="suffix"><input data-costval="${key}" class="${c.mode === 'percent' ? '' : 'money'}" inputmode="${c.mode === 'percent' ? 'decimal' : 'numeric'}" value="${c.mode === 'percent' ? c.value : fmtThousands(c.value)}" placeholder="0"/><i>${unit}</i></div>
    ${c.mode === 'monthly' ? '<small class="muted">Chia đều cho số đơn/tháng ở trên.</small>' : ''}</div>`;
}
function renderCosts() { $('staffBox').innerHTML = costBox('staff', '👥 Chi phí nhân sự'); $('adsBox').innerHTML = costBox('ads', '📣 Chi phí quảng cáo'); }

function renderFees() {
  $('fees').innerHTML = S.fees[S.platform].map((f, i) => `
    <div class="fee ${f.on ? '' : 'off'}">
      <label class="switch"><input type="checkbox" data-fee="${i}" ${f.on ? 'checked' : ''}/><span></span></label>
      <div class="fname">${f.verified ? '' : '⚠️ '}${f.name}${f.cap ? `<small> (tối đa ${fmtVND(f.cap)})</small>` : ''}${f.note ? `<small class="muted" style="display:block;font-weight:400">${f.note}</small>` : ''}</div>
      <div class="suffix mini"><input data-feeval="${i}" inputmode="decimal" value="${f.type === 'fixed' ? fmtThousands(f.value) : f.value}"/><i>${f.type === 'fixed' ? '₫' : '%'}</i></div>
    </div>`).join('');
}

function readInputs() {
  const v = {}; for (const id of ['price', 'cost', 'discount', 'packaging', 'shipping', 'otherCost', 'ordersPerMonth']) v[id] = parseVND($(id).value);
  return v;
}

function update() {
  S.values = readInputs();
  const rate = Number(String($('commissionRate').value).replace(',', '.')) || 0;
  const r = calculate({ ...S.values, commissionRate: rate, fees: S.fees[S.platform], staff: S.staff, ads: S.ads });
  save();
  const pos = r.profit >= 0;
  const pct = (n) => (Number.isFinite(n) ? n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%' : '—');
  $('result').innerHTML = `
    <div class="big ${pos ? 'pos' : 'neg'}"><span>${pos ? 'Lợi nhuận / đơn' : 'Lỗ / đơn'}</span><b>${fmtVND(r.profit)}</b></div>
    <div class="kpis">
      <div><span>Doanh thu ${PN()} ước tính</span><b>${fmtVND(r.revenue)}</b><small>so khớp màn hình sàn (trước thuế)</small></div>
      <div><span>Thực nhận sau thuế</span><b>${fmtVND(r.payout)}</b><small>${r.tax ? 'thuế khấu trừ ' + fmtVND(r.tax) : 'không tính thuế'}</small></div>
      <div><span>Tổng phí sàn</span><b>${fmtVND(r.platformFees)}</b><small>${pct(r.feePct)} giá bán</small></div>
      <div><span>Biên lợi nhuận</span><b class="${pos ? 'tpos' : 'tneg'}">${pct(r.margin)}</b></div>
      <div><span>ROI</span><b class="${pos ? 'tpos' : 'tneg'}">${pct(r.roi)}</b></div>
      <div><span>Giá bán hòa vốn</span><b>${r.price || r.cost ? fmtVND(r.breakEvenPrice) : '—'}</b></div>
      <div><span>ROAS hòa vốn</span><b>${r.breakEvenRoas ? r.breakEvenRoas.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '—'}</b></div>
      ${r.monthlyProfit != null ? `<div class="wide"><span>Lãi/lỗ dự kiến mỗi tháng (${S.values.ordersPerMonth.toLocaleString('vi-VN')} đơn)</span><b class="${r.monthlyProfit >= 0 ? 'tpos' : 'tneg'}">${fmtVND(r.monthlyProfit)}</b><small>Doanh thu ${fmtVND(r.monthlyRevenue)}</small></div>` : ''}
    </div>`;
  const row = (n, a, cls = '', note = '') => `<tr class="${cls}"><td>${n}${note ? `<small> ${note}</small>` : ''}</td><td>${a}</td></tr>`;
  $('breakdown').innerHTML = row('Giá bán', fmtVND(r.price)) +
    (r.discount ? row('− Giảm giá của shop', fmtVND(-r.discount)) : '') +
    r.lines.map((l) => row('− ' + l.name, fmtVND(-l.amount), 'fl', l.rate != null ? `(${l.rate}%)` : '')).join('') +
    row(`= Doanh thu ${PN()} ước tính`, fmtVND(r.revenue), 'sum', '(như màn hình sàn, trước thuế)') +
    r.taxLines.map((l) => row('− ' + l.name, fmtVND(-l.amount), 'fl', `(${l.rate}%)`)).join('') +
    (r.taxLines.length ? row('= Thực nhận sau thuế', fmtVND(r.payout), 'sum') : '') +
    row('− Giá vốn', fmtVND(-r.cost)) + row('− Đóng gói, ship, khác', fmtVND(-r.other)) +
    row('− Nhân sự', fmtVND(-r.staff)) + row('− Quảng cáo', fmtVND(-r.ads)) +
    row(pos ? '= Lợi nhuận' : '= Lỗ', fmtVND(r.profit), 'sum ' + (pos ? 'tpos' : 'tneg'));
}

// ---- events
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const seg = b.parentElement;
  if (seg.id === 'platform') { S.platform = b.dataset.v; renderStatic(); }
  else if (seg.id === 'shopType') { S.shopType = Number(b.dataset.v); renderStatic(); }
  else if (seg.dataset.cost) { S[seg.dataset.cost] = { mode: b.dataset.v, value: '' }; renderCosts(); }
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
  if (t.id === 'category') { S.cats = { ...S.cats, [catSelKey()]: t.value }; renderStatic(); }
  if (t.id === 'catSearch') { renderCatOptions(); return; }
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
if (!S.values?.price) { $('price').value = '199.000'; $('cost').value = '90.000'; $('packaging').value = '3.000'; }
$('sources').innerHTML = Object.values(SOURCES).map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a> — hiệu lực ${s.effective}</li>`).join('');
renderStatic(); renderCosts(); update();
