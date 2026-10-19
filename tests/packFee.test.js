import { describe, it, expect } from 'vitest';
import { calculate, breakEvenPrice } from '../src/calc.js';
import { PLATFORM_FEES, TAX } from '../src/fees.js';
import { migrate, loadState, normCost, STATE_KEY } from '../src/state.js';

const fees = (p) => PLATFORM_FEES[p].map((f) => ({ ...f })).concat({ ...TAX });
const base = { price: 250000, cost: 120000, commissionRate: 15.5, opex: { mode: 'vnd', value: 3000 } };

describe('Phí đóng gói (pack)', () => {
  for (const p of ['shopee', 'tiktok']) {
    it(`${p}: trừ vào lợi nhuận, không trừ vào tiền sàn trả; tính vào ROI & giá hòa vốn`, () => {
      const a = calculate({ ...base, fees: fees(p) });
      const b = calculate({ ...base, fees: fees(p), pack: { mode: 'vnd', value: 5000 } });
      expect(b.pack).toBe(5000);
      expect(b.payout).toBe(a.payout); expect(b.revenue).toBe(a.revenue); expect(b.platformFees).toBe(a.platformFees);
      expect(a.profit - b.profit).toBe(5000);
      expect(b.totalCost).toBe(a.totalCost + 5000);
      expect(b.roi).toBeCloseTo((b.profit / (120000 + 3000 + 5000)) * 100, 6);
      expect(b.breakEvenPrice).toBeGreaterThan(a.breakEvenPrice);
      // tại giá hòa vốn, lợi nhuận ≈ 0 (≥ 0 và lệch < vài đồng)
      const at = calculate({ ...base, fees: fees(p), pack: { mode: 'vnd', value: 5000 }, price: b.breakEvenPrice });
      expect(at.profit).toBeGreaterThanOrEqual(0); expect(at.profit).toBeLessThan(5);
    });
  }
  it('rỗng / 0 → không ảnh hưởng', () => {
    const a = calculate({ ...base, fees: fees('shopee') });
    for (const v of ['', 0, '0', null, undefined]) expect(calculate({ ...base, fees: fees('shopee'), pack: { mode: 'vnd', value: v } }).profit).toBe(a.profit);
    expect(calculate({ ...base, fees: fees('shopee'), pack: undefined }).profit).toBe(a.profit);
  });
  it('% giá có số lẻ', () => {
    const r = calculate({ price: 250000, fees: [], pack: { mode: 'percent', value: '1.5' } });
    expect(r.pack).toBe(3750);
    expect(calculate({ price: 199999, fees: [], pack: { mode: 'percent', value: 0.75 } }).pack).toBe(1500);
  });
  it('₫/tháng chia theo số đơn', () => {
    expect(calculate({ price: 100000, fees: [], pack: { mode: 'monthly', value: 2_000_000 }, ordersPerMonth: 400 }).pack).toBe(5000);
    expect(calculate({ price: 100000, fees: [], pack: { mode: 'monthly', value: 2_000_000 } }).pack).toBe(0);
  });
  it('số âm bị bỏ qua', () => {
    expect(calculate({ price: 100000, fees: [], pack: { mode: 'vnd', value: -5000 } }).pack).toBe(0);
    expect(calculate({ price: 100000, fees: [], pack: { mode: 'percent', value: '-3' } }).pack).toBe(0);
  });
  it('số rất lớn vẫn tính được (không NaN/Infinity)', () => {
    const r = calculate({ price: 250000, cost: 0, fees: fees('shopee'), commissionRate: 10, pack: { mode: 'vnd', value: 999_999_999_999 } });
    expect(r.pack).toBe(999_999_999_999);
    expect(Number.isFinite(r.profit)).toBe(true); expect(r.profit).toBeLessThan(0);
    expect(Number.isFinite(r.roi)).toBe(true);
    const be = breakEvenPrice({ fees: fees('shopee'), commissionRate: 10, pack: { mode: 'vnd', value: 999_999_999_999 } });
    expect(be).toBeGreaterThan(999_999_999_999);
  });
});

const mem = (o = {}) => { const m = new Map(Object.entries(o)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const blank = { platform: 'shopee', shopType: 0, values: {}, opex: { mode: 'vnd', value: '' }, pack: { mode: 'vnd', value: '' }, ads: { mode: 'percent', value: '' }, fees: { x: 1 } };

describe('Di chuyển localStorage v9 → v10', () => {
  const v9 = { platform: 'tiktok', shopType: 1, catPath: ['A', 'B'], values: { price: 250000, cost: 120000, ordersPerMonth: 500 }, opex: { mode: 'monthly', value: 3000000 }, ads: { mode: 'percent', value: '7.5' }, fees: { y: 2 }, rateOverride: { k: '12' }, fromShop: { name: 'SP' } };
  it('giữ nguyên mọi số đã nhập; "Nhân sự & đóng gói" cũ → "Nhân sự" (giữ giá trị + đơn vị); Phí đóng gói = rỗng', () => {
    const s = loadState(mem({ 'spc-state-v9': JSON.stringify(v9) }), blank);
    expect(s).toMatchObject({ platform: 'tiktok', shopType: 1, catPath: ['A', 'B'], values: v9.values, fees: { y: 2 }, rateOverride: { k: '12' }, fromShop: { name: 'SP' }, v: 10 });
    expect(s.opex).toEqual({ mode: 'monthly', value: 3000000 });
    expect(s.ads).toEqual({ mode: 'percent', value: '7.5' });
    expect(s.pack).toEqual({ mode: 'vnd', value: '' });
  });
  it('không xóa bản v9; v10 có rồi thì dùng v10', () => {
    const st = mem({ 'spc-state-v9': JSON.stringify(v9), [STATE_KEY]: JSON.stringify({ ...v9, pack: { mode: 'percent', value: '2' } }) });
    expect(loadState(st, blank).pack).toEqual({ mode: 'percent', value: '2' });
    expect(st.m.has('spc-state-v9')).toBe(true);
  });
  it('trống / hỏng → mặc định, không lỗi', () => {
    expect(loadState(mem(), blank)).toMatchObject({ platform: 'shopee', pack: { mode: 'vnd', value: '' } });
    expect(loadState(mem({ [STATE_KEY]: '{hỏng' , 'spc-state-v9': 'null' }), blank).opex).toEqual({ mode: 'vnd', value: '' });
    expect(migrate({ opex: { mode: 'lạ', value: -5 }, pack: 'x' }, blank)).toMatchObject({ opex: { mode: 'vnd', value: '' }, pack: { mode: 'vnd', value: '' } });
  });
  it('normCost', () => {
    expect(normCost({ mode: 'percent', value: '1,5' }, blank.pack)).toEqual({ mode: 'percent', value: '1.5' });
    expect(normCost({ mode: 'vnd', value: 'abc' }, blank.pack)).toEqual({ mode: 'vnd', value: '' });
    expect(normCost(null, blank.ads)).toEqual({ mode: 'percent', value: '' });
  });
});
