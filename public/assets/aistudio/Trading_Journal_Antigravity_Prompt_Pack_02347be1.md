# Trading Journal – Antigravity App Prompt Pack

Bộ hướng dẫn và prompt triển khai ứng dụng Trading Journal cá nhân, sử dụng Google Antigravity App (desktop), GitHub, Next.js, Vercel, Neon PostgreSQL và Gmail API.

> **Cách sử dụng:** Mở project trong Antigravity App, sau đó gửi từng prompt theo đúng thứ tự. Không gửi tất cả prompt một lần. Sau mỗi giai đoạn, kiểm tra kết quả, chạy test và commit Git trước khi chuyển sang giai đoạn kế tiếp.

---

# A. Quyết định kiến trúc mặc định

Đây là các giả định được dùng trong bộ prompt. Agent phải ghi lại chúng trong tài liệu dự án và không tự ý đổi công nghệ nếu chưa nêu lý do và xin xác nhận.

| Hạng mục | Quyết định ban đầu |
|---|---|
| Mục đích | Trading Journal cá nhân, theo dõi lịch sử giao dịch và hiệu suất |
| Trải nghiệm | Web responsive + PWA có thể cài lên điện thoại/máy tính; chưa làm native App Store/Google Play ở V1 |
| Frontend/backend | Next.js App Router + TypeScript; API và xử lý nghiệp vụ chạy server-side |
| Database | Neon PostgreSQL |
| ORM/migrations | Drizzle ORM |
| Hosting | Vercel |
| Source control | Git + GitHub |
| Email | Gmail API, OAuth 2.0 server-side, chỉ đọc email |
| Parser | HTML/MIME parser xác định bằng code, không dùng OCR hoặc AI để đọc số |
| Đồng bộ | Một lần mỗi ngày, cộng khả năng bấm Sync now và backfill nhiều ngày |
| Giao diện | Hiện đại, tối giản, cao cấp; hỗ trợ Dark/Light Mode; ưu tiên desktop nhưng responsive trên mobile |
| Người dùng | Cá nhân trước; thiết kế database có user_id để có thể mở rộng multi-user sau này |
| Broker/Account | Bắt đầu với Vantage/MetaTrader Statement; thiết kế để hỗ trợ nhiều tài khoản và symbol |

## Dữ liệu đầu vào đã xác định từ file Daily Confirmation.eml

Email mẫu được gửi từ `support@vantagemarkets.com`, tiêu đề `Daily Confirmation`. MIME là `multipart/alternative`, chứa `text/plain` và `text/html`. Statement nằm trực tiếp trong phần HTML của email; không phải PDF/Excel đính kèm. HTML do MetaQuotes tạo ra và có cấu trúc bảng chứa Orders, Deals, Positions, Working Orders và A/C Summary.

Các trường thực tế trong mẫu:

- Orders: Open Time, Ticket, Type, Size, Item, Price, S/L, T/P, Time, State, Comment.
- Deals: Open Time, Ticket, Type, Size, Item, Price, Order, Comment, Entry, Commission, Swap, Profit.
- Account Summary: Closed Trade P/L, Deposit/Withdrawal, Total Credit Facility, Round Commission, Instant Commission, Additional Operations, Total, Previous Ledger Balance, Previous Equity, Balance, Equity, Floating P/L, Margin Requirements, Available Margin.
- Giá trị Entry quan sát được trong file mẫu: `in`, `out`.
- Ví dụ: 2 Orders, 2 Deals; Deal IN ở 30753.10 và Deal OUT ở 30773.90; P/L đóng là 4.16 USD; Balance thay đổi từ 18.33 lên 22.49 USD.

Lưu ý thời gian: report timestamp trong HTML là `2026.10.14 23:59`, nhưng Date header của email là `2026-10-15 01:00:33 UTC`, tương đương khoảng `08:00:33` ngày 15/10/2026 theo múi giờ UTC+7. Vì vậy không giả định email đến ngay lúc 23:59. Lịch đồng bộ mặc định là 10:00 Asia/Ho_Chi_Minh (03:00 UTC), có quét bù ít nhất 7 ngày và deduplicate.

## Nguyên tắc dữ liệu quan trọng

1. Lưu Orders và Deals như dữ liệu nguồn độc lập, bất biến; không coi mỗi Order là một Trade.
2. Một Order có thể tạo nhiều Deal; một Trade có thể gồm nhiều Deal mở/đóng, partial close hoặc reversal.
3. File HTML mẫu không thể hiện Position ID. Vì vậy ghép Deal thành Trade trong các trường hợp có nhiều vị thế cùng symbol có thể mơ hồ. Phải có trạng thái `matched`, `partial`, `unmatched`, `ambiguous` và giao diện xử lý thủ công. Không âm thầm ghép sai.
4. Không tính R-Multiple nếu không có rủi ro ban đầu/SL thực tế và thông tin contract phù hợp. Không tính MAE/MFE nếu không có dữ liệu giá trong suốt thời gian giữ lệnh.
5. Max Drawdown từ các báo cáo ngày chỉ là mức sụt giảm quan sát được giữa các snapshot, không phải intraday max drawdown.
6. Không có email Statement không đồng nghĩa với P/L bằng 0. Có thể không phát sinh giao dịch hoặc email chưa đến.
7. Lưu timestamp gốc và múi giờ tách biệt. Không tự suy đoán múi giờ server của broker từ report timestamp.
8. Tất cả tiền và giá dùng PostgreSQL NUMERIC/Decimal, không dùng floating-point JavaScript để tính tài chính.

---

# B. Chuẩn bị trong Antigravity App

1. Tạo một thư mục project trên máy, ví dụ `trading-journal`.
2. Mở Google Antigravity **App** (ứng dụng desktop), tạo Project mới hoặc Open Project/Folder và chọn thư mục trên.
3. Chỉ cấp quyền cho agent làm việc trong thư mục project. Giữ chế độ hỏi quyền trước khi chạy terminal command; không bật Full Machine/Unrestricted chỉ để tiện.
4. Nếu đã có GitHub repository trống, clone repository vào thư mục project trước. Nếu chưa có, cho agent khởi tạo Git local; tạo GitHub repo và thêm remote ở bước Git.
5. Copy file `Daily Confirmation.eml` vào `samples/private/` trong project để agent kiểm tra parser. Thư mục này phải được `.gitignore`; không commit email gốc vì có thông tin tài khoản/email cá nhân. Yêu cầu agent tạo fixture đã khử thông tin cá nhân để commit và dùng cho automated tests.
6. Mở một conversation gắn với Project. Gửi Prompt 0 trước, sau đó Prompt 1, 2... theo thứ tự.
7. Không dán API key, OAuth client secret, database password hoặc refresh token vào cửa sổ chat. Tự thêm các giá trị này vào `.env.local` và Vercel Environment Variables.
8. Sau mỗi prompt, xem diff, kết quả test và yêu cầu agent giải thích các thay đổi chưa rõ. Chỉ sang bước tiếp khi giai đoạn hiện tại đạt tiêu chí nghiệm thu.

