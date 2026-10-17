import { describe, it, expect } from 'vitest';
import { choosePrice, priceRange, promoLabel } from '../src/productPrice.js';

const prod = { name: 'Tã Dayper', status: 'NORMAL', promotions: [{ type: 'Discount Promotions', id: 1, ongoing: true }, { type: 'Discount Promotions', id: 1, ongoing: true }, { type: 'Add-on Deal Main', id: 2, ongoing: true }] };
describe('Chọn giá bán (sau KM của shop)', () => {
  it('phân loại có KM: dùng giá sau KM, giữ giá gốc để hiển thị', () => {
    const c = choosePrice(prod, { price: 250000, originalPrice: 350000, stock: 5 });
    expect(c).toMatchObject({ price: 250000, original: 350000, promo: true, discountPct: 29, promoNames: ['Giảm giá của shop'] });
  });
  it('không KM: giá = giá gốc', () => {
    expect(choosePrice(prod, { price: 385000, originalPrice: 385000 })).toMatchObject({ price: 385000, promo: false, discountPct: 0, promoNames: [] });
  });
  it('hết hàng → cảnh báo', () => {
    const c = choosePrice(prod, { price: 250000, originalPrice: 350000, stock: 0 });
    expect(c.outOfStock).toBe(true); expect(c.warn.join()).toMatch(/hết hàng/i);
  });
  it('sản phẩm đang ẩn → cảnh báo', () => {
    expect(choosePrice({ price: 40700, originalPrice: 40700, status: 'UNLIST', statusText: 'Đang ẩn' }).warn.join()).toMatch(/đang ẩn/);
  });
  it('không có giá → cảnh báo', () => expect(choosePrice({}).warn.length).toBe(1));
  it('khoảng giá phân loại', () => expect(priceRange([{ price: 69000 }, { price: 185000 }, { price: null }])).toEqual({ min: 69000, max: 185000 }));
  it('nhãn KM tiếng Việt', () => { expect(promoLabel('Discount Promotions')).toBe('Giảm giá của shop'); expect(promoLabel('X')).toBe('X'); });
});
