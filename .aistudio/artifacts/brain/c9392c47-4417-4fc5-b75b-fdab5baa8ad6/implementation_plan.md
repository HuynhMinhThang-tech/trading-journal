# Nhật Ký Giao Dịch & Nghiên Cứu Hành Động Giá (Từ Email Daily Confirmation)

Ứng dụng quản lý nhật ký giao dịch cá nhân đọc trực tiếp báo cáo **Daily Confirmation** được gửi về **Gmail** mỗi ngày vào cuối phiên (23:59 giờ sàn), kết hợp bảng **Nghiên cứu phương pháp & hành động giá**, tính toán đầy đủ các chỉ số hiệu suất theo chuẩn tài liệu đặc tả, lưu trữ đồng bộ trên **Neon PostgreSQL** và cài đặt làm **PWA trên iPhone**.

---

## Quyết Định Đã Chốt & Điều Chỉnh Theo Yêu Cầu

> [!IMPORTANT]
> Đã cập nhật kiến trúc lấy dữ liệu theo đúng quy trình thực tế của bạn: **ứng dụng không kết nối trực tiếp tới hệ thống của sàn Vantage**, mà chỉ đọc email xác nhận cuối ngày từ **Gmail** của bạn.

- **Nguồn dữ liệu giao dịch duy nhất từ Email**:
  - Mỗi ngày vào lúc `23:59` (giờ báo cáo), nếu trong ngày có phát sinh lệnh (`Orders`) hoặc khớp lệnh (`Deals`), sàn sẽ gửi email `Daily Confirmation` về hộp thư Gmail của bạn (thường tới hộp thư khoảng ~08:00 sáng UTC+7 hôm sau).
  - Ứng dụng kết nối **Gmail API** (chỉ xin quyền đọc `gmail.readonly`) để tìm và đọc đúng email từ `support@vantagemarkets.com` với tiêu đề `"Daily Confirmation"`, có quét bù 7 ngày và chống trùng lặp.
  - Ngoài đồng bộ Gmail, vẫn hỗ trợ tải lên file `.eml` / `.html` hoặc dán nội dung email thủ công để nhập lại dữ liệu lịch sử cũ hoặc kiểm thử.
  - Ngày không có email sẽ hiển thị trạng thái *"Không có email xác nhận / Không phát sinh giao dịch hoặc chưa đồng bộ"*, tuyệt đối không tự ghi P/L bằng `0`.
- **Cơ sở dữ liệu**: **Neon PostgreSQL** (kết nối qua `DATABASE_URL` phía máy chủ Express) để đồng bộ xuyên suốt giữa máy tính và iPhone PWA.
- **Tính toán chuẩn xác theo bộ tài liệu**: Áp dụng đầy đủ mô hình tách biệt **Orders → Deals → Trades**, tính toán bằng thư viện thập phân (`decimal.js`) kết hợp `NUMERIC` trong PostgreSQL, có **Hàng đợi rà soát** cho các trường hợp thiếu Position ID gây mơ hồ, và giữ trung thực các chỉ số thiếu dữ liệu đầu vào (R-Multiple, MAE/MFE, Drawdown theo ngày).
- **Tab Nghiên cứu hành động giá & Phương pháp**: Nằm ở thanh điều hướng bên trái, lưu bảng quan sát (Mã, Ngày, Giờ, Khung thời gian, Phiên Á/Âu/Mỹ, Hành động giá, Nến, Bối cảnh/Tin tức, Độ tin cậy) để tổng hợp thói quen giá lặp lại.
- **Giao diện & Di động**: 100% Tiếng Việt, font Sans-serif hiện đại kiểu Claude (**Plus Jakarta Sans**) kèm số **JetBrains Mono** căn thẳng cột, nút chuyển đổi **Sáng / Tối**, và **PWA chuẩn iPhone**.

---

## 1. Tổng Quan & Quy Trình Dữ Liệu Thực Tế

