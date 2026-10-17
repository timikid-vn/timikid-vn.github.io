// Biểu phí hoa hồng nền tảng TikTok Shop VN (PDF chính thức, đã bao gồm thuế):
// shop thường từ 03/07/2026, Mall từ 03/08/2026. Dữ liệu trích nguyên văn từ lớp chữ của PDF.
import data from './data/tiktok-commission.json';

export const TIKTOK_SOURCE = { title: data.source, regular: '03/07/2026', mall: '03/08/2026', rows: data.rows.length };
export const TIKTOK_ROWS = data.rows.map(([group, l1, l2, l3, regular, mall], i) => ({ stt: i + 1, group, l1, l2, l3, regular, mall }));

/** [{key, l1, l2, l3, group, rate, note, verified}] — gộp dòng trùng lặp */
export function tiktokCategories(type /* 'regular' | 'mall' */) {
  const seen = new Map();
  for (const r of TIKTOK_ROWS) {
    const key = `${r.l1}|${r.l2}|${r.l3}`;
    if (seen.has(key)) continue;
    seen.set(key, { key, l1: r.l1, l2: r.l2, l3: r.l3, group: r.group, rate: r[type], verified: true,
      note: `Dòng ${r.stt}, PDF TikTok Shop – ${type === 'mall' ? 'Mall từ 03/08/2026' : 'shop thường từ 03/07/2026'}, đã gồm thuế` });
  }
  return [...seen.values()];
}