---

# PROMPT 0 — Vai trò, quy tắc làm việc và khảo sát workspace

```text
Bạn là Principal Software Engineer, Product Architect và QA Lead chịu trách nhiệm xây dựng một ứng dụng Trading Journal production-ready cho tôi.

Tôi đang sử dụng Google Antigravity App bản desktop, không phải chỉ dùng editor plugin. Hãy làm việc trực tiếp trong Project/Workspace hiện tại.

Mục tiêu sản phẩm:
- Xây dựng Trading Journal cá nhân dùng được trên Web và điện thoại.
- V1 là responsive web + PWA có thể cài lên màn hình điện thoại; chưa cần native App Store/Google Play. Thiết kế backend/API để có thể bổ sung React Native/Expo sau này mà không viết lại nghiệp vụ.
- Tự động lấy Daily Confirmation từ Gmail của Vantage Markets, đọc HTML body, trích xuất dữ liệu giao dịch, lưu vào Neon PostgreSQL, tính metrics và cập nhật dashboard.
- Người dùng có thể bổ sung nhật ký thủ công: setup, lý do vào/ra lệnh, cảm xúc, mức độ tuân thủ kế hoạch, bài học và ảnh chart (ảnh có thể để phase sau).
- Quản lý source code bằng Git/GitHub, deploy bằng Vercel.

Công nghệ mặc định:
- Next.js App Router, TypeScript.
- Tailwind CSS và shadcn/ui hoặc component system tương đương.
- Neon PostgreSQL + Drizzle ORM.
- Zod cho validation.
- Recharts hoặc thư viện chart tương thích React/Next.js.
- Vitest cho unit/integration test; Playwright cho E2E.
- Gmail API qua OAuth 2.0 server-side, scope chỉ đọc Gmail.
- Vercel Cron cho sync một lần/ngày; manual Sync Now.

Quy tắc bắt buộc:
1. Trước tiên kiểm tra workspace, file hiện có, Git status, package manager và cấu trúc repository. Không ghi đè hoặc xóa file hiện tại nếu chưa hiểu chúng.
2. Nếu repo đã có code, giữ nguyên cấu trúc và tích hợp phù hợp; không scaffold đè lên.
3. Không tự ý đổi Next.js/Neon/Vercel/GitHub/Gmail API sang Firebase, Supabase hoặc dịch vụ khác.
4. Không dùng AI/OCR để đọc con số trong Statement. Parser phải deterministic bằng MIME + HTML parser.
5. Không hardcode secret, API key, email cá nhân, số tài khoản, token hoặc password. Không log access token, refresh token, raw email hay dữ liệu tài chính nhạy cảm.
6. Không dùng float để tính tiền. Dùng Decimal/Numeric.
7. Không giả định một Order là một Trade. Orders, Deals và Trades là ba thực thể khác nhau.
8. Không đoán dữ liệu thiếu. Gắn trạng thái unknown/unmatched/ambiguous và giải thích.
9. Bảo vệ ứng dụng vì đây là dữ liệu tài chính cá nhân. Mọi trang/API/cron phải có kiểm soát xác thực và phân quyền thích hợp.
10. Mỗi giai đoạn phải có test, tiêu chí nghiệm thu, cập nhật tài liệu và dừng lại chờ tôi gửi prompt tiếp theo. Không tự động nhảy sang phase tiếp theo.
11. Trước khi dùng thư viện/version hoặc API bên ngoài, kiểm tra tài liệu chính thức hiện hành và chọn phiên bản stable tương thích. Không tự tạo API hoặc prop không tồn tại.
12. Ưu tiên code rõ ràng, module hóa, typed, có error handling và logging an toàn.

Hành động ở prompt này:
- Chỉ khảo sát workspace và xác định những gì đã có.
- Tạo `docs/PRODUCT_BRIEF.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/IMPLEMENTATION_PLAN.md` và `docs/ASSUMPTIONS_AND_RISKS.md`.
- Ghi rõ quyết định V1 là Responsive Web + PWA, cá nhân trước, Gmail polling daily, Neon + Vercel.
- Ghi rõ các rủi ro: Gmail OAuth restricted scope/testing token expiry; email report timezone khác email received time; thiếu Position ID khiến trade matching đôi khi mơ hồ; daily snapshots không phải intraday drawdown.
- Chưa viết code ứng dụng ở prompt này.
- Báo cáo lại: phát hiện workspace, các tài liệu đã tạo, quyết định kiến trúc và các câu hỏi thực sự cần chủ dự án xác nhận.
```

---

# PROMPT 1 — Đặc tả sản phẩm và thiết kế UX/UI

```text
Dựa trên `docs/PRODUCT_BRIEF.md`, hãy hoàn thiện đặc tả sản phẩm và thiết kế UX/UI cho Trading Journal.

Đối tượng sử dụng: một trader cá nhân muốn theo dõi chất lượng giao dịch, hiệu suất chiến lược và hành vi thực thi; không chỉ xem số tiền lãi/lỗ.

Các module bắt buộc:
1. Overview Dashboard
   - Tổng Net P/L, Gross Profit, Gross Loss, Win Rate, Profit Factor, Expectancy, số Trade đã đóng.
   - Equity/Balance curve theo thời gian.
   - P/L calendar theo ngày.
   - P/L theo symbol, side, session và khoảng thời gian.
   - Drawdown được ghi rõ là observed daily drawdown nếu chỉ có daily snapshots.
   - Widget tình trạng Gmail connection, lần sync gần nhất, số Statement đã import, số lỗi/record cần review.
   - Bộ lọc Date range, Account, Symbol.
2. Trade History
   - Bảng Trade đã ghép, có ngày/giờ, symbol, side, size, entry, exit, holding time, gross/net P/L, status matching.
   - Tìm kiếm, lọc, sort, pagination.
   - Mở Trade Detail để xem các Deals/Orders nguồn liên quan và dữ liệu Statement gốc đã parse.
3. Deals & Orders
   - Xem riêng Orders và Deals; không gộp thành một khái niệm.
   - Hiển thị raw ticket, order reference, entry type IN/OUT, commission, swap, profit.
4. Trading Diary
   - Ghi setup/strategy, thesis/lý do vào lệnh, điều kiện thị trường, planned entry/SL/TP, exit reason, cảm xúc trước/trong/sau lệnh, rule adherence, mistake tags, lesson learned.
   - Không tự động bịa nội dung nhật ký từ Statement. Phần thiếu phải để trống để người dùng nhập.
5. Analytics
   - Win rate, average win/loss, profit factor, expectancy, net/gross P&L, consecutive wins/losses, holding time, drawdown.
   - So sánh theo symbol, side, ngày/tuần/tháng, session, strategy/tag.
   - Chỉ hiển thị metrics khi sample size phù hợp; luôn hiển thị số lượng mẫu.
   - R-Multiple, MAE, MFE hiển thị Not enough data/Not available cho đến khi có dữ liệu đầu vào cần thiết.
6. Imports & Integrations
   - Connect Gmail, Disconnect Gmail, Sync Now.
   - Lịch sử sync/import; trạng thái Success, No new email, Partial, Failed, Needs review.
   - Import email chỉ từ sender `support@vantagemarkets.com`, subject `Daily Confirmation` và kiểm tra account/report fields.
   - Import thủ công `.eml` để test hoặc khôi phục dữ liệu.
7. Settings
   - Trading accounts, currency, broker, display timezone, broker/server timezone (có thể để Unknown), session definitions.
   - Gmail integration status.
   - Export dữ liệu CSV/JSON; chức năng xóa/backup phải có xác nhận.

Thiết kế:
- Modern premium, clean, understated, mature; không giống một casino/crypto hype dashboard.
- Hỗ trợ Dark Mode và Light Mode.
- Desktop có sidebar điều hướng, header với date range/user menu; mobile có navigation gọn và cards xếp dọc.
- Typography rõ, khoảng trắng hợp lý, số tài chính dễ đọc, màu xanh/đỏ dùng tiết chế và có nhãn/chú giải, không chỉ dựa vào màu.
- Tránh nhồi quá nhiều card hoặc chart trên Overview.
- Empty state phải giải thích vì sao chưa có dữ liệu và hướng dẫn kết nối Gmail/import Statement.
- Loading, error, no data, partial data và stale data phải có trạng thái riêng.
- Dùng mock data chỉ cho development, đánh dấu rõ; không để mock data xuất hiện như dữ liệu thật sau khi kết nối DB.

Hãy tạo:
- `docs/PRD.md` với user stories, scope V1/V2, acceptance criteria.
- `docs/UX_SPEC.md` với sitemap, user flows, layout desktop/mobile và trạng thái UI.
- `docs/DESIGN_SYSTEM.md` với màu, typography, spacing, component guidelines, chart rules.
- Wireframe mô tả bằng Markdown hoặc sơ đồ Mermaid nếu hữu ích.

Chưa xây backend hoặc kết nối Gmail. Sau khi hoàn tất, trình bày sitemap và các quyết định UX cần duyệt rồi dừng.
```

