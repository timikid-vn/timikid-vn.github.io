// Quyền dùng "Chọn shop" / chọn sản phẩm: chỉ tài khoản đã đăng nhập + admin duyệt + có quyền app shop-connect.
export const APP_ID = 'shop-connect';
const PENDING_KEY = 'timikid-pending-v1';

/** 'out' | 'pending' | 'noapp' | 'ok' (chỉ dựa vào thông tin đăng nhập đã lưu — không gọi mạng) */
export function accessState(user) {
  if (!user) return 'out';
  if (user.status !== 'approved') return user.status === 'pending' ? 'pending' : 'out';
  const apps = user.apps || [];
  return user.role === 'admin' || apps.includes('*') || apps.includes(APP_ID) ? 'ok' : 'noapp';
}

/** Email đang chờ duyệt (ghi nhớ sau khi đăng ký / đăng nhập bị báo "chờ duyệt") để hiện ghi chú */
export const pendingStore = (storage = globalThis.localStorage) => ({
  get: () => { try { return storage?.getItem(PENDING_KEY) || ''; } catch { return ''; } },
  set: (email) => { try { email ? storage?.setItem(PENDING_KEY, email) : storage?.removeItem(PENDING_KEY); } catch { /* bỏ qua */ } },
});

/**
 * Theo dõi chuyển trạng thái được/không được dùng (ok ↔ không ok).
 * onTransition(ok, state) chỉ gọi khi đổi trạng thái — làm mới token (cùng trạng thái) không gọi lại.
 * Gọi ngay 1 lần lúc khởi tạo.
 */
export function createAccessGate(auth, onTransition) {
  let ok = null;
  const check = () => {
    const st = accessState(auth.user), now = st === 'ok';
    if (now !== ok) { ok = now; onTransition(now, st); }
    return now;
  };
  auth.onChange(check);
  check();
  return { get ok() { return !!ok; }, state: () => accessState(auth.user), check };
}
