import { pad2 } from './dateUtils.ts';

export function formatUsd(val: string | number, signed = true): string {
  const num = typeof val === 'string' ? Number(val) : val;
  if (Number.isNaN(num)) return '0,00 US$';
  const absFormatted = Math.abs(num).toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `${absFormatted} US$`;
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}${absFormatted} US$`;
}

// Số tiền gọn cho ô lịch: +4,94 / -3,60. `dropDecimals` bỏ phần thập phân (dùng cho ô hẹp trên điện thoại).
export function formatCompactMoney(num: number, dropDecimals = false): string {
  const abs = Math.abs(num).toLocaleString('vi-VN', {
    minimumFractionDigits: dropDecimals ? 0 : 2,
    maximumFractionDigits: dropDecimals ? 0 : 2,
  });
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}${abs}`;
}

export function formatPrice(raw: string | null): string {
  if (!raw) return '—';
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return num.toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseRawTimestampMs(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
  ).getTime();
}

export function formatExactHoldingDuration(
  openRaw: string,
  closeRaw: string | null,
  fallbackMinutes: number | null,
): string {
  const start = parseRawTimestampMs(openRaw);
  const end = parseRawTimestampMs(closeRaw);
  if (start !== null && end !== null && end >= start) {
    const totalSec = Math.floor((end - start) / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
    }
    if (mins > 0) {
      return secs > 0 ? `${mins} phút ${secs} giây` : `${mins} phút`;
    }
    return `${secs} giây`;
  }
  if (fallbackMinutes !== null) {
    return `${fallbackMinutes} phút`;
  }
  return '—';
}

// '2026.11.18 17:06:12' -> '18/11/2026 · 17:06:12'
export function formatDateTimeDisplay(raw: string): string {
  const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]} · ${m[4]}`;
}

export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