### Luồng hoạt động hằng ngày
1. **Nhận email xác nhận trong Gmail**: Khi có giao dịch phát sinh trong ngày, email `Daily Confirmation` (`multipart/alternative` chứa `text/html` và `text/plain`) nằm trong Gmail của bạn.
2. **Đồng bộ & Phân tích xác định (Deterministic Parser)**:
   - Bấm **Đồng bộ Gmail** (hoặc tải file `.eml` / dán nội dung email). Bộ phân tích MIME + Cheerio HTML/Text đọc chính xác 5 khối dữ liệu: `Header`, `Orders`, `Deals`, `Positions`, `Working Orders` và `A/C Summary`.
   - Không sử dụng AI hay OCR để đọc con số tài chính nhằm đảm bảo độ chính xác tuyệt đối 100%.
   - Lưu nguyên bản `raw_time_text` (ví dụ `2026.10.22 23:59`) tách biệt với thời gian nhận thư của Gmail (`Date` header / `internalDate`), không tự suy đoán múi giờ máy chủ sàn nếu người dùng chưa cấu hình.
3. **Ghép lệnh & Tính toán chỉ số**:
   - Hệ thống đối chiếu số tổng (`Closed Trade P/L`, `Previous Balance → Balance`, `Commission`, `Swap`). Nếu có sai lệch, đánh dấu cảnh báo thay vì tự ý sửa số.
   - Các `Deals` (`in`, `out`, `inout`, `out_by`) được ghép thành `Trades` theo thuật toán FIFO (Account + Symbol + Side). Nếu tồn tại nhiều vị thế cùng mã cùng lúc gây mơ hồ, đưa vào **Hàng đợi rà soát** để bạn xác nhận thủ công.
4. **Ghi chép Nhật ký & Nghiên cứu hành động giá**:
   - Ghi nhật ký cho từng lệnh đã đóng (Chiến lược/Setup, Lý do vào/ra, Tâm lý, Mức độ tuân thủ kế hoạch, Bài học).
   - Ghi nhận độc lập các quan sát biểu đồ vào tab **Nghiên cứu hành động giá** để phát hiện thói quen giá theo từng mã, khung thời gian và phiên giao dịch.

---

## 2. Bộ Chỉ Số Tính Toán Theo Tài Liệu Đặc Tả

Mọi công thức chạy qua một lớp dịch vụ tính toán thống nhất phía máy chủ dùng số thập phân chính xác (`decimal.js`) để số liệu đồng nhất giữa Tổng quan, Lịch sử lệnh và Phân tích:

1. **Tách bạch thực thể**:
   - **Orders** (lệnh đặt, trạng thái `filled`, khối lượng yêu cầu/khớp `0.2 / 0.2`, S/L, T/P — lưu ý `0.00` là chưa đặt S/L/T/P) ≠ **Deals** (lần khớp thực tế `in` / `out`, commission, swap, profit) ≠ **Trades** (chu kỳ giao dịch suy luận từ tập hợp Deals).
   - Tuyệt đối không lấy số dòng Orders hay số dòng BUY/SELL làm Win Rate.
2. **Các chỉ số cốt lõi (Dashboard & Analytics)**:
   - **Net P/L (Lãi/Lỗ ròng)**: Tổng lợi nhuận đã thực hiện sau khi tính đầy đủ `profit + commission + swap`.
   - **Gross Profit & Gross Loss**: Tổng lãi của các Trade thắng và trị tuyệt đối tổng lỗ của các Trade thua (chỉ tính trên các Trade đã ghép hoàn chỉnh `resolved`).
   - **Win Rate (Tỷ lệ thắng)**: `Số Trade thắng / Tổng số Trade đã đóng hoàn chỉnh` (tách riêng các Trade `ambiguous`/`unmatched` để không làm sai lệch tỷ lệ thắng).
   - **Profit Factor**: `Gross Profit / Gross Loss` (hiển thị `∞` hoặc `N/A` có chú thích nếu `Gross Loss = 0`, không chia cho 0).
   - **Expectancy (Kỳ vọng mỗi lệnh)**: `Tổng Net P/L / Số Trade đã đóng hoàn chỉnh`.
   - **Average Win / Average Loss & Holding Time**: Trung bình lãi/lỗ và thời gian giữ lệnh trung bình theo từng mã, chiều (`BUY`/`SELL`), ngày/tuần/tháng, chiến lược.
   - **Chuỗi thắng / thua liên tiếp (Consecutive Wins/Losses)**.
   - **Đường cong vốn (Equity / Balance Curve) & Lịch P/L theo ngày**: Xây dựng từ `account_snapshots` và các Trade đã đóng.
   - **Max Observed Daily Drawdown**: Tính từ chuỗi snapshot Equity/Balance theo ngày, gắn nhãn rõ đây là *mức sụt giảm quan sát giữa các báo cáo ngày* (không phải intraday drawdown).
