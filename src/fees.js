// ======================================================================
// BIỂU PHÍ MẶC ĐỊNH — cập nhật tại đây. Tất cả % đã gồm VAT 8%.
// verified: true  = đối chiếu được với nguồn (xem SOURCES)
// verified: false = ước tính / chưa xác minh — người dùng nên kiểm tra & sửa
// Dữ liệu tra cứu ngày 17/10/2026.
// ======================================================================

export const SOURCES = {
  shopeeFees: { title: 'Shopee – Thuế GTGT trên các loại phí (05/2026–12/2026)', url: 'https://banhang.shopee.vn/edu/article/25329', effective: '23/05/2026 (shop thường), 29/05/2026 (Mall)' },
  shopeeRegularFixedPdf: { title: 'Shopee – Bảng Phí cố định Người bán thường (PDF chính thức, 1.439 ngành, đã gồm VAT 8%) – 1.435 ngành sau khi gộp 4 dòng trùng', url: 'https://banhang.shopee.vn/edu/article/25329', effective: '23/05/2026' },
  shopeeMallFixedPdf: { title: 'Shopee Mall – Phí Cố Định từ 29.05.2026 (PDF chính thức, 1.656 dòng, đã gồm VAT 8%) – 1.427 ngành sau khi gộp các dòng trùng', url: 'https://banhang.shopee.vn/edu/article/2579', effective: '29/05/2026' },
  shopeeNttd: { title: 'Shopee Ads – Tính năng Nạp Tiền Tự Động từ doanh thu đơn hàng (1–50%, tùy chọn)', url: 'https://ads.shopee.vn/learn/faq/396/2188', effective: 'triển khai từ 04/02/2026' },
  shopeeNttdProgram: { title: 'Shopee – Chương trình ưu đãi Phí xử lý giao dịch cho người bán bật Nạp Tiền Tự Động DVHT', url: 'https://banhang.shopee.vn/edu/article/28087', effective: '2026' },
  shopeeTax: { title: 'Shopee – Khấu trừ & nộp thuế thay Người bán (xem mục "Thuế" ở Thông tin thanh toán của đơn)', url: 'https://banhang.shopee.vn/edu/article/24233', effective: '01/07/2025' },
  shopeeMallBooks: { title: 'Shopee Mall – Cập nhật phí cố định Sách (Giáo Dục 13%; Ngoại Ngữ, Thiếu Nhi, Hướng Nghiệp, Truyện Tranh 12,5%)', url: 'https://banhang.shopee.vn/edu/article/28220', effective: '04/10/2026' },
  shopeeGhn: { title: 'GHN – Tổng hợp phí Shopee 2026 (nguồn thứ cấp)', url: 'https://ghn.vn/blogs/tip-ban-hang/tong-hop-cac-loai-phi-ban-hang-tren-shopee-moi-nhat', effective: '2026' },
  tiktokFees: { title: 'TikTok Shop Academy – Introduction to Seller Fees', url: 'https://seller-vn.tiktok.com/university/essay?knowledge_id=8858869405370113', effective: 'Phí giao dịch 09/05/2026; hoa hồng shop thường 03/07/2026, Mall 03/08/2026' },
  tiktokMallNews: { title: 'BigSeller – Bảng hoa hồng TikTok Mall từ 03/08/2026 (nguồn thứ cấp)', url: 'https://www.bigseller.com/blog/articleDetails/4736/tiktok-shop-tang-phi-hoa-hong-ban-hang-viet-nam.htm', effective: '03/08/2026' },
  tax: { title: 'Thuế khấu trừ hộ/cá nhân kinh doanh TMĐT (NĐ 117/2025): 1% GTGT + 0,5% TNCN', url: 'https://thuvienphapluat.vn', effective: '01/07/2025' },
};

// Phí hoa hồng/phí cố định theo ngành: [shop thường, Mall]
// mỗi giá trị: { rate (%), verified, note }
const r = (rate, verified, note = '') => ({ rate, verified, note });

