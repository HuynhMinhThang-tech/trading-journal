import { useEffect } from 'react';

// Mở lại ứng dụng (đặc biệt là PWA trên điện thoại) luôn tạo phiên mới, nên không thể chỉ dựa vào
// sessionStorage để tránh quét liên tục. Lưu thời điểm lần quét gần nhất và giãn cách tối thiểu.
const LAST_RUN_KEY = 'tj_auto_gmail_sync_at';
const MIN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Tự động quét Gmail khi mở ứng dụng, tối đa 1 lần mỗi 15 phút (bổ sung cho lịch chạy nền trên máy chủ).
 * Im lặng hoàn toàn: nếu máy chủ chưa cấu hình Gmail hoặc có lỗi thì bỏ qua.
 * Chỉ tải lại dữ liệu khi thật sự có báo cáo mới.
 */
export function useAutoGmailSync(onImported: () => void | Promise<void>) {
  useEffect(() => {
    (async () => {
      try {
        const lastRun = Number(window.localStorage.getItem(LAST_RUN_KEY) ?? '0');
        if (Number.isFinite(lastRun) && Date.now() - lastRun < MIN_INTERVAL_MS) return;
        window.localStorage.setItem(LAST_RUN_KEY, String(Date.now()));

        const res = await fetch('/api/gmail/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: 3, dryRun: false, trigger: 'auto' }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { imported?: number; partial?: number };
        if ((data.imported ?? 0) + (data.partial ?? 0) > 0) {
          await onImported();
        }
      } catch {
        // bỏ qua: đồng bộ tự động không được làm phiền người dùng
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
