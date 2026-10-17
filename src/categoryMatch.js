// Ghép đường dẫn ngành hàng trả về từ API sàn với cây biểu phí trong app.
import { walk, leaves, pathOf, normText } from './categoryTree.js';

/** names: ['Cấp 1', 'Cấp 2', 'Cấp 3'] → path trong cây (hoặc null nếu không chắc chắn) */
export function matchCategory(root, names = []) {
  names = names.filter(Boolean);
  if (!names.length) return null;
  const exact = walk(root, names);
  if (exact.complete && exact.nodes.at(-1)?.leaf) return names;
  const N = names.map(normText);
  let best = null, bestScore = 0;
  for (const l of leaves(root)) {
    const p = pathOf(l), P = p.map(normText);
    if (P.at(-1) !== N.at(-1)) continue; // lá phải trùng tên
    let score = 10;
    for (const n of N.slice(0, -1)) if (P.includes(n)) score += 3;
    if (score > bestScore) { bestScore = score; best = p; }
    else if (score === bestScore) best = best && best.length <= p.length ? best : p;
  }
  return best;
}
