# Hướng dẫn kết nối Shopee & TikTok Shop vào app Tính Lãi Lỗ

Dành cho anh Duy. Đọc từ trên xuống, làm lần lượt từng bước. Chỗ nào chưa rõ thì cứ hỏi lại em.

---

## ⏳ Trạng thái hiện tại (17/10/2026)

| Việc | Trạng thái |
|---|---|
| Shopee Partner ID `2034752` | ✅ Đây là **Live Partner ID**: Shopee Live chấp nhận chữ ký, còn sandbox báo `invalid_partner_id`. Partner Key đã nạp. |
| Shopee **Redirect URL Domain** | ✅ Anh đã khai báo `https://n8n.timikid.com`. Shopee chuyển về `https://n8n.timikid.com/webhook/shopee-callback`. Workflow n8n **“Shopee OAuth relay → timikid-shop-connect”** (đang bật, không lưu dữ liệu chạy) trả 302 và chuyển nguyên tham số sang Worker `/oauth/shopee/callback`; Worker vẫn kiểm `state` dùng một lần. Bản workflow: [n8n-shopee-relay.json](n8n-shopee-relay.json). ⚠️ Đừng tắt hay xóa workflow này. |
| TikTok App key `6k3gnffonvbtq` | ✅ Đã cấu hình, App secret đã nạp. |
| TikTok **Service ID** `7643091412851197713` | ✅ Đã cấu hình. Link ủy quyền mở ra trang đăng nhập Seller Center Việt Nam, sau đó sang trang ủy quyền Custom App. |
| Đăng nhập | Dùng **tài khoản timikid chung** (email + mật khẩu, admin duyệt). Xem [dang-nhap-chung.md](dang-nhap-chung.md). ✅ Mật khẩu admin đã đặt. |

## 0. Tóm tắt nhanh

Để nút **“Chọn shop”** trong app lấy được danh sách shop và sản phẩm thật, cần 3 thứ:

| # | Việc cần làm | Ở đâu | Thời gian chờ duyệt |
|---|---|---|---|
| 1 | Đăng ký tài khoản nhà phát triển Shopee và tạo app loại **Seller In House System** | https://open.shopee.com | Hồ sơ: tối đa **7 ngày làm việc**. App lên Live: khoảng **24 giờ** |
| 2 | Đăng ký **TikTok Shop Partner Center** (loại *TikTok Shop Seller*) và tạo **Custom App** | https://partner.tiktokshop.com | Seller đã xác minh thường được **duyệt tự động/ngay**. Nếu bị chuyển sang duyệt tay thì mất vài ngày làm việc |
| 3 | ✅ **Cloudflare: đã xong.** Máy chủ kết nối đang chạy tại https://timikid-shop-connect.timikid-vn.workers.dev | — | — |

**Hai địa chỉ callback (Redirect URL) chính thức để nhập khi tạo app:**
- Shopee: `https://timikid-shop-connect.timikid-vn.workers.dev/oauth/shopee/callback`
- TikTok Shop: `https://timikid-shop-connect.timikid-vn.workers.dev/oauth/tiktok/callback`

> 🔒 **Bảo mật — quan trọng:** các mã bí mật (Partner Key của Shopee, App Secret của TikTok, mật khẩu admin) **anh sẽ nhập qua một form bảo mật em gửi riêng, tuyệt đối KHÔNG dán vào khung chat**, không gửi qua Zalo, email hay ảnh chụp màn hình. Các mã này chỉ nằm trong phần “Secrets” của Cloudflare. Trình duyệt và trang web công khai không bao giờ nhìn thấy chúng, cũng không thấy token của shop.

---

## 1. Shopee Open Platform

### 1.1 Anh chuẩn bị
- Tài khoản **Shopee Seller Center của shop chính** (để đăng nhập xác minh).
- Một email và số điện thoại dùng cho tài khoản nhà phát triển.
- Giấy tờ, tùy loại hình kinh doanh:
  - **Hộ kinh doanh / cá nhân** → chọn loại **Individual Seller**: CCCD của chủ hộ (2 mặt), và **Giấy chứng nhận đăng ký hộ kinh doanh** nếu có.
  - **Công ty** → chọn loại **Registered Business Seller**: **Giấy chứng nhận đăng ký doanh nghiệp (GPKD)** và thông tin người đại diện.
  - ⚠️ Đừng chọn *Third-party Partner Platform (ISV)*. Loại đó dành cho công ty phần mềm bán app cho người khác, và thời gian duyệt khoảng 14 ngày. Shopee Việt Nam cũng không hỗ trợ “Individual 3rd Party”.

### 1.2 Các bước
1. Vào https://open.shopee.com → **Sign Up**, đăng ký bằng email và xác minh email.
2. Đăng nhập → **Console** → điền **Developer Profile** (hồ sơ nhà phát triển):
   - *Developer type*: **Individual Seller** hoặc **Registered Business Seller** (xem mục 1.1).
   - *Market / Region*: **Vietnam**.
   - Khi được hỏi, **đăng nhập tài khoản Seller Center của shop** để xác minh anh là chủ shop.
   - Tải giấy tờ lên → **Submit**.
