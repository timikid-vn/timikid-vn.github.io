import { describe, it, expect } from 'vitest';
import { shopeeCategories } from '../src/shopeeCategories.js';
import { buildTree, leaves, walk, searchLeaves, pathOf } from '../src/categoryTree.js';
import { CATEGORIES } from '../src/fees.js';

const mk = (t) => buildTree(shopeeCategories(t).map((c) => ({ path: [c.l1, c.l2, c.l3].filter(Boolean), rate: c.rate, key: c.key })));
const reg = mk('regular'), mall = mk('mall');

describe('Cây ngành hàng', () => {
  it('số lá khớp 1.435 (thường) / 1.427 (Mall), lá nào cũng có phí', () => {
    expect(leaves(reg).length).toBe(1435);
    expect(leaves(mall).length).toBe(1427);
    for (const t of [reg, mall]) for (const l of leaves(t)) { expect(l.children.length).toBe(0); expect(l.leaf.rate).toBeGreaterThan(0); }
  });
  it('lá luôn ở cuối nhánh (không nút nào vừa là lá vừa có con)', () => {
    const all = (n) => [n, ...n.children.flatMap(all)];
    for (const t of [reg, mall]) expect(all(t).every((n) => !(n.leaf && n.children.length))).toBe(true);
  });
  it('Sữa bầu: thường 15%, Mall 18,1%', () => {
    const p = ['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Sữa bầu'];
    expect(walk(reg, p).nodes[2].leaf.rate).toBe(15);
    expect(walk(mall, p).nodes[2].leaf.rate).toBe(18.1);
  });
  it('ngành 2 cấp là lá ở cấp 2', () => {
    const w = walk(reg, ['Mô tô, xe máy', 'Mô tô, xe máy']);
    expect(w.complete).toBe(true); expect(w.nodes[1].leaf.rate).toBe(1.5);
  });
  it('đường dẫn chỉ có ở 1 loại shop → không đầy đủ ở loại kia (để reset)', () => {
    expect(walk(reg, ['Phụ tùng & Phụ kiện xe cơ giới', 'Xe máy']).complete).toBe(true);
    expect(walk(mall, ['Phụ tùng & Phụ kiện xe cơ giới', 'Xe máy']).complete).toBe(false);
  });
  it('độ sâu tùy ý & nút vừa lá vừa có con', () => {
    const t = buildTree([{ path: ['A', 'B', 'C', 'D'], rate: 1 }, { path: ['A', 'B'], rate: 2 }]);
    expect(leaves(t).map(pathOf)).toEqual([['A', 'B', 'C', 'D'], ['A', 'B', '(Chung)']]);
  });
  it('tìm kiếm không dấu nhảy thẳng tới lá', () => {
    const r = searchLeaves(reg, 'sua bau');
    expect(r[0].path).toEqual(['Mẹ & Bé', 'Chăm sóc sức khỏe mẹ', 'Sữa bầu']);
  });
  it('TikTok: cây 1 cấp', () => {
    const t = buildTree(CATEGORIES.map((c) => ({ path: [c.name], ...c.tiktok[0] })));
    expect(leaves(t).length).toBe(CATEGORIES.length);
  });
});
