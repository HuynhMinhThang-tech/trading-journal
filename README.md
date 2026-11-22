<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c9392c47-4417-4fc5-b75b-fdab5baa8ad6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Đồng bộ Gmail tự động

Ứng dụng đọc email **Daily Confirmation** của Vantage (`from:support@vantagemarkets.com`) hoàn toàn phía máy chủ,
không cần đăng nhập hay bấm nút trên trình duyệt:

- **Vercel Cron** gọi `/api/cron/gmail-sync` mỗi ngày lúc 01:00 UTC (= 08:00 giờ Việt Nam), chỉ quét email nhận từ 00:00 hôm qua (giờ Việt Nam) trở đi, tức báo cáo ngày T-1; email đã xử lý được bỏ qua — xem `vercel.json`.
- Ứng dụng không còn tự quét khi mở; muốn lấy ngay thì vào **Đồng bộ & Cài đặt → Đồng bộ ngay** (mặc định chỉ quét hôm qua, T-1).
- Mọi lần quét đều chống trùng theo ID email và checksum nên chạy lặp lại là an toàn.

### Cấu hình một lần

1. [Google Cloud Console](https://console.cloud.google.com/) → chọn project → **APIs & Services → Library** → bật **Gmail API**.
2. **OAuth consent screen**: thêm scope `https://www.googleapis.com/auth/gmail.readonly`, thêm Gmail của bạn vào *Test users*,
   rồi chuyển **Publishing status** sang **In production**.
   (Nếu để *Testing*, Google sẽ tự thu hồi Refresh Token sau 7 ngày.)
3. **Credentials → Create credentials → OAuth client ID** → loại **Web application** →
   *Authorized redirect URIs*: `https://developers.google.com/oauthplayground`. Lưu lại **Client ID** và **Client secret**.
4. Mở [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → biểu tượng bánh răng →
   tick **Use your own OAuth credentials** → dán Client ID / Client secret →
   ở ô scope nhập `https://www.googleapis.com/auth/gmail.readonly` → **Authorize APIs** (đăng nhập đúng Gmail nhận email Vantage) →
   **Exchange authorization code for tokens** → sao chép **Refresh token**.
5. Trên Vercel (**Settings → Environment Variables**) hoặc file `.env.local` khi chạy local, đặt:
   `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (và tùy chọn `CRON_SECRET`), rồi **Redeploy**.

Vào tab **Đồng bộ & Cài đặt → Gmail tự động** để thấy trạng thái kết nối, hoặc bấm **Đồng bộ ngay** để quét bù lịch sử.
Nếu Refresh Token hết hạn / bị thu hồi, tab này sẽ hiện lỗi — chỉ cần lặp lại bước 4 và cập nhật `GMAIL_REFRESH_TOKEN`.

> Thư viện `firebase` không còn được dùng. Bạn có thể gỡ bằng `npm uninstall firebase`.

## Ảnh đính kèm (Nhật ký giao dịch và Nghiên cứu hành động giá)

Mỗi lệnh trong **Nhật ký giao dịch** và mỗi bản ghi trong **Nghiên cứu hành động giá** có thể đính kèm ảnh
(ví dụ ảnh chụp biểu đồ lúc vào/ra lệnh). Ảnh được lưu **trong chính database Neon**, nên không cần dịch vụ lưu trữ nào khác.

- Chỉ nhận **JPEG, PNG, WebP, GIF**. Máy chủ nhận dạng theo nội dung file (không tin đuôi file), SVG và mọi định dạng khác bị từ chối.
- Tối đa **10 ảnh** mỗi lệnh / mỗi quan sát, mỗi ảnh tối đa **4 MB**. Ảnh có cạnh dài hơn 2400 px hoặc nặng hơn 1,5 MB được tự thu nhỏ/nén (WebP) trước khi tải lên.
- Thêm ảnh bằng nút **Thêm ảnh**, kéo thả, hoặc dán ảnh chụp màn hình bằng **Ctrl+V**. Bấm vào ảnh để xem phóng to; nút **×** để xóa.
- Trong Nhật ký giao dịch, ảnh được lưu/xóa ngay. Trong form Nghiên cứu, ảnh chỉ được lưu/xóa khi bấm **Lưu** (bấm **Hủy** thì bỏ hết thay đổi).
- Xóa một quan sát cũng xóa luôn ảnh của nó.

### Cập nhật database

Tính năng này thêm bảng `image_attachments`. Ứng dụng **tự tạo bảng khi khởi động** (`CREATE TABLE IF NOT EXISTS`),
nên sau khi deploy bạn không cần làm gì thêm. Nếu muốn tự chạy hoặc kiểm tra, dùng file
[`db/migrations/001_image_attachments.sql`](db/migrations/001_image_attachments.sql) trong **Neon → SQL Editor** (chạy lặp lại an toàn).

Lưu ý: file xuất JSON/CSV/ZIP chỉ gồm thông tin ảnh (tên, dung lượng, thuộc lệnh/quan sát nào), không gồm nội dung ảnh.
Ảnh chiếm dung lượng database (gói Neon miễn phí là 0,5 GB); xem dung lượng đang dùng bằng câu lệnh trong cuối file migration.
