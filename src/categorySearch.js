// Tìm ngành hàng thông minh: không dấu, nhiều từ theo thứ tự bất kỳ, gõ thiếu chữ, tìm trên cả đường dẫn cấp 1 › 2 › 3,
// xếp hạng + tô sáng. Lập chỉ mục 1 lần cho mỗi cây (~1.400–2.000 lá) → mỗi lần gõ chỉ vài ms.
import { leaves, pathOf } from './categoryTree.js';

/** Bỏ dấu từng ký tự, giữ nguyên độ dài để tô sáng đúng vị trí trên chuỗi gốc */
export function foldChars(s) {
  let out = '';
  for (const ch of String(s)) {
    let n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (ch === 'đ' || ch === 'Đ') n = 'd';
    out += n.length === 1 ? n : n.length ? n[0] : ' ';
  }
  return out;
}
export const fold = (s) => foldChars(s).replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => fold(s).split(' ').filter(Boolean);

const INDEX = new WeakMap();
export function indexOf(root) {
  let idx = INDEX.get(root);
  if (!idx) {
    idx = leaves(root).map((node) => {
      const path = pathOf(node);
      const f = path.map((p) => foldChars(p));
      return { node, path, f, words: f.map((x) => x.split(/[^a-z0-9]+/).filter(Boolean)), all: f.join(' › ') };
    });
    INDEX.set(root, idx);
  }
  return idx;
}

// điểm 1 từ khóa trên 1 cấp: trùng nguyên từ > đầu từ > nằm giữa từ
function tokScore(words, text, t) {
  if (words.includes(t)) return 3;
  if (words.some((w) => w.startsWith(t))) return 2;
  if (text.includes(t)) return 1;
  return 0;
}

/** Trả về [{node, path, score, hl:[[start,end],...] theo từng cấp}] */
export function searchCategories(root, q, limit = 60) {
  const qt = tokens(q);
  if (!qt.length) return [];
  const phrase = qt.join(' ');
  const out = [];
  for (const e of indexOf(root)) {
    const L = e.path.length;
    let score = 0, ok = true;
    for (const t of qt) {
      let best = 0;
      for (let lv = 0; lv < L; lv++) {
        const s = tokScore(e.words[lv], e.f[lv], t);
        if (!s) continue;
        const w = lv === L - 1 ? 4 : lv === L - 2 ? 2 : 1; // cấp cuối quan trọng nhất
        best = Math.max(best, s * w);
      }
      if (!best) { ok = false; break; }
      score += best;
    }
    if (!ok) continue;
    const leafF = e.words[L - 1].join(' ');
    if (leafF === phrase) score += 30;
    else if (leafF.startsWith(phrase)) score += 18;
    else if (leafF.includes(phrase)) score += 12;
    else if (e.words.map((w) => w.join(' ')).join(' ').includes(phrase)) score += 5;
    if (/^khac$/.test(leafF)) score -= 3;
    score -= L * 0.1;
    out.push({ node: e.node, path: e.path, score, e });
  }
  out.sort((a, b) => b.score - a.score || a.path.join().localeCompare(b.path.join(), 'vi'));
  return out.slice(0, limit).map(({ node, path, score, e }) => ({ node, path, score, hl: e.f.map((f) => ranges(f, qt)) }));
}

function ranges(f, qt) {
  const r = [];
  for (const t of qt) {
    let i = -1;
    // ưu tiên khớp ở đầu từ
    const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    let m; while ((m = re.exec(f))) { i = m.index + m[1].length; r.push([i, i + t.length]); }
    if (i < 0) { let k = f.indexOf(t); while (k >= 0) { r.push([k, k + t.length]); k = f.indexOf(t, k + 1); } }
  }
  r.sort((a, b) => a[0] - b[0]);
  const m = [];
  for (const x of r) { const l = m[m.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else m.push([...x]); }
  return m;
}

/** HTML có <mark> theo vùng tô sáng (đã escape) */
export function highlight(text, hl, esc) {
  const chars = [...String(text)];
  let out = '', pos = 0;
  for (const [a, b] of hl || []) { out += esc(chars.slice(pos, a).join('')) + '<mark>' + esc(chars.slice(a, b).join('')) + '</mark>'; pos = b; }
  return out + esc(chars.slice(pos).join(''));
}
