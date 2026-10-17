import { describe, it, expect } from 'vitest';
import { SHOPEE_ROWS, shopeeCategories, findShopeeRate } from '../src/shopeeCategories.js';

const reg = SHOPEE_ROWS.filter((r) => r.regular != null);
const mall = SHOPEE_ROWS.filter((r) => r.mall != null);

describe('Shopee – số lượng ngành khớp PDF', () => {
  it('shop thường: 1.439 dòng (STT 1–1439), 1.435 ngành sau khi gộp trùng', () => {
    expect(reg.length).toBe(1439);
    expect(reg.map((r) => r.stt)).toEqual(Array.from({ length: 1439 }, (_, i) => i + 1));
    expect(shopeeCategories('regular').length).toBe(1435);
  });
  it('Mall: 1.315 dòng chung + 112 ngành phương tiện (duy nhất)', () => {
    expect(SHOPEE_ROWS.filter((r) => r.section === 'shared').length).toBe(1315);
    expect(shopeeCategories('mall').length).toBe(1427);
  });
  it('max/min', () => {
    const rr = reg.map((r) => r.regular), mr = mall.map((r) => r.mall);
    expect([Math.min(...rr), Math.max(...rr)]).toEqual([1.5, 17]);
    expect([Math.min(...mr), Math.max(...mr)]).toEqual([1.5, 20.8]);
  });
});

describe('Shopee – tra cứu ngành', () => {
  const cases = [
    ['regular', 'Máy tính & Laptop', 'Máy Tính Bàn', 'Máy Tính All in one', 2.5],
    ['mall', 'Máy tính & Laptop', 'Máy Tính Bàn', 'Máy Tính All in one', 3.8],
    ['mall', 'Thiết Bị Điện Gia Dụng', 'Đồ gia dụng nhà bếp', 'Tủ lạnh', 5.5],
    ['regular', 'Thực phẩm và đồ uống', 'Đồ chế biến sẵn', 'Mì ăn liền', 10],
    ['mall', 'Sắc Đẹp', 'Nước hoa', '', 20.8],
    ['regular', 'Mô tô, xe máy', 'Mô tô, xe máy', '', 1.5],
    ['regular', 'Nhà cửa & Đời sống', 'Chăn ga gối nệm', 'Nệm', 16],
    ['mall', 'Nhà cửa & Đời sống', 'Chăn ga gối nệm', 'Nệm', 14.5],
    ['mall', 'Sắc Đẹp', 'Dụng cụ làm đẹp', 'Dụng cụ tẩy lông', 16.5],
    ['regular', 'Phụ tùng & Phụ kiện xe cơ giới', 'Xe máy', '', 1.5],
    ['mall', 'Phụ tùng và Phụ kiện cho Phương tiện', 'Khác', '', 18.7],
    ['mall', 'Sách & Tạp Chí', 'Sách', 'Sách Giáo Dục', 13], // cập nhật 04/10/2026
    ['mall', 'Sách & Tạp Chí', 'Sách', 'Truyện Tranh', 12.5],
    ['regular', 'Sách & Tạp Chí', 'Sách', 'Truyện Tranh', 15],
    ['mall', 'Sách & Tạp Chí', 'Sách', 'Light Novels', 17],
  ];
  it.each(cases)('%s › %s › %s › %s = %s%%', (t, a, b, c, rate) => expect(findShopeeRate(t, a, b, c)).toBe(rate));
  it('ngành chỉ có ở 1 loại shop', () => {
    expect(findShopeeRate('mall', 'Phụ tùng & Phụ kiện xe cơ giới', 'Xe máy')).toBeUndefined();
    expect(findShopeeRate('regular', 'Phụ tùng và Phụ kiện cho Phương tiện', 'Khác')).toBeUndefined();
  });
  it('key duy nhất, tất cả đã xác minh', () => {
    for (const t of ['regular', 'mall']) {
      const l = shopeeCategories(t);
      expect(new Set(l.map((c) => c.key)).size).toBe(l.length);
      expect(l.every((c) => c.verified && c.rate > 0)).toBe(true);
    }
  });
});