export const CATEGORIES = [
  { id: 'thoitrang', name: 'Thời trang nam/nữ',
    shopee: [r(14.0, false, 'Ước tính; shop thường 1,5–18%'), r(16.1, true, 'Shopee Mall PDF 08/05/2026')],
    tiktok: [r(14.0, false, 'Theo mức mặc định'), r(16.6, false, 'Bảng Mall 16,1–17,1% – lấy trung bình')] },
  { id: 'lamdep', name: 'Mỹ phẩm & Làm đẹp',
    shopee: [r(14.0, false), r(15.5, false)],
    tiktok: [r(14.0, false), r(17.0, false, 'Mall tối đa 19,8%')] },
  { id: 'dienthoai', name: 'Điện thoại & Máy tính bảng',
    shopee: [r(3.5, false), r(3.8, false, 'GHN: 2,5–3,8%')],
    tiktok: [r(6.0, false), r(7.0, false)] },
  { id: 'laptop', name: 'Máy tính & Laptop',
    shopee: [r(3.5, false), r(3.8, false, 'GHN: laptop 3,8%')],
    tiktok: [r(10.0, false), r(12.5, false, 'BigSeller: Máy tính & TB văn phòng 12,5%')] },
  { id: 'amthanh', name: 'Thiết bị âm thanh (tai nghe, loa)',
    shopee: [r(12.0, false), r(14.7, true, 'Shopee Mall PDF 08/05/2026: tai nghe')],
    tiktok: [r(14.0, false), r(16.0, false, 'Mặc định Mall')] },
  { id: 'mebe', name: 'Mẹ & Bé',
    shopee: [r(12.0, false), r(14.0, false)],
    tiktok: [r(14.0, false), r(15.0, false, 'Mall 10,5–17,1%')] },
  { id: 'dochoi', name: 'Đồ chơi & Sở thích',
    shopee: [r(13.0, false), r(15.0, false)],
    tiktok: [r(14.0, false), r(16.6, false, 'Mall 16,1–17,1%')] },
  { id: 'nhacua', name: 'Nhà cửa & Đời sống',
    shopee: [r(12.0, false), r(14.5, false)],
    tiktok: [r(14.0, false), r(16.4, false, 'Mall 15,7–17,1%')] },
  { id: 'vali', name: 'Vali & Túi du lịch',
    shopee: [r(13.0, false), r(15.0, true, 'Shopee Mall PDF 08/05/2026')],
    tiktok: [r(14.0, false), r(16.0, false, 'Mặc định Mall')] },
  { id: 'sach', name: 'Sách (Giáo dục)',
    shopee: [r(12.0, false), r(13.0, true, 'Shopee Mall từ 04/10/2026')],
    tiktok: [r(14.0, false), r(16.0, false, 'Mặc định Mall')] },
  { id: 'voucher', name: 'Voucher & Dịch vụ',
    shopee: [r(10.0, false), r(12.6, true, 'Shopee Mall PDF 08/05/2026')],
    tiktok: [r(14.0, false), r(16.0, false, 'Mặc định Mall')] },
  { id: 'khac', name: 'Ngành khác (mức mặc định)',
    shopee: [r(12.0, false, 'Shopee không công bố mức mặc định chung'), r(14.0, false)],
    tiktok: [r(14.0, true, 'Mặc định shop thường'), r(16.0, true, 'Mặc định Mall từ 03/08/2026')] },
];

// Phí theo sàn. type: 'percent' (trên giá sau giảm của shop, có thể có cap) | 'fixed' (₫/đơn)
export const PLATFORM_FEES = {
  shopee: [
    { id: 'transaction', name: 'Phí xử lý giao dịch (phí thanh toán)', type: 'percent', value: 6, cap: 0, on: true, verified: true },
    { id: 'infra', name: 'Phí hạ tầng', type: 'fixed', value: 3000, on: true, verified: true },
    { id: 'voucherXtra', name: 'Gói Voucher Xtra', type: 'percent', value: 5.5, cap: 50000, on: false, verified: true },
    { id: 'nttd', name: 'Phí dịch vụ hiển thị NTTD (Nạp Tiền Tự Động từ doanh thu → tiền quảng cáo)', type: 'percent', value: 1.08, cap: 0, on: true, verified: true, note: 'Tính năng Nạp Tiền Tự Động từ doanh thu đơn hàng cho Dịch vụ Hiển thị: mặc định 1% + VAT 8% = 1,08%; người bán chọn 1–50% hoặc tắt. Đây là tiền nạp vào tài khoản quảng cáo, không mất trắng — nếu đã nhập chi phí quảng cáo thì cân nhắc tắt để không tính trùng.' },
    { id: 'piship', name: 'PiShip (tiết kiệm vận chuyển)', type: 'fixed', value: 2700, on: false, verified: true },
  ],
  tiktok: [
    { id: 'transaction', name: 'Phí giao dịch', type: 'percent', value: 6, cap: 0, on: true, verified: true },
    { id: 'processing', name: 'Phí xử lý đơn hàng', type: 'fixed', value: 3000, on: true, verified: true },
    { id: 'xtraVoucher', name: 'Chương trình Voucher/Freeship Xtra', type: 'percent', value: 4, cap: 50000, on: false, verified: false },
    { id: 'affiliate', name: 'Hoa hồng Affiliate (KOC/KOL)', type: 'percent', value: 10, cap: 0, on: false, verified: false, note: 'Tự đặt theo thỏa thuận' },
  ],
};

export const TAX = { id: 'tax', isTax: true, name: 'Thuế sàn khấu trừ (hộ/cá nhân KD: 1% GTGT + 0,5% TNCN, NĐ 117/2025) – tắt nếu là doanh nghiệp', type: 'percent', value: 1.5, cap: 0, on: true, verified: true };
