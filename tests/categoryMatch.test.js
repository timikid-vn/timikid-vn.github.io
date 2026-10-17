import { describe, it, expect } from 'vitest';
import { buildTree } from '../src/categoryTree.js';
import { matchCategory } from '../src/categoryMatch.js';
import { shopeeCategories } from '../src/shopeeCategories.js';

const tree = buildTree(shopeeCategories('regular').map((c) => ({ path: [c.l1, c.l2, c.l3].filter(Boolean), rate: c.rate })));
describe('Ghép ngành từ API sàn', () => {
  it('trùng khớp chính xác', () => expect(matchCategory(tree, ['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Sữa bầu'])).toEqual(['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Sữa bầu']));
  it('khác dấu/hoa thường vẫn khớp theo tên lá + cha', () => expect(matchCategory(tree, ['me & be', 'Cham soc suc khoe me', 'SUA BAU'])).toEqual(['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Sữa bầu']));
  it('"Khác" mơ hồ → chọn đúng nhánh theo tên cha', () => expect(matchCategory(tree, ['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Khác'])).toEqual(['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Khác']));
  it('không có → null', () => expect(matchCategory(tree, ['Không tồn tại'])).toBeNull());
});
