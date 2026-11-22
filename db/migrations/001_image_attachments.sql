-- Bảng lưu ảnh đính kèm cho Nhật ký giao dịch (owner_type = 'trade') và Nghiên cứu hành động giá (owner_type = 'observation').
-- Ứng dụng tự chạy câu lệnh này khi khởi động (CREATE ... IF NOT EXISTS nên chạy lặp lại là an toàn),
-- nên thường KHÔNG cần chạy tay. File này để bạn xem/kiểm soát hoặc chạy thủ công trong Neon SQL Editor.

CREATE TABLE IF NOT EXISTS image_attachments (
  id          TEXT PRIMARY KEY,                 -- 'img_' + UUID, không đoán được
  owner_type  TEXT NOT NULL,                    -- 'trade' | 'observation'
  owner_id    TEXT NOT NULL,                    -- id lệnh (trd_...) hoặc id quan sát (obs_...)
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,                    -- image/jpeg | image/png | image/webp | image/gif
  size_bytes  INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  data        BYTEA NOT NULL,                   -- nội dung ảnh
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT image_attachments_owner_type_chk CHECK (owner_type IN ('trade', 'observation')),
  CONSTRAINT image_attachments_size_chk CHECK (size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_image_attachments_owner ON image_attachments(owner_type, owner_id);

-- Kiểm tra dung lượng đang dùng cho ảnh (tùy chọn):
-- SELECT owner_type, COUNT(*) AS so_anh, pg_size_pretty(SUM(size_bytes)) AS dung_luong FROM image_attachments GROUP BY owner_type;
