import { describe, it, expect } from 'vitest';
import { pickPrice, friendlyError, listProducts, productDetail, categoryPath } from '../src/shopee.js';

const env = { SHOPEE_PARTNER_ID: '1', SHOPEE_PARTNER_KEY: 'k', SHOPEE_HOST: 'https://shopee.test' };
const tok = { access_token: 'AT' };
const CATS = [{ id: 1, parent: 0, name: 'Mẹ & Bé' }, { id: 2, parent: 1, name: 'Tã & bô em bé' }, { id: 3, parent: 2, name: 'Tã dùng một lần' }];
const ITEMS = {
  10: { item_id: 10, item_name: 'Tã Dayper', category_id: 3, has_model: true, item_status: 'NORMAL', image: { image_url_list: ['https://cf/img10'] } },
  11: { item_id: 11, item_name: 'Lót phân su', item_sku: 'MIP.LS-01', category_id: 3, has_model: false, item_status: 'UNLIST', price_info: [{ original_price: 40700, current_price: 40700 }], stock_info_v2: { summary_info: { total_available_stock: 0 } } },
  12: { item_id: 12, item_name: 'Que rơ lưỡi', category_id: 3, has_model: false, item_status: 'NORMAL', price_info: [{ original_price: 90000, current_price: 85000 }], stock_info_v2: { summary_info: { total_available_stock: 7 } } },
};
function mock(over = {}) {
  const calls = [];
  const f = async (url) => {
    const u = new URL(url); calls.push(u);
    const ok = (response) => ({ json: async () => ({ response }) });
    const path = u.pathname;
    if (over[path]) return { json: async () => over[path](u) };
    if (path.endsWith('get_item_list')) return ok({ item: [{ item_id: 10 }, { item_id: 11 }], has_next_page: true, next_offset: 2 });
    if (path.endsWith('search_item')) return ok({ item_id_list: u.searchParams.get('item_sku') ? [11] : [12], next_offset: '' });
    if (path.endsWith('get_item_base_info')) return ok({ item_list: u.searchParams.get('item_id_list').split(',').map((id) => ITEMS[id]).filter(Boolean) });
    if (path.endsWith('get_model_list')) return ok({ tier_variation: [{ option_list: [{ option: 'S60' }, { option: 'XL50' }] }], model: [
      { model_id: 1, tier_index: [0], price_info: [{ original_price: 350000, current_price: 250000 }], stock_info_v2: { summary_info: { total_available_stock: 0 } } },
      { model_id: 2, tier_index: [1], model_sku: 'XL', price_info: [{ original_price: 385000, current_price: 385000 }], stock_info_v2: { summary_info: { total_available_stock: 9 } } }] });
    if (path.endsWith('get_item_promotion')) return ok({ success_list: [{ promotion: [{ promotion_type: 'Discount Promotions', promotion_id: 5, start_time: 1, end_time: 9e9 }, { promotion_type: 'Discount Promotions', promotion_id: 5, start_time: 1, end_time: 9e9 }, { promotion_type: 'Flash Sale', promotion_id: 6, start_time: 1, end_time: 2 }] }] });
    return ok({});
  };
  return { f, calls };
}

describe('pickPrice', () => {
  it('có KM', () => expect(pickPrice([{ original_price: 350000, current_price: 250000 }])).toEqual({ original: 350000, current: 250000, promo: true, discountPct: 29 }));
  it('không KM', () => expect(pickPrice({ original_price: 72000, current_price: 72000 })).toMatchObject({ current: 72000, promo: false }));
  it('thiếu current → dùng giá gốc', () => expect(pickPrice([{ original_price: 1000 }])).toMatchObject({ current: 1000, promo: false }));
  it('rỗng → null', () => { expect(pickPrice(null)).toBeNull(); expect(pickPrice([])).toBeNull(); });
});

