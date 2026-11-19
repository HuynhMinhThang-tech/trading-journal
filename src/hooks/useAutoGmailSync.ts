import { useEffect } from 'react';

const SESSION_KEY = 'tj_auto_gmail_sync_done';

/**
 * Tự động quét Gmail một lần mỗi phiên mở ứng dụng (bổ sung cho lịch chạy nền trên máy chủ).
 * Im lặng hoàn toàn: nếu máy chủ chưa cấu hình Gmail hoặc có lỗi thì bỏ qua.
 * Chỉ tải lại dữ liệu khi thật sự có báo cáo mới.
 */
export function useAutoGmailSync(onImported: () => void | Promise<void>) {
  useEffect(() => {
    (async () => {
      try {
        if (window.sessionStorage.getItem(SESSION_KEY) === '1') return;
        window.sessionStorage.setItem(SESSION_KEY, '1');

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
