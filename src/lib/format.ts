// ---------------------------------------------------------------------------------------------
// Tiền tệ & giá theo chuẩn quốc tế (en-US): dấu phẩy ngăn hàng nghìn, dấu chấm cho phần thập phân.
//   $49.90   +$9.79   -$3.60   $1,234.56
// Luôn chỉ định rõ 'en-US' để kết quả không phụ thuộc ngôn ngữ của trình duyệt.
// ---------------------------------------------------------------------------------------------
const MONEY_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONEY_FORMAT_WHOLE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const AXIS_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function toFiniteNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'string' ? Number(val) : val;
  return Number.isFinite(num) ? num : null;
}

/**
 * Số tiền USD: '$49.90'. `signed = true` (mặc định) thêm dấu '+' cho số dương: '+$9.79'.
 * Số âm luôn có dấu '-' đặt trước ký hiệu: '-$3.60'. Số bằng 0 không mang dấu: '$0.00'.
 */
export function formatUsd(val: string | number | null | undefined, signed = true): string {
  const num = toFiniteNumber(val);
  if (num === null) return '$0.00';
  const body = MONEY_FORMAT.format(Math.abs(num));
  if (body === '0.00') return `$${body}`; // gồm cả -0.004 làm tròn về 0
  if (num < 0) return `-$${body}`;
  return signed ? `+$${body}` : `$${body}`;
}

// Số tiền gọn cho ô lịch: +$4.94 / -$3.60. `dropDecimals` bỏ phần thập phân (dùng cho ô hẹp trên điện thoại).
export function formatCompactMoney(num: number, dropDecimals = false): string {
  const format = dropDecimals ? MONEY_FORMAT_WHOLE : MONEY_FORMAT;
  const body = format.format(Math.abs(num));
  if (Number(body.replace(/,/g, '')) === 0) return `$${body}`;
  return `${num < 0 ? '-' : '+'}$${body}`;
}

/** Nhãn trục biểu đồ: $50, $1,250, -$3.5 (không ép 2 chữ số thập phân). */
export function formatAxisUsd(val: number | string): string {
  const num = toFiniteNumber(val);
  if (num === null) return '';
  return `${num < 0 ? '-' : ''}$${AXIS_FORMAT.format(Math.abs(num))}`;
}

/** Giá khớp lệnh: 26,265.28 (2 chữ số thập phân, dấu phẩy ngăn hàng nghìn). */
export function formatPrice(raw: string | null): string {
  if (!raw) return '—';
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return MONEY_FORMAT.format(num);
}

export function parseRawTimestampMs(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  // Date.UTC: chỉ dùng để tính chênh lệch giữa hai mốc, không phụ thuộc múi giờ / giờ mùa hè của trình duyệt.
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
  );
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
