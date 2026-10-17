import { describe, it, expect } from 'vitest';
import { TIKTOK_ROWS, tiktokCategories } from '../src/tiktokCategories.js';
import { buildTree, leaves, walk } from '../src/categoryTree.js';
import { PLATFORM_FEES } from '../src/fees.js';
import { calculate } from '../src/calc.js';

const mk = (t) => buildTree(tiktokCategories(t).map((c) => ({ path: [c.l1, c.l2, c.l3], rate: c.rate, key: c.key })));
const reg = mk('regular'), mall = mk('mall');
const rate = (tree, p) => walk(tree, p).nodes[2]?.leaf?.rate;

describe('TikTok – biểu phí hoa hồng từ PDF', () => {
  it('2.040 dòng PDF → 2.039 ngành (1 dòng trùng "Chèo thuyền")', () => {
    expect(TIKTOK_ROWS.length).toBe(2040);
    expect(leaves(reg).length).toBe(2039);
    expect(leaves(mall).length).toBe(2039);
  });
  it('30 ngành cấp 1, 230 cấp 2; lá nào cũng có phí', () => {
    expect(reg.children.length).toBe(30);
    expect(reg.children.reduce((a, c) => a + c.children.length, 0)).toBe(230);
    for (const t of [reg, mall]) for (const l of leaves(t)) expect(l.leaf.rate).toBeGreaterThan(0);
  });
  it('min/max', () => {
    const r = TIKTOK_ROWS.map((x) => x.regular), m = TIKTOK_ROWS.map((x) => x.mall);
    expect([Math.min(...r), Math.max(...r)]).toEqual([1.5, 16]);
    expect([Math.min(...m), Math.max(...m)]).toEqual([1.5, 19.8]);
  });
  it.each([
    [['Máy tính & Thiết bị Văn phòng', 'Thiết bị ngoại vi & Phụ kiện', 'Bàn phím & Chuột'], 9.5, 13.7],
    [['Máy tính & Thiết bị Văn phòng', 'Máy tính để bàn, Máy tính xách tay & Máy tính bảng', 'Máy tính xách tay'], 2, 3.8],
    [['Thiết bị gia dụng', 'Đồ gia dụng lớn', 'Ti vi'], 7.5, 3.8],
    [['Đồ ăn & Đồ uống', 'Thực phẩm tươi & đông lạnh', 'Rau'], 8.5, 11.7],
    [['Chăm sóc sắc đẹp & Chăm sóc cá nhân', 'Trang điểm', 'Mascara'], 15.5, 18.8],
    [['Chăm sóc sắc đẹp & Chăm sóc cá nhân', 'Chăm sóc cá nhân đặc biệt', 'Tã người lớn'], 15.5, 19.8],
    [['Ô tô & xe máy', 'Xe máy', 'Xe máy điện'], 1.5, 1.5],
    [['Đồ nội thất', 'Nội thất trong nhà', 'Tủ'], 13.2, 14],
    [['Trẻ sơ sinh & thai sản', 'Vật tư cho mẹ', 'Quần áo cho bé bú'], 13.5, 16.1],
  ])('%j → thường %s%%, Mall %s%%', (p, r, m) => { expect(rate(reg, p)).toBe(r); expect(rate(mall, p)).toBe(m); });
  it('phí giao dịch 6% + xử lý đơn 3.000₫, làm tròn từng dòng', () => {
    const r = calculate({ price: 199999, commissionRate: 15.5, fees: PLATFORM_FEES.tiktok.map((f) => ({ ...f })) });
    expect(r.lines.map((l) => l.amount)).toEqual([31000, 12000, 3000]);
    expect(r.revenue).toBe(199999 - 46000);
  });
  it('Voucher Xtra (nếu bật) bị chặn trần 50.000₫', () => {
    const fees = PLATFORM_FEES.tiktok.map((f) => ({ ...f, on: f.id === 'xtraVoucher' }));
    expect(calculate({ price: 5_000_000, fees }).lines[1].amount).toBe(50000);
  });
});