3. **Minh bạch giới hạn dữ liệu**:
   - **R-Multiple**: Hiển thị *"Chưa đủ dữ liệu"* khi lệnh trong email có `S/L = 0.00` hoặc thiếu quy chuẩn hợp đồng để quy đổi rủi ro ban đầu.
   - **MAE / MFE**: Hiển thị *"Chưa đủ dữ liệu"* vì email cuối ngày không chứa dữ liệu biến động giá từng phút/tick trong suốt thời gian giữ lệnh.

---

## 3. Trải Nghiệm Người Dùng, Giao Diện & iPhone PWA

### Hệ thống chữ & Giao diện Sáng / Tối phong cách Claude
- **Font chữ**: **Plus Jakarta Sans** cho toàn bộ giao diện tiếng Việt rõ ràng, hiện đại và thân thiện kiểu Claude; **JetBrains Mono** (`tabular-nums`) cho mọi số tiền, giá, khối lượng, mã Ticket và thời gian để các cột số luôn thẳng hàng.
- **Nút chuyển đổi Sáng / Tối**: Gắn cố định dễ bấm trên thanh bên (Desktop) và thanh đầu (Mobile).
  - *Chế độ Sáng*: Nền trắng ngà ấm (`#FAF9F5`), bề mặt thẻ trắng (`#FFFFFF`), đường kẻ mảnh (`#E7E5E0`), chữ than chì (`#1C1B18`).
  - *Chế độ Tối*: Nền than ấm (`#181715`), bề mặt thẻ (`#22211E`), đường kẻ (`#32302B`), chữ sáng dịu mắt (`#F2EFE9`).
  - *Màu nhấn & Ngữ nghĩa*: Điểm nhấn đất nung tinh tế (`#C96442`), Lãi (`#15803D` / `#22C55E`) và Lỗ (`#B91C1C` / `#EF4444`) luôn đi kèm dấu `+/-` và nhãn chữ tiếng Việt.

### Thanh điều hướng bên trái (Desktop) & Thanh dưới cùng (iPhone PWA)
1. **Tổng quan**: KPI chính có tooltip giải thích công thức, đường cong vốn, lịch P/L theo ngày, P/L theo mã/chiều lệnh, trạng thái đồng bộ Gmail & số mục cần rà soát.
2. **Giao dịch (Trades)**: Bảng lọc/tìm kiếm/sắp xếp các Trade đã ghép; bấm vào để mở ngăn chi tiết xem Orders/Deals nguồn và điền **Nhật ký giao dịch** (Setup, Thesis, Cảm xúc, Tuân thủ, Bài học).
3. **Nghiên cứu giá**: Bảng ghi nhận quan sát hành động giá & phương pháp (Mã quan sát, Ngày, Giờ, Khung thời gian, Phiên Á/Âu/Mỹ, Hành động giá, Đặc điểm nến, Bối cảnh/Tin tức, Độ tin cậy) kèm khối **Tổng hợp thói quen giá** tự đếm tần suất theo bộ lọc.
4. **Phân tích chuyên sâu**: So sánh hiệu suất theo Mã, Chiều lệnh, Phiên, Chiến lược/Thẻ, chuỗi thắng/thua và phân bố thời gian giữ lệnh (luôn hiển thị cỡ mẫu `n`).
5. **Lệnh & Khớp lệnh**: Xem tách riêng bảng **Orders** và bảng **Deals** nguyên bản từ email (Ticket, Order Ref, Entry `in`/`out`, Commission, Swap, Profit).
6. **Hàng đợi rà soát**: Xử lý các Deal `unmatched`/`ambiguous` hoặc cảnh báo đối chiếu Summary, cho phép ghép thủ công và xem trước tác động lên P/L trước khi lưu.
7. **Nhập từ Gmail & Email**: Nút kết nối/đồng bộ Gmail (`from:support@vantagemarkets.com subject:"Daily Confirmation"`), tải lên `.eml`, dán nội dung email văn bản/HTML, lịch sử các lần nhập và trạng thái từng email.
8. **Cài đặt**: Cấu hình tài khoản giao dịch, múi giờ hiển thị/múi giờ sàn (`Unknown` nếu chưa rõ), định nghĩa phiên Á/Âu/Mỹ, kiểm tra kết nối Neon PostgreSQL, xuất CSV/JSON và cài đặt **PWA trên iPhone**.