3. Chờ duyệt hồ sơ (**tối đa 7 ngày làm việc**). Shopee sẽ gửi email báo kết quả.
4. Sau khi được duyệt → **Console → App List → Create App**:
   - *App type*: **Seller In House System**.
   - *App name*: ví dụ `Timikid Lai Lo`.
   - *Description*: “Công cụ nội bộ tính lãi lỗ, chỉ đọc thông tin shop và sản phẩm của chính shop.”
5. Mở app vừa tạo, ghi lại các thông tin sau:
   - **Test Partner ID** và **Test Partner Key**: dùng để thử nghiệm (sandbox).
   - Khi app được **Go Live** sẽ có **Live Partner ID** và **Live Partner Key**.
   - ⚠️ *Partner Key* là **mã bí mật**. Anh chỉ nhập mã này vào form bảo mật.
6. Ở mục **Redirect URL / Callback URL / Domain**, nhập địa chỉ sau:
   ```
   https://timikid-shop-connect.timikid-vn.workers.dev/oauth/shopee/callback
   ```
   (Nếu chỉ có ô *domain* thì nhập `timikid-shop-connect.timikid-vn.workers.dev`.)
7. Bấm **Go Live** (xin đưa app lên chính thức). Thường mất khoảng **24 giờ**.
8. Khi app đã Live, mở web app → **Chọn shop → Kết nối Shopee**. Trang chính thức của Shopee sẽ mở ra, anh đăng nhập shop và bấm **Xác nhận ủy quyền**. Có nhiều shop thì lặp lại cho từng shop.
   - Mỗi lần ủy quyền có hiệu lực tối đa **1 năm**. Hết hạn thì bấm Kết nối lại.

