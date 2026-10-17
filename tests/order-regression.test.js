import { describe, it, expect } from 'vitest';
import { calculate } from '../src/calc.js';
import { PLATFORM_FEES, TAX } from '../src/fees.js';

// Đơn thật 261016RJHJSKYY (shop thường) — màn hình Shopee:
// Phí cố định 26.815; Hạ tầng 3.000; Voucher Xtra 9.515; Xử lý GD 10.380; NTTD 1.868;
// tổng 51.578; Doanh thu đơn hàng ước tính 121.422 (không có dòng thuế).
describe('Hồi quy: đơn Shopee 261016RJHJSKYY', () => {
  const fees = [...PLATFORM_FEES.shopee, TAX].map((f) => ({ ...f, on: f.id === 'piship' ? false : f.id === 'voucherXtra' ? true : f.on }));
  const r = calculate({ price: 173000, commissionRate: 15.5, fees });
  const amt = (re) => r.lines.find((l) => re.test(l.name)).amount;
  it('từng dòng phí làm tròn tới đồng như Shopee', () => {
    expect(amt(/cố định/)).toBe(26815);
    expect(amt(/hạ tầng/i)).toBe(3000);
    expect(amt(/Voucher Xtra/)).toBe(9515);
    expect(amt(/giao dịch/)).toBe(10380);
    expect(amt(/NTTD/)).toBe(1868); // 1.868,4 → 1.868
  });
  it('tổng phí 51.578, doanh thu ước tính 121.422', () => {
    expect(r.platformFees).toBe(51578);
    expect(r.revenue).toBe(121422);
  });
  it('thuế tách riêng, không trộn vào doanh thu sàn', () => {
    expect(r.tax).toBe(2595); // 1,5% × 173.000
    expect(r.payout).toBe(121422 - 2595);
    const noTax = calculate({ price: 173000, commissionRate: 15.5, fees: fees.map((f) => ({ ...f, on: f.isTax ? false : f.on })) });
    expect(noTax.payout).toBe(121422);
  });
});