---

# PROMPT 2 — Khởi tạo ứng dụng và cấu trúc repository

```text
Bắt đầu triển khai nền tảng theo PRD đã được duyệt. Trước khi tạo file, kiểm tra trạng thái Git và giữ mọi thay đổi hiện có.

Yêu cầu kỹ thuật:
- Next.js App Router + TypeScript strict mode.
- Tailwind CSS và shadcn/ui (hoặc component primitives được duy trì tốt).
- Drizzle ORM + Neon PostgreSQL.
- Zod validation.
- Recharts cho chart nếu tương thích.
- Vitest + Testing Library; Playwright cho E2E.
- PWA cơ bản: manifest, app icons placeholder, installability, theme color, service worker strategy an toàn. Không cache private API response hoặc dữ liệu trading nhạy cảm trong cache public/offline.
- ESLint + Prettier hoặc formatter nhất quán.

Cấu trúc module đề xuất (được phép điều chỉnh nếu có lý do):
- `src/app/` routes, layouts, route handlers.
- `src/components/` shared UI.
- `src/features/dashboard/`
- `src/features/trades/`
- `src/features/deals/`
- `src/features/journal/`
- `src/features/analytics/`
- `src/features/integrations/gmail/`
- `src/features/imports/`
- `src/lib/auth/`, `src/lib/db/`, `src/lib/email/`, `src/lib/parser/`, `src/lib/analytics/`, `src/lib/security/`, `src/lib/utils/`.
- `drizzle/` migrations.
- `tests/fixtures/` chỉ chứa fixture đã sanitize.
- `docs/` tài liệu.

Yêu cầu giao diện ban đầu:
- Tạo shell/layout, sidebar, header, theme switcher, responsive navigation.
- Tạo route placeholder cho Overview, Trades, Deals, Journal, Analytics, Imports, Settings.
- Không dùng dữ liệu giả trong production. Nếu cần mock cho UI, tạo rõ `demo mode` hoặc fixture chỉ trong môi trường development/test.

Yêu cầu bảo mật:
- Tạo `.env.example` chỉ chứa tên biến và placeholder.
- `.gitignore` phải loại `.env*` nhưng cho phép `.env.example`, loại `.eml`, raw exports, local DB files, build artifacts.
- Không ghi secret vào source code.
- Tạo server-only module cho biến môi trường nhạy cảm; không đưa vào client bundle.

Tài liệu:
- `README.md` hướng dẫn local development.
- `docs/ENVIRONMENT_VARIABLES.md` mô tả từng biến và nơi lấy.
- `docs/LOCAL_SETUP.md` hướng dẫn Windows/macOS.

Kiểm tra:
- Cài package bằng package manager được chọn.
- `typecheck`, `lint`, `test`, `build` phải chạy được.
- Không chuyển sang bước tiếp theo nếu có lỗi chưa giải quyết.
- Dừng lại sau khi scaffold và báo cáo command/test kết quả.
```

---

# PROMPT 3 — Thiết kế Neon PostgreSQL và Drizzle schema

