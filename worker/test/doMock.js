// Giả lập Durable Object namespace: mỗi tên → đúng 1 instance (như Cloudflare), storage trong bộ nhớ
import { ShopTokens } from '../src/tokens.js';
const tick = () => new Promise((r) => setTimeout(r, 0));
export function mockNamespace(env, fetchFn) {
  const inst = new Map();
  const storage = () => { const m = new Map(); return { m, get: async (k) => { await tick(); return structuredClone(m.get(k)); }, put: async (k, v) => { await tick(); m.set(k, structuredClone(v)); }, delete: async (k) => { await tick(); m.delete(k); } }; };
  return {
    inst,
    idFromName: (n) => n,
    get(id) {
      if (!inst.has(id)) inst.set(id, new ShopTokens({ storage: storage() }, env, fetchFn));
      const o = inst.get(id);
      return { fetch: (u, init) => o.fetch(new Request(u, init)) };
    },
  };
}
