import { describe, it, expect } from 'vitest';
import { calculate, percentFee, costPerOrder, breakEvenPrice, fmtVND, parseVND, fmtThousands } from '../src/calc.js';
import { CATEGORIES, PLATFORM_FEES, TAX } from '../src/fees.js';

const shopeeFees = PLATFORM_FEES.shopee.map((f) => ({ ...f })).concat({ ...TAX });

describe('percentFee', () => {
  it('rounds to integer VND', () => expect(percentFee(99999, 5.5)).toBe(5500));
  it('applies cap', () => expect(percentFee(2_000_000, 5.5, 50000)).toBe(50000));
  it('no cap when below', () => expect(percentFee(100000, 5.5, 50000)).toBe(5500));
  it('handles empty/negative', () => { expect(percentFee('', 6)).toBe(0); expect(percentFee(-5, 6)).toBe(0); });
});

describe('calculate', () => {
  it('empty input gives zeros, no NaN', () => {
    const r = calculate({});
    expect(r.payout).toBe(0); expect(r.profit).toBe(0); expect(r.margin).toBe(0); expect(r.roi).toBe(0);
    expect(Number.isNaN(r.profit)).toBe(false);
  });
  it('Shopee regular typical order', () => {
    const r = calculate({ price: 200000, cost: 100000, commissionRate: 14, fees: shopeeFees });
    // phí sàn: 14% 28000 + 6% 12000 + 3000 = 43000; thuế 1,5% 3000 tách riêng
    expect(r.platformFees).toBe(43000); expect(r.revenue).toBe(157000); expect(r.tax).toBe(3000);
    expect(r.payout).toBe(154000); expect(r.profit).toBe(54000);
    expect(r.margin).toBeCloseTo(27); expect(r.roi).toBeCloseTo(54);
  });
  it('price < cost -> loss', () => {
    const r = calculate({ price: 50000, cost: 80000, commissionRate: 14, fees: shopeeFees });
    expect(r.profit).toBeLessThan(0);
  });
  it('Voucher Xtra cap at 50.000đ on expensive item', () => {
    const fees = shopeeFees.map((f) => (f.id === 'voucherXtra' ? { ...f, on: true } : f));
    const r = calculate({ price: 2_000_000, commissionRate: 3.8, fees });
    expect(r.lines.find((l) => l.name.includes('Voucher Xtra')).amount).toBe(50000);
  });
  it('Mall fee higher than regular -> lower profit', () => {
    const cat = CATEGORIES.find((c) => c.id === 'thoitrang');
    const a = calculate({ price: 300000, cost: 100000, commissionRate: cat.shopee[0].rate, fees: shopeeFees });
    const b = calculate({ price: 300000, cost: 100000, commissionRate: cat.shopee[1].rate, fees: shopeeFees });
    expect(b.profit).toBeLessThan(a.profit);
  });
  it('break-even ROAS and monthly', () => {
    const r = calculate({ price: 100000, cost: 50000, fees: [], ads: { mode: 'vnd', value: 10000 }, ordersPerMonth: 100 });
    expect(r.profit).toBe(40000); expect(r.breakEvenRoas).toBeCloseTo(2); expect(r.monthlyProfit).toBe(4_000_000);
  });
  it('nhân sự & đóng gói (opex) + quảng cáo tách riêng', () => {
    const r = calculate({ price: 200000, cost: 100000, fees: [], opex: { mode: 'vnd', value: 5000 }, ads: { mode: 'percent', value: 10 } });
    expect(r.opex).toBe(5000); expect(r.ads).toBe(20000); expect(r.profit).toBe(75000);
  });
  it('opex theo tháng chia cho số đơn', () => {
    const r = calculate({ price: 200000, fees: [], opex: { mode: 'monthly', value: 3_000_000 }, ordersPerMonth: 300 });
    expect(r.opex).toBe(10000);
  });
});

describe('costPerOrder', () => {
  it('vnd', () => expect(costPerOrder({ mode: 'vnd', value: 5000 }, 100000, 0)).toBe(5000));
  it('percent', () => expect(costPerOrder({ mode: 'percent', value: 10 }, 150000, 0)).toBe(15000));
  it('monthly / orders', () => expect(costPerOrder({ mode: 'monthly', value: 9_000_000 }, 0, 300)).toBe(30000));
  it('monthly with 0 orders -> 0', () => expect(costPerOrder({ mode: 'monthly', value: 9_000_000 }, 0, 0)).toBe(0));
});

describe('breakEvenPrice', () => {
  it('profit at break-even ~ 0', () => {
    const inp = { cost: 100000, commissionRate: 14, fees: shopeeFees };
    const p = breakEvenPrice(inp);
    const r = calculate({ ...inp, price: p });
    expect(r.profit).toBeGreaterThanOrEqual(0); expect(r.profit).toBeLessThan(5);
    expect(calculate({ ...inp, price: p - 10 }).profit).toBeLessThan(0);
  });
  it('impossible when fees >= 100%', () => expect(breakEvenPrice({ cost: 1000, commissionRate: 100, fees: [] })).toBeNull());
});

describe('format', () => {
  it('vi-VN', () => expect(fmtVND(1234567)).toMatch(/^1\.234\.567\s₫$/));
  it('parse/format thousands', () => { expect(parseVND('1.234.567 ₫')).toBe(1234567); expect(fmtThousands('1234567')).toBe('1.234.567'); });
});
