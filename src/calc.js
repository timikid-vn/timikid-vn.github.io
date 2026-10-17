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
 * input: { price, cost, commissionRate, fees:[{name,type,value,cap,on,isTax}],
 *          opex (nhân sự & đóng gói), ads, ordersPerMonth }
 * opex/ads: { mode: 'vnd'|'percent'|'monthly', value }
 * Phí sàn tính trực tiếp trên giá bán; mỗi dòng làm tròn tới đồng như màn hình Shopee.
 */
function feeLines(price, input) {
  const lines = [], taxLines = [];
  lines.push({ name: 'Phí cố định / hoa hồng ngành hàng', rate: num(input.commissionRate), amount: percentFee(price, input.commissionRate) });
  for (const f of input.fees || []) {
    if (!f.on) continue;
    const amount = f.type === 'percent' ? percentFee(price, f.value, f.cap) : (price > 0 ? Math.round(num(f.value)) : 0);
    (f.isTax ? taxLines : lines).push({ name: f.name, rate: f.type === 'percent' ? num(f.value) : null, amount });
  }
  return { lines, taxLines };
}

export function calculate(input) {
  const price = num(input.price);
  const { lines, taxLines } = feeLines(price, input);
  const platformFees = lines.reduce((s, l) => s + l.amount, 0);
  const revenue = price - platformFees; // "Doanh thu đơn hàng ước tính" trên màn hình sàn (trước thuế)
  const tax = taxLines.reduce((s, l) => s + l.amount, 0);
  const payout = revenue - tax; // thực nhận sau thuế khấu trừ

  const opex = costPerOrder(input.opex, price, input.ordersPerMonth);
  const ads = costPerOrder(input.ads, price, input.ordersPerMonth);
  const cost = Math.round(num(input.cost));
  const totalCost = cost + opex + ads;
  const profit = payout - totalCost;
  const orders = num(input.ordersPerMonth);
  const profitBeforeAds = profit + ads;

  return {
    price, lines, platformFees, revenue, taxLines, tax, payout,
    cost, opex, ads, totalCost, profit,
    margin: price > 0 ? (profit / price) * 100 : 0,
    roi: totalCost > 0 ? (profit / totalCost) * 100 : 0,
    feePct: price > 0 ? (platformFees / price) * 100 : 0,
    breakEvenRoas: profitBeforeAds > 0 ? price / profitBeforeAds : null,
    monthlyProfit: orders > 0 ? profit * orders : null,
    monthlyRevenue: orders > 0 ? price * orders : null,
    breakEvenPrice: breakEvenPrice(input),
  };
}

// Giá bán hòa vốn (giữ nguyên số tiền giảm giá), tìm bằng chia đôi — xử lý được phí có trần.
export function breakEvenPrice(input) {
  const profitAt = (p) => profitOnly({ ...input, price: p });
  let lo = 0, hi = Math.max(1e6, num(input.cost) * 4 + 1e6), guard = 0;
  while (profitAt(hi) < 0 && guard++ < 40) hi *= 2;
  if (profitAt(hi) < 0) return null; // không thể hòa vốn (tổng % phí ≥ 100%)
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (profitAt(mid) >= 0) hi = mid; else lo = mid; }
  return Math.ceil(hi);
}

function profitOnly(input) {
  const price = num(input.price);
  const { lines, taxLines } = feeLines(price, input);
  const fees = [...lines, ...taxLines].reduce((s, l) => s + l.amount, 0);
  return price - fees - Math.round(num(input.cost)) - costPerOrder(input.opex, price, input.ordersPerMonth) - costPerOrder(input.ads, price, input.ordersPerMonth);
}

export const fmtVND = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('vi-VN') + ' ₫');
export const parseVND = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;
export const fmtThousands = (s) => { const n = parseVND(s); return n ? n.toLocaleString('vi-VN') : ''; };