### Tối ưu cho iPhone PWA
- Thanh điều hướng dưới cùng trên màn hình nhỏ (4 tab nhanh + menu mở rộng) giữ chiều cao ≤ 15% màn hình, vùng chạm ≥ 44×44px để thao tác một tay thoải mái.
- Tích hợp `manifest.webmanifest`, bộ icon PNG chuẩn (180×180 Apple Touch Icon, 192×192, 512×512), Service Worker chỉ cache tài nguyên tĩnh (tuyệt đối không cache API dữ liệu tài chính ở public cache) và hộp thoại hướng dẫn cài đặt từng bước trên iOS Safari.

---

## 4. Kiến Trúc Kỹ Thuật & Lưu Trữ Neon PostgreSQL

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    TRÌNH DUYỆT (Desktop & iPhone PWA)                   │
│  [Tổng quan] [Giao dịch] [Nghiên cứu giá] [Phân tích] [Gmail & Cài đặt] │
│        ▲                                                   │            │
│        │ (Chỉ gọi API nội bộ & Bearer Token Gmail)         ▼            │
└────────┼───────────────────────────────────────────────────┼────────────┘
         │                                                   │
         ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  MÁY CHỦ EXPRESS API & NGHIỆP VỤ (server.ts)            │
│  ┌────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│  │ MIME + HTML + Text │  │ FIFO Trade Matcher  │  │ Analytics Engine │  │
│  │ Statement Parser   │  │ & Review Queue      │  │ (decimal.js)     │  │
│  └─────────┬──────────┘  └──────────┬──────────┘  └────────┬─────────┘  │
│            └────────────────────────┼──────────────────────┘            │
│                                     ▼                                   │
│                 Drizzle ORM (NUMERIC(20,8) / NUMERIC(24,10))            │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NEON POSTGRESQL DATABASE                        │
│  • trading_accounts     • statement_imports    • sync_logs              │
│  • orders               • deals                • account_snapshots      │
│  • trades               • trade_deal_allocs    • review_items           │
│  • journal_entries      • price_observations   • tags                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Lưu ý vận hành môi trường AI Studio
- **Neon PostgreSQL**: Máy chủ Express kết nối tới Neon qua biến môi trường `DATABASE_URL` (sử dụng Drizzle ORM + PostgreSQL `NUMERIC`). Nếu người dùng chưa điền `DATABASE_URL` trong Secrets, ứng dụng vẫn khởi chạy an toàn và hiển thị hướng dẫn cấu hình trong mục Cài đặt (không tự tạo dữ liệu giả).
- **Gmail OAuth**: Sử dụng luồng xác thực Google phía trình duyệt (xin đúng scope `https://www.googleapis.com/auth/gmail.readonly`), gửi access token qua header `Authorization: Bearer` về API backend để quét email từ `support@vantagemarkets.com` (`Daily Confirmation`, 7 ngày gần nhất hoặc tùy chỉnh), giải mã MIME và lưu chống trùng lặp theo `gmail_message_id` + số `ticket`.
