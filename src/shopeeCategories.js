// Bộ phân tích biểu phí cố định Shopee từ src/data/shopee-fixed-fees.txt
// (chép tay từ 2 file PDF chính thức của Shopee — xem đầu file txt).
import raw from './data/shopee-fixed-fees.txt?raw';

export const SHOPEE_FIXED_SOURCES = {
  regular: { title: 'Shopee – Phí cố định cho Người bán KHÔNG thuộc Shopee Mall (PDF)', effective: '23/05/2026', rows: 1439, vat: 'Đã bao gồm thuế GTGT 8%' },
  mall: { title: 'Shopee – Phí Cố Định từ 29.05.2026 – Người bán Shopee Mall (PDF)', effective: '29/05/2026', rows: 1656, vat: 'Đã bao gồm thuế GTGT 8%' },
  mallBooks: { title: 'Shopee Mall – Cập nhật phí cố định Sách & Tạp Chí', url: 'https://banhang.shopee.vn/edu/article/28220', effective: '04/10/2026' },
};

// Cập nhật chính thức sau file PDF Mall (article 28220, từ 04/10/2026)
const MALL_OVERRIDES = {
  'Sách & Tạp Chí|Sách|Sách Giáo Dục': 13,
  'Sách & Tạp Chí|Sách|Sách Học Ngoại Ngữ & Từ Điển': 12.5,
  'Sách & Tạp Chí|Sách|Sách Thiếu Nhi': 12.5,
  'Sách & Tạp Chí|Sách|Sách Hướng Nghiệp & Phát Triển Bản Thân': 12.5,
  'Sách & Tạp Chí|Sách|Truyện Tranh': 12.5,
};

export function parseShopeeFees(text) {
  const rows = []; // {section, stt, l1, l2, l3, regular, mall}
  let section = null, l1 = null, l2 = null, stt = 0;
  const push = (l3, rates) => {
    stt++;
    const nums = rates.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) throw new Error(`Bad rate at ${l1}/${l2}/${l3}`);
    const r = { section, stt, l1, l2, l3 };
    if (section === 'shared') { r.regular = nums[0]; r.mall = nums[1]; if (nums.length !== 2) throw new Error(`Need 2 rates: ${l1}/${l2}/${l3}`); }
    else { r[section] = nums[0]; if (nums.length !== 1) throw new Error(`Need 1 rate: ${l1}/${l2}/${l3}`); }
    rows.push(r);
  };
  for (const line of text.split('\n').map((s) => s.trim())) {
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) { section = line.slice(1); stt = section === 'regular' ? 1315 : section === 'mall' ? 1315 : 0; continue; }
    if (line.startsWith('= ')) { l1 = line.slice(2).trim(); l2 = null; continue; }
    if (line.startsWith('- ')) {
      const [name, ...rates] = line.slice(2).split('|').map((s) => s.trim());
      l2 = name;
      if (rates.length) push('', rates);
      continue;
    }
    const [names, ...rates] = line.split('|').map((s) => s.trim());
    for (const n of names.split(';').map((s) => s.trim())) push(n, rates);
  }
  return rows;
}

export const SHOPEE_ROWS = parseShopeeFees(raw);

const label = (r) => [r.l2, r.l3].filter(Boolean).join(' › ');

/** Danh sách ngành cho 1 loại shop: [{id, l1, l2, l3, path, rate, note}] — đã gộp dòng trùng lặp */
export function shopeeCategories(type /* 'regular' | 'mall' */) {
  const seen = new Map();
  for (const r of SHOPEE_ROWS) {
    let rate = r[type];
    if (rate == null) continue;
    const key = `${r.l1}|${r.l2}|${r.l3}`;
    let note = `STT ${r.stt}, PDF ${SHOPEE_FIXED_SOURCES[type].effective}, đã gồm VAT 8%`;
    if (type === 'mall' && MALL_OVERRIDES[key] != null) { rate = MALL_OVERRIDES[key]; note = `Cập nhật từ 04/10/2026 (trước: ${r.mall}%)`; }
    if (seen.has(key)) continue; // dòng trùng lặp trong PDF
    seen.set(key, { id: `sp-${type}-${seen.size}`, key, l1: r.l1, l2: r.l2, l3: r.l3, path: label(r), rate, note, verified: true });
  }
  return [...seen.values()];
}

export function findShopeeRate(type, l1, l2, l3 = '') {
  return shopeeCategories(type).find((c) => c.l1 === l1 && c.l2 === l2 && c.l3 === l3)?.rate;
}
