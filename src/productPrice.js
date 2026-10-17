// Chọn giá bán từ sản phẩm Shopee: dùng giá SAU khuyến mãi của shop (current_price), kèm giá gốc để hiển thị.
const PROMO_VI = {
  'Discount Promotions': 'Giảm giá của shop', 'Flash Sale': 'Flash Sale', 'Shop Flash Sale': 'Flash Sale của shop',
  'Platform Streaming': 'Giá livestream', 'Gift with purchase Main': 'Mua kèm quà tặng', 'Add-on Deal Main': 'Mua kèm deal sốc',
  'Bundle Deal': 'Combo khuyến mãi', 'Exclusive Price': 'Giá độc quyền',
};
export const promoLabel = (t) => PROMO_VI[t] || t || '';

/** Khoảng giá của các phân loại còn bán (bỏ phân loại không có giá) */
export function priceRange(models = []) {
  const ps = models.map((m) => m.price).filter((x) => x != null);
  if (!ps.length) return null;
  return { min: Math.min(...ps), max: Math.max(...ps) };
}

/**
 * product: kết quả /products/:id; model: 1 phân loại (hoặc null nếu sản phẩm không có phân loại)
 * → { price, original, promo, discountPct, outOfStock, warn[], promoNames[] }
 */
export function choosePrice(product, model = null) {
  const src = model || product;
  const price = src?.price ?? null, original = src?.originalPrice ?? price;
  const promo = price != null && original != null && price < original;
  const warn = [];
  if (price == null) warn.push('Không có giá cho lựa chọn này.');
  if (src?.stock === 0) warn.push('Đang hết hàng.');
  if (product?.status && product.status !== 'NORMAL') warn.push(`Sản phẩm ${product.statusText ? product.statusText.toLowerCase() : product.status} trên Shopee.`);
  const promoNames = promo ? [...new Set((product?.promotions || []).filter((p) => p.ongoing !== false && /Discount|Flash/i.test(p.type)).map((p) => promoLabel(p.type)))] : [];
  return { price, original, promo, discountPct: promo ? Math.round((1 - price / original) * 100) : 0, outOfStock: src?.stock === 0, warn, promoNames };
}