```text
Thiết kế và triển khai database schema cho Trading Journal. Đọc PRD và đặc tả Parser trước khi làm.

Dùng Neon PostgreSQL + Drizzle ORM. Tạo migrations có thể chạy lặp an toàn và tài liệu ERD.

Các thực thể tối thiểu:
1. `users`
2. `trading_accounts` — broker, account label, account number được lưu an toàn/che bớt khi hiển thị, currency, account type, server timezone nullable, display timezone.
3. `broker_connections` — broker integration metadata.
4. `gmail_connections` — Gmail email, encrypted refresh token, scopes, status, token updated_at, connected_at. Không lưu plaintext refresh token.
5. `gmail_sync_states` — last successful sync, history cursor nếu có, last attempted time, next scheduled time.
6. `email_messages` — Gmail message_id unique, thread_id, sender, subject, received_at, internal_date, import status, error code; không lưu nội dung nhạy cảm dư thừa.
7. `statement_imports` — email_message_id, trading_account_id, report timestamp raw, report date, currency, parser version, raw_html (chỉ nếu thực sự cần lưu; giới hạn quyền đọc), status, warnings, checksum.
8. `orders` — broker ticket unique theo account, open_time_raw, normalized timestamp nullable, type, size_requested/filled nếu parse được, symbol, price_mode/price, sl, tp, execution_time, state, comment, source import.
9. `deals` — deal ticket unique theo account, order_ticket, time_raw, normalized timestamp nullable, type, volume, symbol, price, entry (`in`, `out`, `inout`, `out_by` nếu phát hiện), commission, swap, profit, raw payload JSONB, source import.
10. `account_snapshots` — report date/time, previous ledger balance, previous equity, balance, equity, floating P/L, margin requirements, available margin, closed trade P/L, deposits/withdrawals, credit, commissions, additional operations, total, currency.
11. `trade_groups` hoặc `trades` — một chu kỳ giao dịch được suy luận từ deals; side, symbol, open/close time, volume, entry/exit price nếu xác định, gross/net P&L, holding time, matching status, matching method, confidence, review notes.
12. `trade_deal_allocations` — liên kết deals với trade group, phân bổ volume/P&L nếu cần cho partial close.
13. `journal_entries` — note/strategy/thesis/exit reason/emotions/rule adherence/lessons; gắn với trade group và user.
14. `tags` và `trade_tags`.
15. `import_errors` hoặc `review_items` — lỗi parse, deal unmatched, ambiguous pairing.

Nguyên tắc:
- Primary key dùng UUID/ULID; foreign key rõ ràng.
- Dùng `NUMERIC(24, 10)` hoặc precision phù hợp cho volume/prices; tiền dùng NUMERIC(20, 8) hoặc precision phù hợp. Không dùng REAL/DOUBLE cho tài chính.
- Lưu `raw_time_text` cùng timestamp đã chuẩn hóa. Khi chưa xác định broker timezone, không tự convert sang UTC; giữ raw/local timestamp và đánh dấu timezone unknown.
- Unique constraint chống trùng: Gmail message ID; order ticket + account; deal ticket + account; statement import checksum hoặc message ID/account.
- Thêm index cho user_id, account_id, date/time, symbol, entry, import_id.
- Thiết kế xóa mềm/retention hợp lý; không cascade xóa lịch sử tài chính ngoài ý muốn.
- Lưu nguồn provenance: statement import id cho từng order/deal/snapshot.
- Tách `deals` nguồn gốc bất biến khỏi `trades` là kết quả suy luận; khi matching algorithm thay đổi có thể rebuild trades từ deals.
- Không lưu ảnh screenshot trong PostgreSQL bytea; thiết kế attachment metadata để tích hợp object storage sau.
- Đảm bảo tất cả query của user đều giới hạn theo user_id/account ownership.

Tạo:
- schema Drizzle.
- migration đầu tiên.
- `docs/DATABASE_SCHEMA.md` gồm mô tả bảng, cột, constraint, indexes và ERD Mermaid.
- test schema/repository layer nếu phù hợp.

Không điền dữ liệu thật vào DB. Tạo seed demo riêng cho development nếu cần và phải dễ phân biệt demo với production. Sau khi chạy typecheck/test/migration validation, dừng lại.
```

---

# PROMPT 4 — Xây dựng MIME + HTML Statement Parser từ file mẫu

```text
Đây là giai đoạn quan trọng nhất: xây dựng parser xác định cho email Vantage Daily Confirmation.

Nguồn mẫu:
- Tôi sẽ đặt file `.eml` gốc tại `samples/private/Daily Confirmation.eml` hoặc cung cấp đúng đường dẫn trong workspace.
- Nếu file chưa có, đừng tự tạo dữ liệu giả để thay thế. Hãy yêu cầu tôi đưa file vào workspace.
- Không commit file .eml gốc và không log nội dung email. Tạo bản fixture đã khử tên, email, account number và định danh cá nhân tại `tests/fixtures/vantage-daily-confirmation.eml` hoặc fixture HTML sanitized tương đương.

Những điều đã biết từ email mẫu:
- From: support@vantagemarkets.com
- Subject: Daily Confirmation
- MIME `multipart/alternative`
- Có `text/plain` và `text/html`
- Statement nằm trong `text/html` body, không phải file đính kèm.
- HTML generator MetaQuotes Software Corp.
- Có các phần Orders, Deals, Positions, Working Orders, A/C Summary.

Yêu cầu MIME parser:
1. Xử lý Gmail API payload dạng recursive MIME parts và file `.eml` raw để test.
2. Chọn `text/html` body trong `multipart/alternative`; nếu thiếu HTML mới fallback sang `text/plain` bằng parser text riêng.
3. Hỗ trợ base64url decode từ Gmail API; xử lý charset UTF-8 và quoted-printable/base64 nếu xuất hiện ở email khác.
4. Không xử lý ảnh logo/tracking pixel; không tải remote images.
5. Không coi file đính kèm là HTML body. Nếu sau này có attachment, tách attachment handling riêng.

Yêu cầu HTML parser:
- Dùng HTML parser như Cheerio hoặc parser tương đương, không regex toàn bộ HTML.
- Parser phải nhận diện section theo nhãn `Orders:`, `Deals:`, `Positions:`, `Working Orders:`, `A/C Summary:` và header row tương ứng.
- HTML mẫu có thể dùng một bảng lớn với nhiều `tr`, `td`, `colspan`; không giả định mỗi section là một table riêng hoặc row index cố định.
- Bỏ whitespace, `&nbsp;`, `<br>` và empty cells hợp lý.
- Parse ngày giờ format `YYYY.MM.DD HH:mm:ss` nhưng giữ nguyên raw string.
- Parse numeric string về Decimal; xử lý số 0, số âm, dấu phẩy phân cách hàng nghìn nếu có; không parse `market` thành số.
- Parse size Orders có dạng `0.2 / 0.2` thành requested/filled hoặc size raw; không làm mất dữ liệu ban đầu.
- Parse rows `No transactions` thành empty section, không tạo fake trade.
- Bỏ subtotal/summary rows khỏi danh sách Deals; chỉ parse data rows có Ticket hợp lệ.
- Parse Entry values `in`, `out`, đồng thời chuẩn bị cho `inout`, `out_by` nếu gặp.
- Nhận diện các trường S/L và T/P = 0.00 là chưa thiết lập/không có, không suy ra rủi ro bằng 0.

Canonical output interfaces (có thể bổ sung nhưng không được lược bỏ):
- `StatementHeader`: accountNumber, accountName, currency, reportTimestampRaw, reportDate.
- `OrderRecord[]`: openTimeRaw, ticket, type, sizeRaw, sizeRequested?, sizeFilled?, symbol, priceRaw, stopLoss, takeProfit, executionTimeRaw, state, comment.
- `DealRecord[]`: timeRaw, ticket, type, volume, symbol, price, orderTicket, entry, commission, swap, profit, comment.
- `PositionsSnapshot[]` và `WorkingOrderRecord[]`.
- `AccountSummary`: closedTradePL, depositsWithdrawals, creditFacility, roundCommission, instantCommission, additionalOperations, total, previousLedgerBalance, previousEquity, balance, equity, floatingPL, marginRequirements, availableMargin.
- `ParseWarning[]` có code, message, section, source row/cell nếu định vị được.

Validation:
- Kiểm tra bắt buộc: account number, currency, report date, header fields, ticket IDs, numeric validity.
- Kiểm tra số tổng: tổng Closed P/L và Account Summary Total so với dữ liệu Deals/commission/swap trong khả năng đối chiếu; nếu lệch, tạo warning, không tự sửa.
- Parser phải trả `valid`, `partial` hoặc `invalid` và danh sách warnings.
- Không silently drop row không parse được; ghi nhận parse warning.

Test bắt buộc dùng fixture đã sanitized, assert chính xác ví dụ:
- Có 2 Orders và 2 Deals.
- Deal IN ticket 102931848, symbol NAS100ft, price 30753.10, volume 0.2.
- Deal OUT ticket 102940218, symbol NAS100ft, price 30773.90, volume 0.2, profit 4.16.
- Account currency USD; previous balance 18.33; balance 22.49; equity 22.49; floating P/L 0.00.
- Positions và Working Orders không có transactions.

Thêm test cho malformed HTML, missing section, empty sections, duplicate rows, unexpected columns, missing values, number formatting và `text/plain` fallback.

Tạo `docs/PARSER_SPEC.md` ghi lại quy tắc thực tế từ fixture, giới hạn và version parser.

Không dùng AI hoặc OCR. Không chuyển sang Gmail OAuth ở giai đoạn này. Chạy unit tests và báo cáo coverage của parser rồi dừng.
```

