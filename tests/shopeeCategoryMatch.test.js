import { describe, it, expect } from 'vitest';
import { buildTree } from '../src/categoryTree.js';
import { matchShopeeCategory } from '../src/categoryMatch.js';

const T = (rows) => buildTree(rows.map(([p, rate]) => ({ path: p.split(' > '), rate })));
const reg = T([
  ['Mẹ & Bé > Tã & bô em bé > Tã dùng một lần', 4],
  ['Mẹ & Bé > Tã & bô em bé > Khác', 4],
  ['Mẹ & Bé > Chăm sóc sức khỏe bé > Chăm sóc mũi cho bé', 5],
  ['Mẹ & Bé > Chăm sóc sức khỏe bé > Khác', 5],
  ['Thời trang trẻ em > Quần áo bé gái > Váy', 8],
  ['Thời trang trẻ em > Quần áo bé gái > Khác', 8],
  ['Sắc Đẹp > Chăm sóc da mặt > Sữa rửa mặt', 9],
  ['Sắc Đẹp > Chăm sóc da mặt > Kem chống nắng', 7],
  ['Sắc Đẹp > Chăm sóc da mặt > Khác', 8],
]);
const mall = T([
  ['Mẹ & Bé > Tã & bô em bé > Tã dùng một lần', 6],
  ['Mẹ & Bé > Tã & bô em bé > Khác', 6],
]);

describe('Ghép ngành Shopee (category_id → biểu phí)', () => {
  it('khớp chính xác', () => {
    const r = matchShopeeCategory(reg, ['Mẹ & Bé', 'Tã & bô em bé', 'Tã dùng một lần']);
    expect(r).toMatchObject({ confidence: 'exact', path: ['Mẹ & Bé', 'Tã & bô em bé', 'Tã dùng một lần'] });
  });
  it('đường dẫn 4–5 cấp của Shopee → cắt về 3 cấp', () => {
    const r = matchShopeeCategory(reg, ['Mẹ & Bé', 'Tã & bô em bé', 'Tã dùng một lần', 'Tã dán']);
    expect(r).toMatchObject({ confidence: 'exact', path: ['Mẹ & Bé', 'Tã & bô em bé', 'Tã dùng một lần'] });
  });
  it('tên lá gần giống → high', () => {
    const r = matchShopeeCategory(reg, ['Mẹ & Bé', 'Chăm sóc sức khỏe bé', 'Chăm sóc mũi']);
    expect(r.confidence).toBe('high');
    expect(r.path.at(-1)).toBe('Chăm sóc mũi cho bé');
  });
  it('không có lá tương ứng nhưng cả nhánh cùng mức phí → "Khác" (same-fee)', () => {
    const r = matchShopeeCategory(reg, ['Thời trang trẻ em', 'Quần áo bé gái', 'Quần', 'Quần dài']);
    expect(r).toMatchObject({ confidence: 'same-fee', path: ['Thời trang trẻ em', 'Quần áo bé gái', 'Khác'] });
  });
  it('nhánh có nhiều mức phí mà không khớp lá → low + gợi ý', () => {
    const r = matchShopeeCategory(reg, ['Sắc Đẹp', 'Chăm sóc da mặt', 'Mặt nạ']);
    expect(r.confidence).toBe('low');
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions.every((p) => p[0] === 'Sắc Đẹp')).toBe(true);
  });
  it('Mall dùng bảng phí Mall', () => {
    const p = ['Mẹ & Bé', 'Tã & bô em bé', 'Tã dùng một lần'];
    expect(matchShopeeCategory(mall, p).confidence).toBe('exact');
    expect(matchShopeeCategory(reg, p).confidence).toBe('exact');
  });
  it('rỗng → null', () => expect(matchShopeeCategory(reg, []).confidence).toBeNull());
});