Nguồn: [Hướng dẫn Shopee – Đăng ký Open Platform](https://banhang.shopee.vn/edu/article/8450) · [Tạo app](https://banhang.shopee.vn/edu/article/8451) · [FAQ loại nhà phát triển](https://open.shopee.com/faq/107) · [Authorization & Authentication](https://open.shopee.com/documents/v2/v2.authentication)

---

## 2. TikTok Shop Partner Center

### 2.1 Anh chuẩn bị
- Tài khoản **TikTok Shop Seller Center (Việt Nam)** của shop, **đã xác minh**.

### 2.2 Các bước
1. Vào https://partner.tiktokshop.com → **Sign up / Log in**.
2. Chọn loại tài khoản **TikTok Shop Seller** (*nhà bán hàng tự phát triển*), **không chọn** *App & Service Provider*.
   - Đăng nhập bằng tài khoản Seller Center của shop. Seller đã xác minh thường được **duyệt tự động**.
3. Vào **App & Service → Create app → Custom App**:
   - *Target market / Region*: **Vietnam**.
   - *App name*: ví dụ `Timikid Lai Lo`.
   - *Category*: chọn mục gần nhất, ví dụ “Analytics” hoặc “ERP”.
4. Trong app → **Enable API** (bật API) và xin các quyền (*scopes*):
   - **Shop / Authorization**: lấy danh sách shop đã ủy quyền.
   - **Product (đọc)**: đọc danh sách và chi tiết sản phẩm.
   - App chỉ đọc, không cần quyền sửa đơn hay sửa sản phẩm.
5. Ở ô **Redirect URL (Callback URL)**, nhập:
   ```
   https://timikid-shop-connect.timikid-vn.workers.dev/oauth/tiktok/callback
   ```
6. Ghi lại các thông tin sau:
   - **App key**: không bí mật.
   - **App secret**: ⚠️ **mã bí mật**, chỉ nhập vào form bảo mật.
   - **Service ID**, nếu trang có hiện: không bí mật.
7. Nếu có nút **Publish / Submit for review** thì bấm. Custom App không lên App Store và chỉ dùng cho shop của anh.
8. Mở web app → **Chọn shop → Kết nối TikTok Shop** → đăng nhập → **Authorize**.

Nguồn: [Partner Center docs – Sign your API request](https://partner.tiktokshop.com/docv2/page/sign-your-api-request) · [Get Authorized Shops](https://partner.tiktokshop.com/docv2/page/get-authorized-shops-202309) · [Publish custom app](https://partner.tiktokshop.com/docv2/page/publish-custom-app) · [Seller authorization guide](https://partner.tiktokshop.com/docv2/page/seller-authorization-guide)

---

## 3. Cloudflare (máy chủ kết nối) — ✅ đã xong

- Tài khoản: Cloudflare của anh, gói Free. Tên miền phụ: `timikid-vn.workers.dev`.
- Worker `timikid-shop-connect` đang chạy tại https://timikid-shop-connect.timikid-vn.workers.dev.
- Kho KV `SHOPS` đã tạo. Khóa mã hóa `TOKEN_ENC_KEY` đã được sinh ngẫu nhiên và nạp thẳng vào Cloudflare Secrets. Không ai xem hay in khóa này ra.
- Đăng nhập do Worker riêng `timikid-auth` đảm nhận (https://timikid-auth.timikid-vn.workers.dev), dùng chung cho mọi app. Chỉ tài khoản **đã được admin duyệt** mới xem được dữ liệu shop.
- Token của shop (access/refresh token) được **mã hóa AES-256** trước khi lưu và tự **làm mới** trước khi hết hạn:
  - Shopee: token 4 giờ, refresh token 30 ngày.
  - TikTok: token khoảng 7 ngày.

## 4. Những gì anh gửi lại cho em

**Gửi trong chat được** (không bí mật):
- [ ] Đã duyệt hồ sơ Shopee chưa / app đã Live chưa.
- [x] **Shopee Partner ID**: đã nhận `2034752` (Live).
- [x] **TikTok App key**: đã nhận `6k3gnffonvbtq`.
- [x] **TikTok Service ID**: `7643091412851197713`.
- [x] **Redirect URL Domain** bên Shopee: `https://n8n.timikid.com` (qua relay n8n).
- [ ] Shop nào là **Mall** (sau khi kết nối anh cũng có thể tự bật/tắt công tắc Mall cạnh từng shop).

**Chỉ nhập qua form bảo mật, KHÔNG gửi trong chat:**
- [x] **Shopee Partner Key**: đã nạp.
- [x] **TikTok App secret**: đã nạp.
- [x] **Mật khẩu admin** (`ADMIN_PASSWORD` của Worker `timikid-auth`) cho tài khoản `duylinh30190@gmail.com`. Anh tự đặt, nên dài từ 14 ký tự.

Các khóa nội bộ (`TOKEN_ENC_KEY`, khóa ký phiên `AUTH_SIGNING_JWK`) đã được sinh ngẫu nhiên và nạp thẳng vào Cloudflare. Không ai cần xem.

---

## 5. Sau khi kết nối, app làm gì?

- **Chọn shop** → app tự chuyển sang đúng sàn (Shopee/TikTok) và đúng loại shop (Mall/thường).
- **Chọn sản phẩm** → app tự điền **giá bán** (giá thấp nhất nếu sản phẩm có nhiều phân loại) và **ngành hàng**, từ đó tự lấy % phí cố định theo biểu phí.
  - Nếu tên ngành trên sàn khác với biểu phí, app vẫn điền giá và báo để anh chọn ngành bằng tay.
- App **chỉ đọc**. Không sửa sản phẩm, không đụng tới đơn hàng.
- Muốn ngắt kết nối thì bấm **✕** cạnh shop.

---

## Phụ lục kỹ thuật (cho người cài đặt)

- Mã máy chủ: thư mục `worker/` (Cloudflare Worker). Biến môi trường ghi trong `worker/wrangler.toml`.
- Secrets: `TOKEN_ENC_KEY` (32 byte, base64), `SHOPEE_PARTNER_KEY`, `TIKTOK_APP_SECRET`.
- Vars (`wrangler.toml`): `SHOPEE_PARTNER_ID`, `TIKTOK_APP_KEY`, `TIKTOK_SERVICE_ID`, `AUTH_ISSUER`. Service binding `AUTH` trỏ tới Worker `timikid-auth`.
- Kiểm tra cấu hình Shopee (chỉ trả mã lỗi, không trả dữ liệu): `GET /api/diag/shopee`.
- Thử với sandbox Shopee: bỏ dấu `#` ở dòng `SHOPEE_HOST` trong `wrangler.toml` và dùng Test Partner ID/Key.
- Các lệnh (wrangler 4 cần Node ≥ 22):
  ```
  cd worker && npm i
  npx wrangler kv namespace create SHOPS      # dán id vào wrangler.toml
  openssl rand -base64 32 | npx wrangler secret put TOKEN_ENC_KEY
  npx wrangler secret put SHOPEE_PARTNER_KEY  # ... và TIKTOK_APP_SECRET
  npx wrangler deploy
  ```
- Frontend: đặt biến repo `SHOP_API_URL` (GitHub → Settings → Secrets and variables → Actions → Variables) bằng URL Worker, rồi chạy lại workflow deploy.

## Chọn sản phẩm từ shop Shopee (chỉ đọc)

- Bấm **Chọn shop → shop Shopee** → danh sách sản phẩm (đang bán + đang ẩn), tìm theo **tên hoặc SKU**, cuộn để tải thêm.
- Sản phẩm có phân loại → chọn phân loại (giá gốc → giá sau KM, tồn kho, SKU).
- **Giá bán** được điền bằng giá **sau khuyến mãi của shop** (`price_info.current_price`); ghi chú dưới ô giá hiện giá gốc → giá KM, % giảm, cảnh báo hết hàng / đang ẩn.
- **Ngành hàng** tự chọn theo `category_id` (đường dẫn tiếng Việt từ `product/get_category`) trên bảng phí Mall hoặc Shop thường. Không chắc chắn → mở bộ chọn ngành với gợi ý.
- Worker chỉ gọi API đọc: `product/get_item_list`, `search_item`, `get_item_base_info`, `get_model_list`, `get_item_promotion`, `get_category`.
- TikTok Shop: **tạm chưa hỗ trợ kết nối** (vẫn tính phí TikTok thủ công).
