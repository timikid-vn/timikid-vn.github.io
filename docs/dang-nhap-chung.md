# Tài khoản timikid — đăng nhập dùng chung cho mọi app của timikid-vn

## Dành cho anh Duy (không cần biết code)

- **Một tài khoản dùng cho mọi app** của timikid-vn: máy tính lãi lỗ, và các app làm sau này. Đăng nhập ở một app là các app khác trên `timikid-vn.github.io` cũng nhận.
- **Admin** là `duylinh30190@gmail.com`.
- **Ai cũng tự đăng ký được** (email + mật khẩu từ 10 ký tự). Nhưng tài khoản mới ở trạng thái **Chờ duyệt** và **không vào được app nào** cho tới khi admin duyệt.
- Trang quản lý: **https://timikid-vn.github.io/admin/** (có sau khi PR được merge). Ở đây anh có thể:
  - **Duyệt** tài khoản mới;
  - **Thu hồi** quyền: tài khoản đó bị đăng xuất khỏi mọi app trong tối đa 15 phút;
  - **Đặt lại mật khẩu**: app tạo mật khẩu tạm, chỉ hiện một lần, anh gửi riêng cho người đó;
  - **Xóa** tài khoản;
  - giới hạn người đó chỉ được dùng một số **app** (mặc định là tất cả app).

### Anh cần làm

1. **Đặt mật khẩu admin** qua form bảo mật em gửi riêng (secret `ADMIN_PASSWORD`, Worker `timikid-auth`). **Không dán mật khẩu vào chat.**
   - Chưa đặt thì đăng nhập admin bị tắt và app báo: “Chưa đặt mật khẩu admin — đăng nhập admin đang tắt”.
   - Muốn đổi mật khẩu admin thì nhập lại secret này.
2. Khi có người đăng ký, vào trang admin → tab **Chờ duyệt** → bấm **Duyệt**.

### Bảo mật đã có
- Mật khẩu người dùng **không lưu dạng chữ**. App chỉ lưu bản băm PBKDF2-SHA256 với 100.000 vòng (mức tối đa Cloudflare Workers cho phép) và salt ngẫu nhiên riêng cho từng người. Phép so sánh chạy trong thời gian không đổi.
- **Chống dò mật khẩu:**
  - sai 5 lần thì tài khoản bị khóa 15 phút; nếu tiếp tục sai, thời gian khóa tăng dần, tối đa 2 giờ;
  - một địa chỉ IP sai quá 30 lần trong 15 phút cũng bị chặn.
- Phiên đăng nhập:
  - token truy cập sống 15 phút, ký bằng **ES256**;
  - token làm mới sống 30 ngày, **dùng một lần** và đổi sau mỗi lần dùng;
  - thu hồi hoặc đặt lại mật khẩu thì mọi phiên cũ mất hiệu lực.
- Chỉ trang trên `https://timikid-vn.github.io` (và `https://<tên>.timikid-vn.github.io`) mới gọi được máy chủ đăng nhập. Trang web khác gọi vào sẽ bị từ chối (403).
- Không ai đăng ký được bằng email admin. Tài khoản admin cũng không thể bị sửa hay xóa từ trang admin.

---

## Dành cho người làm app mới (kỹ thuật)

**Máy chủ đăng nhập:** `https://timikid-auth.timikid-vn.workers.dev` (thư mục `auth-worker/`, KV `USERS`).

| Endpoint | Mô tả |
|---|---|
| `GET /config` | `{ready, adminLogin, issuer, minPassword}` |
| `POST /register` `{email,password,name}` | Tạo tài khoản ở trạng thái `pending` (không cấp token) |
| `POST /login` `{email,password}` | Nếu `approved`: `{accessToken, refreshToken, expiresIn, user}`. Nếu không: 403 `pending` / `revoked`, 401 `invalid_credentials`, 429 `locked`, 503 `admin_login_disabled` |
| `POST /refresh` `{refreshToken}` | Đổi lấy cặp token mới; token cũ mất hiệu lực |
| `POST /logout` `{refreshToken}` | Đăng xuất |
| `GET /me` (Bearer) | Thông tin người dùng |
| `POST /password` (Bearer) `{oldPassword,newPassword}` | Đổi mật khẩu |
| `GET /admin/users` (Bearer admin) | Danh sách người dùng |
| `POST /admin/users/:email` (Bearer admin) `{action}` | `action` là một trong: `approve`, `revoke`, `remove`, `reset` (trả `tempPassword`), `set_apps` (kèm `{apps:[…]}`) |
| `GET /.well-known/jwks.json` | **Khóa công khai** để các Worker khác tự xác minh phiên |

**Token truy cập** là JWT ES256 với các claims:
- `iss` = `https://timikid-auth.timikid-vn.workers.dev`, `aud` = `timikid-vn`, `typ` = `access`;
- `sub`, `email`, `name`, `role` (`admin` hoặc `user`), `status` (`approved`), `apps` (`["*"]` hoặc danh sách app), `exp`.

### Frontend (trình duyệt)
```js
import { createAuth } from 'https://timikid-vn.github.io/auth/timikid-auth.js';
const auth = createAuth({ app: 'ten-app-moi' });

await auth.register(email, password, name);   // → user.status === 'pending'
await auth.login(email, password);            // lỗi có e.code: pending | revoked | invalid_credentials | locked
const r = await auth.fetch('https://ten-app-moi.timikid-vn.workers.dev/api/...'); // tự gắn Bearer + tự làm mới
auth.user;            // { email, name, role, status, apps } | null
await auth.logout();
```
Phiên được lưu trong `localStorage` dưới khóa `timikid-auth-v1`. Mọi app cùng origin `timikid-vn.github.io` dùng chung phiên này.

### Worker của app mới (xác minh phiên, không cần bí mật)
1. Chép `auth-worker/client/verify.js` vào project.
2. Thêm vào `wrangler.toml`:
   ```toml
   [vars]
   AUTH_ISSUER = "https://timikid-auth.timikid-vn.workers.dev"
   [[services]]
   binding = "AUTH"          # bắt buộc: Worker cùng tài khoản không fetch nhau qua workers.dev được
   service = "timikid-auth"
   ```
3. Trong code:
   ```js
   import { verifyAccess } from './verify.js';
   const user = await verifyAccess(env, req.headers.get('authorization')?.replace(/^Bearer /, ''), { app: 'ten-app-moi' });
   if (!user) return new Response('unauthorized', { status: 401 });
   ```
   `verifyAccess` kiểm tra chữ ký ES256 bằng JWKS (cache 10 phút, tự tải lại khi gặp khóa mới), `iss`, `aud`, `exp`, `status === 'approved'` và quyền vào app (`apps` chứa `*` hoặc tên app; admin luôn được vào).

### Vận hành
- Secrets của `timikid-auth`:
  - `AUTH_SIGNING_JWK`: khóa riêng ES256, đã sinh và nạp;
  - `ADMIN_PASSWORD`: anh Duy tự đặt.
- Vars: `ADMIN_EMAIL`, `AUTH_ISSUER`, `EXTRA_ORIGINS` (tùy chọn, ví dụ `http://localhost:5173` khi phát triển).
- Xoay khóa ký: nạp `AUTH_SIGNING_JWK` mới. Token truy cập cũ hết hạn trong tối đa 15 phút, sau đó client tự làm mới bằng refresh token (không cần đăng nhập lại). Các Worker app tự tải JWKS mới khi gặp khóa lạ.
