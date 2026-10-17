// Cây ngành hàng nhiều cấp cho bộ chọn dạng cột (kiểu Kênh Người Bán Shopee).
// items: [{ path: string[], rate, note, verified, key }] — path là các cấp từ 1 tới lá (độ sâu tùy ý).
export function buildTree(items) {
  const root = { name: '', children: [], byName: new Map() };
  for (const it of items) {
    let node = root;
    for (const name of it.path) {
      let child = node.byName.get(name);
      if (!child) { child = { name, children: [], byName: new Map(), parent: node }; node.byName.set(name, child); node.children.push(child); }
      node = child;
    }
    if (node.leaf) continue; // trùng lặp
    node.leaf = it;
  }
  // Nút vừa là lá vừa có con: đẩy phần "lá" xuống thành con "(Chung)" để lá luôn ở cuối nhánh.
  const fix = (n) => {
    if (n.leaf && n.children.length) {
      const c = { name: '(Chung)', children: [], byName: new Map(), parent: n, leaf: n.leaf };
      n.byName.set(c.name, c); n.children.push(c); delete n.leaf;
    }
    n.children.forEach(fix);
  };
  fix(root);
  return root;
}

export const leaves = (n) => (n.leaf ? [n] : n.children.flatMap(leaves));
export const pathOf = (n) => { const p = []; for (let x = n; x && x.parent; x = x.parent) p.unshift(x.name); return p; };

/** Đi theo path; trả về {nodes: nút từng cấp khớp được, complete: path tồn tại đầy đủ} */
export function walk(root, path = []) {
  const nodes = []; let n = root;
  for (const name of path) { n = n.byName.get(name); if (!n) return { nodes, complete: false }; nodes.push(n); }
  return { nodes, complete: true };
}

export const normText = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function searchLeaves(root, q, limit = 60) {
  const words = normText(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const l of leaves(root)) {
    const p = pathOf(l), hay = normText(p.join(' '));
    if (words.every((w) => hay.includes(w))) { out.push({ node: l, path: p, score: normText(l.name).includes(words.join(' ')) ? 0 : 1 }); }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit);
}
