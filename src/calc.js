// Logic tính lãi lỗ — thuần, không phụ thuộc DOM.
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function percentFee(base, ratePct, cap = 0) {
  let f = Math.round(num(base) * num(ratePct) / 100);
  if (num(cap) > 0) f = Math.min(f, Math.round(num(cap)));
  return f;
}

// cost item: { mode: 'vnd'|'percent'|'monthly', value }
export function costPerOrder(item, price, ordersPerMonth) {
  if (!item) return 0;
  const v = num(item.value);
  if (item.mode === 'percent') return Math.round(num(price) * v / 100);
  if (item.mode === 'monthly') { const o = num(ordersPerMonth); return o > 0 ? Math.round(v / o) : 0; }
  return Math.round(v);
}

/**
 * input: { price, discount, cost, packaging, shipping, otherCost,
 *          commissionRate, fees:[{name,type,value,cap,on}], staff, ads, ordersPerMonth }
 */
export function calculate(input) {
  const price = num(input.price);
  const discount = Math.min(num(input.discount), price);
  const base = price - discount; // giá sau giảm của shop – cơ sở tính phí
  const lines = [];
  lines.push({ name: 'Phí cố định / hoa hồng ngành hàng', rate: num(input.commissionRate), amount: percentFee(base, input.commissionRate) });
  for (const f of input.fees || []) {
    if (!f.on) continue;
    const amount = f.type === 'percent' ? percentFee(base, f.value, f.cap) : (base > 0 ? Math.round(num(f.value)) : 0);
    lines.push({ name: f.name, rate: f.type === 'percent' ? num(f.value) : null, amount });
  }
  const platformFees = lines.reduce((s, l) => s + l.amount, 0);
  const payout = base - platformFees;

  const staff = costPerOrder(input.staff, base, input.ordersPerMonth);
  const ads = costPerOrder(input.ads, base, input.ordersPerMonth);
  const cost = Math.round(num(input.cost));
  const other = Math.round(num(input.packaging) + num(input.shipping) + num(input.otherCost));
  const totalCost = cost + other + staff + ads;
  const profit = payout - totalCost;
  const orders = num(input.ordersPerMonth);
  const profitBeforeAds = profit + ads;

  return {
    price, discount, base, lines, platformFees, payout,
    cost, other, staff, ads, totalCost, profit,
    margin: base > 0 ? (profit / base) * 100 : 0,
    roi: cost + other + staff + ads > 0 ? (profit / totalCost) * 100 : 0,
    feePct: base > 0 ? (platformFees / base) * 100 : 0,
    breakEvenRoas: profitBeforeAds > 0 ? base / profitBeforeAds : null,
    monthlyProfit: orders > 0 ? profit * orders : null,
    monthlyRevenue: orders > 0 ? base * orders : null,
    breakEvenPrice: breakEvenPrice(input),
  };
}

// Giá bán hòa vốn (giữ nguyên số tiền giảm giá), tìm bằng chia đôi — xử lý được phí có trần.
export function breakEvenPrice(input) {
  const profitAt = (p) => calculateProfitOnly({ ...input, price: p });
  let lo = num(input.discount), hi = Math.max(1e6, num(input.cost) * 4 + 1e6);
  let guard = 0;
  while (profitAt(hi) < 0 && guard++ < 40) hi *= 2;
  if (profitAt(hi) < 0) return null; // không thể hòa vốn (tổng % phí ≥ 100%)
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (profitAt(mid) >= 0) hi = mid; else lo = mid; }
  return Math.ceil(hi);
}

function calculateProfitOnly(input) {
  const price = num(input.price), discount = Math.min(num(input.discount), price), base = price - discount;
  let fees = percentFee(base, input.commissionRate);
  for (const f of input.fees || []) if (f.on) fees += f.type === 'percent' ? percentFee(base, f.value, f.cap) : (base > 0 ? Math.round(num(f.value)) : 0);
  return base - fees - Math.round(num(input.cost)) - Math.round(num(input.packaging) + num(input.shipping) + num(input.otherCost))
    - costPerOrder(input.staff, base, input.ordersPerMonth) - costPerOrder(input.ads, base, input.ordersPerMonth);
}

export const fmtVND = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('vi-VN') + ' ₫');
export const parseVND = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;
export const fmtThousands = (s) => { const n = parseVND(s); return n ? n.toLocaleString('vi-VN') : ''; };
