// Tiện ích ngày tháng dùng chung.
// - Các hàm xử lý "ngày lịch" (toIsoDate, parseIsoDate, addDaysIso, buildMonthGrid) làm việc với ngày/tháng/năm thuần túy,
//   không phụ thuộc múi giờ.
// - Các hàm lấy "bây giờ" (todayIso, vietnamYearMonth, formatVnDateTime) luôn tính theo GIỜ VIỆT NAM (UTC+7),
//   bất kể máy đang mở app đặt múi giờ nào. Việt Nam không có giờ mùa hè nên độ lệch cố định +7 là chính xác.

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const VN_UTC_OFFSET_MS = 7 * 3_600_000;

/** "Giờ treo tường" Việt Nam của một thời điểm; đọc bằng các hàm getUTC*() để ra đúng ngày/giờ Việt Nam. */
export function vietnamWallClock(input: number | Date | string = Date.now()): Date {
  const ms = typeof input === 'number' ? input : new Date(input).getTime();
  return new Date(ms + VN_UTC_OFFSET_MS);
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng 'YYYY-MM-DD'. */
export function todayIso(): string {
  const d = vietnamWallClock();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Năm và tháng (0-11) hiện tại theo giờ Việt Nam, dùng để mở lịch đúng tháng. */
export function vietnamYearMonth(): { year: number; month: number } {
  const d = vietnamWallClock();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * Hiển thị một thời điểm thật (ISO string / Date / epoch ms) theo giờ Việt Nam: '08:15:08 25/11/2026'.
 * `compact: true` để rút gọn cho chỗ hẹp: '08:15 25/11'.
 * Tự ghép chuỗi (không dùng toLocaleString) để kết quả giống nhau trên mọi trình duyệt.
 */
export function formatVnDateTime(
  input: string | number | Date | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (input === null || input === undefined || input === '') return '—';
  const ms = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(ms)) return '—';
  const d = vietnamWallClock(ms);
  const date = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (opts.compact) return `${hm} ${date}`;
  return `${hm}:${pad2(d.getUTCSeconds())} ${date}/${d.getUTCFullYear()}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

// '2026.11.18 17:06:12' -> '2026-11-18'
export function isoFromRaw(raw: string): string {
  const m = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw.slice(0, 10);
}

// '2026-11-18' -> '18/11/2026'
export function formatIsoDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

// '2026-11-18' -> '18/11'
export function formatIsoShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return m && d ? `${d}/${m}` : iso;
}

export function monthLabel(year: number, month: number): string {
  return `Tháng ${month + 1}/${year}`;
}

export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

// Lưới tháng bắt đầu từ Thứ 2; luôn đủ tuần (35 hoặc 42 ô).
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Thứ 2 = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(year, month, 1 - offset + i);
    cells.push({
      iso: toIsoDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
    });
  }
  return cells;
}
