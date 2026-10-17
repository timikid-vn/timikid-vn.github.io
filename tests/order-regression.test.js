import { describe, it, expect } from 'vitest';
import { calculate } from '../src/calc.js';
import { PLATFORM_FEES, TAX } from '../src/fees.js';

// Đơn thật 261016RJHJSKYY (shop thường), giá 173.000, phí cố định 15,5%.
// Màn hình Shopee: Phí cố định 26.815; Hạ tầng 3.000; Voucher Xtra 9.515; Xử lý GD 10.380;
// "Phí dịch vụ hiển thị NTTD" 1.868 → tổng 51.578, Doanh thu ước tính 121.422.
// App KHÔNG tính NTTD (Nạp Tiền Tự Động = tiền nạp vào TK quảng cáo của shop, vẫn là doanh thu của shop),
// nên Doanh thu Shopee ước tính của app = 121.422 + 1.868 = 123.290.
describe('Hồi quy: đơn Shopee 261016RJHJSKYY', () => {
  const fees = [...PLATFORM_FEES.shopee, TAX].map((f) => ({ ...f, on: f.id === 'voucherXtra' ? true : f.id === 'piship' ? false : f.on }));
  const r = calculate({ price: 173000, commissionRate: 15.5, fees });
  const amt = (re) => r.lines.find((l) => re.test(l.name)).amount;
  it('từng dòng phí làm tròn tới đồng như Shopee', () => {
    expect(amt(/cố định/)).toBe(26815);
    expect(amt(/hạ tầng/i)).toBe(3000);
    expect(amt(/Voucher Xtra/)).toBe(9515);
    expect(amt(/giao dịch/)).toBe(10380);
    expect(r.lines.some((l) => /NTTD/.test(l.name))).toBe(false);
  });
  it('tổng phí 49.710, doanh thu ước tính 123.290 (= 121.422 của Shopee + NTTD 1.868)', () => {
    expect(r.platformFees).toBe(49710);
    expect(r.revenue).toBe(123290);
    expect(r.revenue - 1868).toBe(121422);
  });
  it('thuế 1,5% tách riêng (mặc định BẬT): 2.595 → thực nhận 120.695', () => {
    expect(TAX.on).toBe(true);
    expect(r.tax).toBe(2595);
    expect(r.payout).toBe(120695);
  });
});
