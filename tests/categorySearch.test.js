import { describe, it, expect } from 'vitest';
import { buildTree, leaves } from '../src/categoryTree.js';
import { searchCategories, highlight, foldChars } from '../src/categorySearch.js';
import { shopeeCategories } from '../src/shopeeCategories.js';

const mk = (t) => buildTree(shopeeCategories(t).map((c) => ({ path: [c.l1, c.l2, c.l3].filter(Boolean), rate: c.rate })));
const reg = mk('regular'), mall = mk('mall');
const top = (q, t = reg, n = 5) => searchCategories(t, q, n).map((r) => r.path.join(' > '));

describe('Tìm ngành thông minh', () => {
  it('bỏ dấu: "ta dung mot lan" = "Tã dùng một lần"', () => {
    expect(top('ta dung mot lan')[0]).toMatch(/Tã dùng một lần/);
    expect(top('tã dùng một lần')[0]).toBe(top('ta dung mot lan')[0]);
  });
  it('nhiều từ, thứ tự bất kỳ', () => {
    expect(top('lan mot dung ta')[0]).toMatch(/Tã dùng một lần/);
  });
  it('một phần chữ (tiền tố)', () => {
    expect(top('kem danh ra').some((p) => /Kem đánh răng/i.test(p))).toBe(true);
  });
  it('tìm theo cả đường dẫn cấp 1 > 2 > 3', () => {
    const r = searchCategories(reg, 'me be rang mieng', 10);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].path[0]).toBe('Mẹ & Bé');
    expect(r[0].path.join(' ')).toMatch(/răng miệng/i);
  });
  it('xếp hạng: khớp tên lá đứng trước khớp tên cấp cha', () => {
    const r = searchCategories(reg, 'sua bau', 10);
    expect(r[0].path.at(-1)).toBe('Sữa bầu');
  });
  it('đánh dấu đúng vị trí trên chữ có dấu', () => {
    const [r] = searchCategories(reg, 'sua bau', 1);
    const html = highlight(r.path.at(-1), r.hl.at(-1), (t) => t);
    expect(html).toBe('<mark>Sữa</mark> <mark>bầu</mark>');
  });
  it('không có kết quả → mảng rỗng; chuỗi rỗng → rỗng', () => {
    expect(searchCategories(reg, 'zzqqxx')).toEqual([]);
    expect(searchCategories(reg, '   ')).toEqual([]);
  });
  it('fold giữ nguyên độ dài (để đánh dấu đúng)', () => {
    for (const s of ['Đồ chơi & Sở thích', 'Tã/Bỉm', 'Ổ cứng']) expect(foldChars(s).length).toBe(s.length);
  });
  it('nhanh trên toàn bộ danh mục (Mall + thường)', () => {
    expect(leaves(reg).length + leaves(mall).length).toBeGreaterThan(1000);
    searchCategories(reg, 'a'); searchCategories(mall, 'a'); // tạo chỉ mục
    const t0 = performance.now();
    for (const q of ['ao', 'quan jean nam', 'dien thoai', 'do choi tre em', 'my pham trang diem', 'k']) { searchCategories(reg, q); searchCategories(mall, q); }
    expect((performance.now() - t0) / 12).toBeLessThan(15);
  });
});