---

# PROMPT 5 — Gmail OAuth và tự động đồng bộ hằng ngày

```text
Xây dựng Gmail integration production-safe để lấy email Vantage Daily Confirmation.

Yêu cầu chính:
- Dùng Gmail API chính thức.
- OAuth 2.0 server-side với offline access/refresh token.
- Chỉ yêu cầu quyền đọc mail cần thiết: `https://www.googleapis.com/auth/gmail.readonly`; không yêu cầu gmail.modify, gmail.send hoặc mail.google.com.
- Không dùng IMAP password hoặc lưu mật khẩu Gmail.
- Refresh token chỉ lưu server-side và phải mã hóa trước khi ghi DB bằng AES-256-GCM hoặc giải pháp mã hóa được kiểm tra; encryption key nằm trong env, không ở DB/source code.
- Token tuyệt đối không trả cho browser/client và không log token.

Authentication:
- Bảo vệ toàn bộ app bằng đăng nhập Google hoặc giải pháp Auth server-side phù hợp.
- Vì đây là app cá nhân, triển khai allowlist `APP_ALLOWED_EMAILS` ở server để chỉ email được chủ app cho phép truy cập.
- Phân biệt app login với Gmail mailbox connection. Gmail connection phải có trạng thái riêng Connected/Expired/Revoked/Needs re-auth.
- Có nút Connect Gmail, Reconnect Gmail và Disconnect Gmail.
- OAuth flow phải dùng state/CSRF protection, exact redirect URI allowlist, secure HttpOnly cookies và kiểm tra scope được cấp.

Gmail search:
- Query mặc định: `from:support@vantagemarkets.com subject:"Daily Confirmation" newer_than:7d`.
- Không dùng `is:unread` vì người dùng có thể đã mở email trước khi cron chạy.
- Có thể lọc thêm account number sau khi parse, nhưng không hardcode account number trong source.
- Dùng `users.messages.list` để lấy message IDs và `users.messages.get` với format `full` để đọc MIME payload; xử lý pagination.
- Đọc MIME parts đệ quy để tìm `text/html`; fallback `text/plain` khi cần.
- Lưu email Date header, Gmail internalDate, report timestamp trong HTML thành các trường riêng.
- Chỉ import sender và subject đúng; kiểm tra sender từ header đã parse, không tin subject đơn lẻ.
- Gmail API có thể trả nhiều messages; không giả định chỉ có 1 thư/ngày.

Sync orchestration:
- Hỗ trợ `Sync now` từ UI và daily scheduled sync.
- Mỗi lần chạy quét bù tối thiểu 7 ngày để phòng cron bị trễ hoặc email đến muộn.
- Deduplicate bằng Gmail message ID và unique keys của orders/deals. Chạy sync nhiều lần không được tạo bản ghi trùng.
- Mỗi email có trạng thái: discovered, processing, imported, partial, skipped_duplicate, rejected, failed.
- Có retry với exponential backoff cho lỗi network/rate limit; không retry vô hạn.
- Nếu không tìm thấy email mới, ghi `No new statement`; không ghi P/L bằng 0 và không tạo snapshot giả.
- Nếu parse warning hoặc reconcile mismatch, import trạng thái partial/needs review và hiển thị chi tiết.
- Có dry-run/preview mode để xem số orders/deals trước khi ghi database.
- Có audit log cho connect, sync, import, disconnect; không chứa token hoặc raw email.

Scheduling:
- Dùng Vercel Cron một lần/ngày ở giai đoạn đầu, có thể đặt schedule UTC tương đương khoảng 10:00 giờ Asia/Ho_Chi_Minh (03:00 UTC).
- Bảo vệ route cron bằng `CRON_SECRET` và constant-time comparison khi phù hợp.
- Quét backfill 7 ngày nên cron trễ ±1 giờ không gây mất dữ liệu.
- Vercel cron chạy ở production deployment; tài liệu phải nói rõ cách test route local/manual.
- Thêm manual sync fallback nếu cron không chạy.
- Không dùng Gmail Push/Pub/Sub ở V1 vì người dùng chỉ cần một lần/ngày; giữ kiến trúc để có thể nâng cấp sau.

OAuth caveat:
- Gmail `gmail.readonly` là restricted scope. Ghi rõ trong `docs/GMAIL_SETUP.md` rằng consent screen ở External + Testing có thể giới hạn tester và refresh token có thể hết hạn sau 7 ngày. Cần có trạng thái `Needs re-auth` và hướng dẫn reconnect. Không tuyên bố rằng token sẽ tồn tại vĩnh viễn khi app chưa production/verified.
- Hướng dẫn cấu hình Google Cloud OAuth, enable Gmail API, test user, redirect URI local và production, scopes, publishing/testing implications.
- Không yêu cầu tôi dán secrets vào chat. Cung cấp danh sách env var và vị trí điền.

Tạo API routes/service modules, tests cho OAuth callback guards, Gmail search, MIME traversal, dedupe, retry, cron authentication và missing refresh token. Viết `docs/GMAIL_SETUP.md` từng bước bằng tiếng Việt. Sau khi hoàn thành, dừng và liệt kê những thao tác Google Cloud Console tôi cần tự làm.
```

---

# PROMPT 6 — Ghép Deals thành Trades và xây dựng Analytics Engine

```text
Xây dựng domain logic để từ Orders + Deals + Account Snapshots tạo Trade Groups và các chỉ số hiệu suất.

Quy tắc dữ liệu:
- Orders là lệnh được đặt; Deals là lần khớp thực tế; Trade là chu kỳ/vị thế được suy luận từ một hoặc nhiều deals.
- Không đếm Order là Trade.
- Không lấy số row BUY/SELL làm Win Rate.
- Deals là source of truth; trades có thể được rebuild bằng matching algorithm version.
- Mỗi deal phải được gắn vào một trade hoặc review queue; không silently discard.

Trade matching:
- Hỗ trợ entry `in`, `out`, và chuẩn bị cho `inout`, `out_by`.
- Xử lý partial fills, partial closes, nhiều deal cho một order, nhiều lần scale-in/scale-out, reversal nếu có.
- Vì Statement HTML không có Position ID trong mẫu, không được giả vờ luôn xác định chính xác quan hệ vị thế.
- Xây matching algorithm có thể cấu hình (ví dụ FIFO theo account + symbol + side) nhưng đánh dấu đây là inferred matching, không phải position ID xác thực.
- Nếu đồng thời tồn tại nhiều vị thế cùng symbol hoặc có nhiều cách ghép hợp lệ, đánh dấu `ambiguous` và đưa vào Review Queue.
- Hỗ trợ người dùng manually link/unlink deals, override matching với audit trail.
- Lưu matching algorithm version, method, confidence/status.
- Khi một deal mới đến, matching lại các trade liên quan nhưng không ghi đè journal notes thủ công.

