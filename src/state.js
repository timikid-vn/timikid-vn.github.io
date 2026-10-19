// Trạng thái lưu trong localStorage + di chuyển phiên bản (không bao giờ làm mất số đã nhập).
export const STATE_KEY = 'spc-state-v10'; // v10: tách "Phí đóng gói" (pack) khỏi "Nhân sự" (opex)
const OLD_KEYS = ['spc-state-v9'];
export const COST_MODES = ['vnd', 'percent', 'monthly'];

/** Chuẩn hóa 1 khoản chi phí {mode, value}: đơn vị hợp lệ, giá trị ≥ 0 (âm/không phải số → rỗng) */
export function normCost(c, def) {
  const mode = COST_MODES.includes(c?.mode) ? c.mode : def.mode;
  const raw = c?.value;
  if (raw === '' || raw == null) return { mode, value: '' };
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return { mode, value: '' };
  return { mode, value: typeof raw === 'number' ? raw : String(raw).replace(',', '.') };
}

/** Bản cũ → bản mới. v9: opex = "Nhân sự & đóng gói" → giữ nguyên giá trị + đơn vị ở "Nhân sự"; "Phí đóng gói" mới = rỗng */
export function migrate(old, blank) {
  const o = old && typeof old === 'object' ? old : {};
  return { ...blank, ...o, opex: normCost(o.opex, blank.opex), pack: normCost(o.pack, blank.pack), ads: normCost(o.ads, blank.ads), v: 10 };
}

export function loadState(storage, blank) {
  const read = (k) => { try { const s = storage?.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };
  const cur = read(STATE_KEY);
  if (cur) return migrate(cur, blank);
  for (const k of OLD_KEYS) { const o = read(k); if (o) return migrate(o, blank); } // bản cũ giữ nguyên trong storage (không xóa)
  return migrate({}, blank);
}
