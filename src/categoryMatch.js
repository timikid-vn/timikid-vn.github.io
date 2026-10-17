// Ghép ngành hàng từ API sàn (get_category, có thể 4–5 cấp) với cây biểu phí trong app (≤ 3 cấp).
import { walk, leaves, pathOf, normText } from './categoryTree.js';
import { fold } from './categorySearch.js';

// chuẩn hóa tên ngành: bỏ dấu, "&"≈"và", bỏ ký tự lạ, "jeans"→"jean"
const STOP = new Set(['va', 'cac', 'loai', 'cho', 'do', 'cua']);
const words = (s) => fold(String(s).replace(/&/g, ' ')).split(' ').filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
export function nameSim(a, b) {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return 0;
  if (A.join(' ') === B.join(' ')) return 1;
  const sa = new Set(A), sb = new Set(B);
  const inter = [...sa].filter((w) => sb.has(w)).length;
  const j = inter / new Set([...sa, ...sb]).size;
  const contain = inter / Math.min(sa.size, sb.size);
  return Math.max(j, contain * 0.85 * Math.sqrt(Math.min(sa.size, sb.size) / Math.max(sa.size, sb.size)));
}
const bestChild = (node, name) => {
  let best = null, s = 0;
  for (const c of node.children) { const v = nameSim(c.name, name); if (v > s) { s = v; best = c; } }
  return { node: best, sim: s };
};
const isKhac = (n) => /^khac$/.test(fold(n.name));
const sameRate = (node) => { const r = new Set(leaves(node).map((l) => l.leaf.rate)); return r.size === 1; };

/**
 * apiPath: ['Mẹ & Bé','Chăm sóc sức khỏe bé','Chăm sóc răng miệng cho bé'] (có thể dài hơn 3 cấp)
 * → { path, confidence: 'exact'|'high'|'same-fee'|'low'|null, suggestions: [path...] }
 *  - exact/high: chắc chắn → tự điền
 *  - same-fee: khớp tới cấp cha và mọi ngành con cùng mức phí → tự điền (phí đúng)
 *  - low: chỉ đoán → mở bộ chọn với gợi ý
 */
export function matchShopeeCategory(root, apiPath = []) {
  apiPath = (apiPath || []).filter(Boolean);
  if (!apiPath.length) return { path: null, confidence: null, suggestions: [] };
  const exact = walk(root, apiPath.slice(0, 3));
  if (exact.complete && exact.nodes.at(-1)?.leaf) return { path: apiPath.slice(0, 3), confidence: 'exact', suggestions: [] };
  // 1) đi từng cấp, mỗi cấp chọn con giống tên nhất
  let node = root, minSim = 1, leafSim = 0;
  const got = [];
  for (let lv = 0; lv < apiPath.length && !node.leaf; lv++) {
    const { node: c, sim } = bestChild(node, apiPath[lv]);
    if (!c || sim < 0.5) break;
    got.push(c); node = c; minSim = Math.min(minSim, sim); leafSim = sim;
  }
  if (got.length && node.leaf) {
    const sure = minSim >= 0.75 || (leafSim === 1 && !isKhac(node) && got.length >= 2);
    return { path: pathOf(node), confidence: sure ? 'high' : 'low', suggestions: sure ? [] : suggest(root, apiPath, pathOf(node)) };
  }
  if (got.length >= 2 && node.children.length) {
    // dừng ở cấp cha: nếu mọi con cùng mức phí → chọn "Khác" (hoặc con đầu tiên) là đúng phí
    const khac = node.children.find((c) => c.leaf && isKhac(c)) || leaves(node)[0];
    if (sameRate(node)) return { path: pathOf(khac), confidence: 'same-fee', suggestions: [] };
    return { path: pathOf(khac), confidence: 'low', suggestions: suggest(root, apiPath, pathOf(khac), node) };
  }
  // 2) không đi được theo cấp (tên cấp 1 khác hẳn) → tìm lá trùng tên trên toàn cây
  const names = [...new Set([apiPath[Math.min(2, apiPath.length - 1)], apiPath[apiPath.length - 1]])].filter((n) => !/^khac$/.test(fold(n)));
  const hits = leaves(root).filter((l) => names.some((n) => nameSim(l.name, n) === 1));
  if (hits.length === 1 || (hits.length > 1 && new Set(hits.map((h) => h.leaf.rate)).size === 1)) {
    const best = hits.map((h) => [pathOf(h), pathOf(h).reduce((a, x, i) => a + (apiPath[i] ? nameSim(x, apiPath[i]) : 0), 0)]).sort((a, b) => b[1] - a[1])[0][0];
    return { path: best, confidence: hits.length === 1 ? 'high' : 'same-fee', suggestions: [] };
  }
  const sug = suggest(root, apiPath);
  return { path: sug[0] || null, confidence: sug.length ? 'low' : null, suggestions: sug };
}

function suggest(root, apiPath, first = null, under = null) {
  const leafName = apiPath[apiPath.length - 1];
  const scored = [];
  for (const l of leaves(under || root)) {
    const p = pathOf(l);
    let s = nameSim(l.name, leafName) * 3;
    apiPath.slice(0, -1).forEach((n, i) => { if (p[i]) s += nameSim(p[i], n); });
    if (s > 0.8) scored.push([s, p]);
  }
  if (under) for (const l of leaves(root)) if (!scored.some(([, p]) => p.join() === pathOf(l).join())) { const s = nameSim(l.name, leafName) * 3; if (s >= 2) scored.push([s, pathOf(l)]); }
  scored.sort((a, b) => b[0] - a[0]);
  const out = first ? [first] : [];
  for (const [, p] of scored) if (!out.some((x) => x.join() === p.join())) out.push(p);
  return out.slice(0, 8);
}

/** Tương thích cũ: trả về path hoặc null */
export function matchCategory(root, names = []) {
  names = names.filter(Boolean);
  if (!names.length) return null;
  const exact = walk(root, names);
  if (exact.complete && exact.nodes.at(-1)?.leaf) return names;
  const N = names.map(normText);
  let best = null, bestScore = 0;
  for (const l of leaves(root)) {
    const p = pathOf(l), P = p.map(normText);
    if (P.at(-1) !== N.at(-1)) continue;
    let score = 10;
    for (const n of N.slice(0, -1)) if (P.includes(n)) score += 3;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}