P/L:
- Giữ nguyên commission, swap, profit từng deal.
- Tính net realized P/L theo quy tắc có thể giải thích; dùng đúng dấu của dữ liệu nguồn. Kiểm tra cách broker định nghĩa Closed Trade P/L bằng đối chiếu Statement Summary.
- Không double-count các subtotal/summary rows.
- Với nhiều deal đóng/mở, phân bổ P/L/commission/swap nhất quán vào trade group. Nếu không thể phân bổ chắc chắn, đánh dấu partial/needs review.
- Lưu gross P/L, net P/L, commission, swap thành các trường riêng nếu dữ liệu cho phép.

Metrics:
- Closed Trades, Winning Trades, Losing Trades, Breakeven Trades.
- Win Rate = winning closed trades / all resolved closed trades.
- Gross Profit = tổng net P/L hoặc gross P/L dương theo định nghĩa được ghi rõ; tránh trộn khái niệm.
- Gross Loss = trị tuyệt đối tổng P/L âm.
- Profit Factor = Gross Profit / Gross Loss; nếu Gross Loss = 0, hiển thị N/A hoặc ∞ có chú thích, không chia cho 0.
- Average Win, Average Loss.
- Expectancy = tổng net P/L / số trade resolved/closed; nêu rõ cách xử lý breakeven/unresolved.
- Average holding time khi open/close timestamp và timezone đã chuẩn hóa.
- Consecutive wins/losses.
- P/L by symbol, side, day/week/month, session, strategy/tag.
- Balance/Equity curve từ `account_snapshots`.
- Max observed daily drawdown từ snapshot Equity (hoặc Balance nếu chỉ có Balance), ghi rõ không phải intraday drawdown.
- Không tính R-Multiple khi thiếu risk-at-entry/SL size/contract specs; không tính MAE/MFE khi thiếu market path data.
- Nếu timezone broker chưa biết, tắt phân tích session hoặc gắn cảnh báo; không mặc định timestamp report là Vietnam time.
- Metrics phải hỗ trợ filter và dùng cùng một service layer để không khác số giữa các trang.

Testing:
- Tạo unit tests cho tất cả công thức với dataset nhỏ dễ kiểm tra bằng tay.
- Test zero losses, all losses, breakeven, partial close, missing entry, unmatched deal, ambiguous match, multiple symbols, commission/swap.
- Đảm bảo dashboard không hiển thị Win Rate/Profit Factor sai khi unresolved trades tồn tại; hiển thị số giao dịch chưa ghép riêng.

Tạo `docs/TRADE_MATCHING.md` và `docs/METRICS_DICTIONARY.md` gồm định nghĩa, công thức, nguồn dữ liệu, giới hạn, edge cases. Dừng sau khi tests pass.
```

---

# PROMPT 7 — Trading Journal, Review Queue và trải nghiệm Dashboard

```text
Hoàn thiện các màn hình sản phẩm sử dụng dữ liệu thật từ Neon/services đã xây dựng. Không dùng mock data trong production.

Màn hình cần triển khai:
1. Overview Dashboard
   - KPI cards có tooltip giải thích định nghĩa.
   - Equity/Balance chart và P/L calendar.
   - P/L by symbol/session/side.
   - Win/Loss distribution và holding-time analysis.
   - Gmail sync status, last successful sync, import warning count, unresolved trades.
2. Trades
   - Table/filter/sort/pagination.
   - Trade detail page/drawer có timeline các Orders/Deals liên kết, summary P/L, entry/exit, matching confidence.
   - Nút mở/đóng Journal note.
3. Deals và Orders
   - Bảng riêng, cho phép mở raw source fields.
4. Review Queue
   - Các deal unmatched/ambiguous, lỗi parser, account summary mismatch.
   - Người dùng có thể chọn trade group hoặc gắn deal thủ công, xem preview tác động lên P/L và metrics trước khi xác nhận.
   - Có audit trail cho thao tác sửa matching.
5. Trading Diary
   - Form ghi setup, strategy, market context, thesis, planned entry/SL/TP, exit reason, emotion before/during/after, adherence, mistake tags, lesson learned.
   - Cho phép liên kết note với Trade.
   - Không bắt buộc AI viết nhật ký.
6. Imports
   - Email import history, parser version, date, account, orders/deals count, status, warnings.
   - Nút view parse summary, retry import nếu safe, download/export parsed data.
7. Settings
   - Gmail connection status, connect/reconnect/disconnect, test connection.
   - Trading account metadata, currency, server timezone, display timezone, session settings.
   - Data export.

UX:
- UI responsive, đẹp và nhất quán desktop/mobile.
- Dark/Light Mode.
- Các trạng thái Loading, Empty, Error, Partial, Stale đều phải có giao diện rõ.
- Số âm/dương dùng màu và ký hiệu; có accessibility contrast; không chỉ dựa vào màu.
- Các bảng mobile chuyển thành card/table scroll phù hợp.
- Có skeleton và error boundaries hợp lý.
- Không bịa data khi DB trống; hiển thị onboarding: Connect Gmail hoặc Import sample Statement.
- Date filters hoạt động thật; mọi chart/table sử dụng chung query filters.
- Trên mobile, PWA navigation dễ dùng một tay; tránh biểu đồ nhỏ không đọc được.

Data/API:
- Dùng server-side query/services, validate input bằng Zod.
- Pagination phía server cho lịch sử dài.
- Tránh N+1 queries; thêm aggregate queries/materialized view khi thực sự cần.
- Mọi dữ liệu truy xuất giới hạn theo authenticated user.

Tạo E2E tests cho: đăng nhập/unauthorized state, dashboard empty state, trade list/detail, journal CRUD, review queue, Gmail settings status. Dùng test DB/fixtures riêng, không sửa production data. Dừng sau khi nghiệm thu các màn hình.
```

---

# PROMPT 8 — Security, PWA, QA và tối ưu production

```text
Thực hiện production readiness review toàn bộ ứng dụng Trading Journal trước khi deploy.

Security review:
- Kiểm tra auth cho tất cả page, route handlers, server actions và API.
- Kiểm tra allowlist người dùng ở server-side, không chỉ ẩn UI.
- Kiểm tra CSRF/state cho OAuth, redirect URI, cookie settings, session expiry.
- Kiểm tra refresh token encryption at rest và rotation/reauth handling.
- Không để Gmail tokens, DB URLs, CRON_SECRET, encryption keys lộ ra client, source maps public hoặc logs.
- Kiểm tra SQL injection, XSS, unsafe HTML rendering, SSRF, arbitrary URL fetch, upload validation, rate limiting.
- Sanitize email HTML; không render trực tiếp HTML email từ Vantage trong app như trusted markup. Nếu cần preview, sandbox/escape; ưu tiên show parsed values.
- Cron endpoint bắt buộc kiểm tra CRON_SECRET.
- Thêm CSP/security headers phù hợp.
- Không cache private user data trong public CDN/service worker cache.
- Cung cấp data deletion/export có xác nhận và audit trail.