describe('friendlyError', () => {
  it.each([
    ['Shopee /api/v2/product/get_item_list: invalid_access_token Invalid access_token.', /hết hạn/],
    ['Shopee /api/v2/auth/access_token/get: error_param refresh_token expired', /kết nối lại/],
    ['Shopee x: error_permission no permission', /cấp quyền/],
    ['error_item_not_found', /đã bị xóa/],
    ['Shopee x: error_busy server busy', /bận/],
    ['fetch failed', /mạng/],
    ['Shopee x: error_unknown weird', /^Shopee báo lỗi: error_unknown weird$/],
  ])('%s', (m, re) => expect(friendlyError(new Error(m))).toMatch(re));
});

describe('listProducts', () => {
  it('lấy cả đang bán + đang ẩn, có phân trang', async () => {
    const { f, calls } = mock();
    const r = await listProducts(env, tok, 99, {}, f);
    expect(calls[0].searchParams.getAll('item_status')).toEqual(['NORMAL', 'UNLIST']);
    expect(r.next).toBe(2);
    expect(r.items[0]).toMatchObject({ id: '10', hasModel: true, price: null, image: 'https://cf/img10_tn' });
    expect(r.items[1]).toMatchObject({ id: '11', status: 'UNLIST', statusText: 'Đang ẩn', stock: 0, price: 40700, promo: false });
    expect(calls.some((u) => u.searchParams.get('access_token') === 'AT')).toBe(true);
  });
  it('tìm theo tên + SKU (SKU lên đầu)', async () => {
    const { f, calls } = mock();
    const r = await listProducts(env, tok, 99, { q: 'MIP.LS-01' }, f);
    expect(calls.filter((u) => u.pathname.endsWith('search_item')).length).toBe(2);
    expect(r.items.map((i) => i.id)).toEqual(['11', '12']);
    expect(r.next).toBeNull();
  });
  it('tên thường chỉ tìm theo tên', async () => {
    const { f, calls } = mock();
    const r = await listProducts(env, tok, 99, { q: 'que ro' }, f);
    expect(calls.filter((u) => u.pathname.endsWith('search_item')).length).toBe(1);
    expect(r.items[0]).toMatchObject({ price: 85000, originalPrice: 90000, promo: true });
  });
  it('không có kết quả', async () => {
    const { f } = mock({ '/api/v2/product/search_item': () => ({ response: {} }) });
    expect(await listProducts(env, tok, 99, { q: 'xyz' }, f)).toEqual({ items: [], next: null });
  });
});

describe('productDetail', () => {
  it('phân loại: giá gốc / sau KM / tồn kho, KM loại trùng & hết hạn', async () => {
    const { f } = mock();
    const d = await productDetail(env, tok, 99, '10', CATS, f);
    expect(d.models).toEqual([
      expect.objectContaining({ id: '1', name: 'S60', price: 250000, originalPrice: 350000, promo: true, discountPct: 29, stock: 0 }),
      expect.objectContaining({ id: '2', name: 'XL50', sku: 'XL', price: 385000, promo: false, stock: 9 }),
    ]);
    expect(d.price).toBe(250000);
    expect(d.promotions).toHaveLength(1);
    expect(d.categoryPath).toEqual(['Mẹ & Bé', 'Tã & bô em bé', 'Tã dùng một lần']);
  });
  it('không phân loại, có KM', async () => {
    const { f } = mock();
    expect(await productDetail(env, tok, 99, '12', CATS, f)).toMatchObject({ price: 85000, originalPrice: 90000, promo: true, discountPct: 6, models: [] });
  });
  it('sản phẩm đã xóa → lỗi dễ hiểu', async () => {
    const { f } = mock();
    await expect(productDetail(env, tok, 99, '404', CATS, f)).rejects.toThrow('error_item_not_found');
    expect(friendlyError(new Error('error_item_not_found'))).toMatch(/đã bị xóa/);
  });
  it('lỗi KM không làm hỏng chi tiết', async () => {
    const { f } = mock({ '/api/v2/product/get_item_promotion': () => ({ error: 'error_permission', message: 'x' }) });
    expect((await productDetail(env, tok, 99, '12', CATS, f)).promotions).toEqual([]);
  });
  it('categoryPath với id lạ → rỗng', () => expect(categoryPath(CATS, 999)).toEqual([]));
});