Reliability:
- Idempotent import.
- Database transaction cho import statement và its orders/deals/snapshots.
- Retry network/429/5xx; không retry permanent OAuth errors.
- Sync lock để tránh hai cron/manual runs đè lên nhau.
- Dead-letter/review status cho email không parse được.
- Observability/logging có correlation ID; không log email body, account identifiers đầy đủ, tokens hoặc PII.
- Health endpoint chỉ trả trạng thái không nhạy cảm.
- Backup/restore documentation cho Neon.

PWA:
- Kiểm tra installability trên Android/desktop Chrome.
- Không cache API response riêng tư/offline trading data.
- App icons/manifest/theme color.
- Test responsive breakpoints.

QA commands:
- lint
- typecheck
- unit/integration tests
- Playwright E2E
- production build
- dependency/security audit phù hợp
- migration validation

Hãy tạo `docs/SECURITY_REVIEW.md`, `docs/PRODUCTION_CHECKLIST.md`, sửa các lỗi phát hiện được và báo cáo các rủi ro còn tồn tại. Không deploy production trong prompt này. Dừng và chờ tôi duyệt.
```

---

# PROMPT 9 — Chuẩn bị GitHub, Vercel, Neon và production deploy

```text
Chuẩn bị triển khai production cho Trading Journal bằng GitHub + Vercel + Neon.

Trước khi thực hiện:
- Kiểm tra Git status, branch, remote, commit history.
- Không push file `.env*`, raw `.eml`, fixture chứa PII, database dump hoặc secrets.
- Không chạy migration trên production database cho đến khi tôi xác nhận rõ.
- Không tự tạo hoặc thay đổi resource trong tài khoản cloud nếu chưa có credentials/quyền; hướng dẫn tôi các bước console cụ thể.

Yêu cầu:
1. GitHub
   - Kiểm tra `.gitignore`, commit structure, branch main/develop hoặc trunk-based phù hợp.
   - Tạo README đầy đủ, hướng dẫn local, test, deploy.
   - Nếu chưa có remote, cung cấp lệnh thêm remote sau khi tôi tạo repository.
   - Không force push.
2. Neon
   - Dùng `DATABASE_URL` pooled cho runtime serverless.
   - Dùng `DIRECT_URL` cho Drizzle migrations nếu cần direct connection.
   - Tài liệu tạo project, database, role, branch, connection string và network/security.
   - Migration phải chạy có kiểm soát; ghi lại cách rollback/restore.
3. Vercel
   - Connect GitHub repository.
   - Set framework Next.js.
   - Add Production/Preview/Development environment variables đúng môi trường.
   - Chỉ schedule cron ở production.
   - Cron route cần `CRON_SECRET`.
   - Lịch daily sync: `0 3 * * *` theo UTC, tương đương 10:00 Asia/Ho_Chi_Minh; vì Vercel Hobby cron có thể chạy lệch tối đa khoảng 59 phút, query Gmail phải backfill 7 ngày và idempotent. Nếu tài khoản Vercel/plan hiện tại có scheduling feature khác, kiểm tra docs hiện hành và đề xuất lựa chọn phù hợp.
4. Google Cloud / Gmail
   - Enable Gmail API.
   - Configure OAuth consent screen, add test user đúng account cần kết nối.
   - Create Web OAuth Client và thêm local + production redirect URIs chính xác.
   - Request only gmail.readonly for Gmail integration.
   - Explain Testing mode refresh token expiry caveat and reauthorization workflow.
   - Ghi rõ nếu muốn vận hành ổn định lâu dài, cần xử lý trạng thái Publishing/verification theo Google policy; không tuyên bố app đã verified.
5. Environment variables
   Tạo `.env.example` với names only; hướng dẫn tôi tạo và nhập:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `AUTH_SECRET`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (hoặc tên thực tế theo auth implementation)
   - `APP_ALLOWED_EMAILS`
   - `GMAIL_OAUTH_CLIENT_ID`
   - `GMAIL_OAUTH_CLIENT_SECRET`
   - `GMAIL_OAUTH_REDIRECT_URI`
   - `TOKEN_ENCRYPTION_KEY`
   - `CRON_SECRET`
   - `NEXT_PUBLIC_APP_URL`
   - `NODE_ENV` nếu cần
   Không được giả định mọi biến đều cần nếu implementation dùng tên khác; đồng bộ `.env.example` với code thực tế.
6. Tạo `docs/DEPLOYMENT.md` hướng dẫn từng bước local → GitHub → Neon → Google Cloud → Vercel → custom domain (optional) → smoke test.

Cung cấp các lệnh kiểm tra trước deploy. Chờ tôi xác nhận trước khi áp dụng migration production hoặc deploy production.
```

---

# PROMPT 10 — Kiểm thử end-to-end với Statement thật đã sanitize

```text
Bây giờ hãy chạy nghiệm thu end-to-end với fixture Vantage Daily Confirmation đã sanitize.

Kịch bản:
1. Import fixture `.eml`/HTML local.
2. MIME parser xác định multipart/alternative và chọn text/html.
3. HTML parser trích xuất Header, Orders, Deals, Positions, Working Orders, Account Summary.
4. Validation kiểm tra số lượng rows, ticket, numeric, currency, report date.
5. Database transaction lưu Statement, Orders, Deals, Account Snapshot.
6. Chạy dedup import lần hai và đảm bảo không tạo thêm records.
7. Chạy trade matching; nếu dữ liệu đủ duy nhất thì tạo inferred trade; nếu mơ hồ thì tạo review item, không tự kết luận.
8. Tính các KPI và đối chiếu P/L với Account Summary.
9. Hiển thị kết quả trên Trades, Deals, Imports và Dashboard.
10. Export CSV/JSON và kiểm tra nội dung.

Expected values từ sample:
- Currency USD.
- Report timestamp raw `2026.10.14 23:59`.
- 2 Orders.
- 2 Deals.
- Deal IN: ticket 102931848, BUY, volume 0.2, NAS100ft, price 30753.10, profit 0.
- Deal OUT: ticket 102940218, SELL, volume 0.2, NAS100ft, price 30773.90, profit 4.16.
- Closed Trade P/L 4.16.
- Previous Ledger Balance 18.33.
- Balance 22.49.
- Equity 22.49.
- Floating P/L 0.
- Positions empty, Working Orders empty.

Không được dùng test này để hardcode số sample vào ứng dụng. Các expected values chỉ nằm trong automated test fixture.

Hãy tạo report `docs/ACCEPTANCE_TEST_REPORT.md` gồm pass/fail, ảnh chụp màn hình (nếu có), lỗi phát hiện và cách khắc phục. Chỉ được đánh dấu production-ready khi test pass và các caveat được nêu rõ.
```

---

# C. Những việc tôi phải tự làm trên các dịch vụ

Antigravity có thể tạo code và chỉ dẫn; một số thao tác cần bạn đăng nhập và bấm trong dashboard của nhà cung cấp.

## 1. GitHub

- Tạo repository mới tên ví dụ `trading-journal`.
- Nếu muốn private, chọn **Private**.
- Clone repo vào thư mục project trên máy hoặc để agent init Git local rồi thêm remote.
- Không commit `.env.local`, file `.eml` gốc hoặc file export có dữ liệu cá nhân.

## 2. Neon

- Tạo project PostgreSQL mới.
- Chọn region gần nơi deploy Vercel nếu có lựa chọn phù hợp.
- Lấy pooled connection string làm `DATABASE_URL`.
- Lấy direct connection string làm `DIRECT_URL` nếu Drizzle migration cần.
- Không gửi connection string trong prompt/chat; tự đặt trong `.env.local` và Vercel Environment Variables.

## 3. Google Cloud – Gmail API

- Tạo hoặc chọn Google Cloud project.
- Enable Gmail API.
- Configure Google Auth Platform/OAuth consent screen.
- Với giai đoạn test cá nhân, đặt Audience phù hợp và thêm chính tài khoản Gmail của bạn vào Test users nếu chọn External + Testing.
- Tạo OAuth Client loại Web application.
- Thêm redirect URI local do app in ra, ví dụ `http://localhost:3000/api/integrations/gmail/callback`.
- Sau khi có domain Vercel production, thêm URI production chính xác, ví dụ `https://your-domain.vercel.app/api/integrations/gmail/callback`.
- Chỉ cấp scope `https://www.googleapis.com/auth/gmail.readonly` cho chức năng lấy Statement.
- Lưu ý: Google ghi nhận OAuth External + Testing có giới hạn tester và refresh-token authorization có thể hết hạn sau 7 ngày khi yêu cầu scope ngoài nhóm basic identity. Vì vậy app phải có reconnect flow. Khi chuyển sang vận hành dài hạn, kiểm tra trạng thái Publishing/verification và yêu cầu chính sách hiện hành của Google.

## 4. Tạo secret an toàn trên máy

Có thể dùng Node.js để sinh secret, chạy trong terminal local:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Dùng một giá trị riêng cho `TOKEN_ENCRYPTION_KEY`; không dùng chung với `AUTH_SECRET` hoặc `CRON_SECRET`. Nếu agent đề xuất format khác, làm theo format mà code thực tế yêu cầu.

## 5. Vercel

- Import repository từ GitHub.
- Chọn project Next.js.
- Add environment variables cho Development, Preview và Production theo hướng dẫn trong `docs/DEPLOYMENT.md`.
- Deploy Preview trước; kiểm tra login, DB, parser, Gmail connect và import fixture.
- Chỉ sau khi pass mới deploy Production.
- Kiểm tra cron schedule trên Production deployment và xem log kết quả sync.

---

# D. Thứ tự chạy khuyến nghị và điểm kiểm tra

| Thứ tự | Prompt | Chỉ chuyển bước khi |
|---:|---|---|
| 1 | Prompt 0 | Có brief, architecture, plan, risk register |
| 2 | Prompt 1 | PRD và UX spec đã được duyệt |
| 3 | Prompt 2 | App scaffold chạy local, lint/typecheck/build pass |
| 4 | Prompt 3 | Schema và migration được review |
| 5 | Prompt 4 | Parser test pass trên fixture đã sanitize |
| 6 | Prompt 5 | Gmail OAuth, sync, dedup và cron route test pass |
| 7 | Prompt 6 | Trade matching và metrics test pass |
| 8 | Prompt 7 | Các màn hình lấy dữ liệu DB thật, E2E pass |
| 9 | Prompt 8 | Security/QA checklist được review |
| 10 | Prompt 9 | Preview deploy pass; chủ dự án xác nhận trước production |
| 11 | Prompt 10 | Acceptance test report pass |

Sau mỗi phase, yêu cầu agent:
- Tóm tắt file đã tạo/sửa.
- Nêu test command và kết quả thực tế.
- Nêu known issues và technical debt.
- Đưa ra Git commit message đề xuất.
- Không tự commit/push nếu bạn muốn tự kiểm soát; nếu đã cho phép, commit theo từng phase, không force push.

---

# E. Prompt ngắn để dùng khi Antigravity bắt đầu làm quá rộng

```text
Dừng việc mở rộng scope. Chỉ hoàn thành phase hiện tại theo acceptance criteria đã thống nhất. Trước khi sửa code, hãy liệt kê kế hoạch tối đa 5 bước và những file dự kiến thay đổi. Không thay stack, không hardcode dữ liệu mẫu, không bỏ qua test. Sau khi hoàn thành, chạy test thật, báo cáo kết quả và dừng chờ tôi xác nhận.
```

# F. Prompt kiểm tra code trước mỗi lần push

```text
Hãy review toàn bộ diff hiện tại như một Senior Engineer độc lập.

Kiểm tra:
- Logic có đúng yêu cầu và không tạo dữ liệu giả không?
- Có lỗi dữ liệu trùng, timezone, decimal/rounding, partial close hoặc matching mơ hồ không?
- Có lộ secret/PII/raw email không?
- Có endpoint thiếu authentication/authorization hoặc cron secret không?
- Có truy vấn DB không giới hạn user/account không?
- Có thiếu test cho edge cases không?
- Build, lint, typecheck, unit/integration/E2E tests có pass không?

Không tự sửa lớn ngoài scope. Phân loại findings theo Critical/High/Medium/Low, trích file và dòng cụ thể, đề xuất sửa. Sau đó chỉ sửa Critical/High khi có thể làm an toàn; báo cáo lại kết quả và dừng để tôi review diff.
```

---

# G. Lưu ý sản phẩm và giới hạn dữ liệu

- V1 là Web + PWA có thể cài lên điện thoại, không phải native App Store/Google Play. Nếu sau này cần native app, thêm Expo/React Native dùng chung API/backend.
- Daily Confirmation không cung cấp đầy đủ mọi dữ liệu cần cho phân tích định lượng nâng cao. R-Multiple cần risk-at-entry/SL và contract specs; MAE/MFE cần dữ liệu giá trong lúc giữ vị thế; intraday drawdown cần equity/time-series chi tiết hơn daily statement.
- Statement mẫu không có Position ID, nên ghép Deal thành Trade có thể mơ hồ trong các tình huống nhiều vị thế cùng symbol. Giữ raw deals và Review Queue để tránh sai lệch metrics.
- Vantage có thể thay đổi HTML template. Parser phải versioned, có sanitized fixtures và cảnh báo khi cấu trúc thay đổi.
- Email vắng mặt không được xem là ngày P/L bằng 0. Dashboard phải phân biệt “không có email”, “không có giao dịch”, “chưa đồng bộ” và “lỗi đồng bộ”.
