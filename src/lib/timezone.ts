// Quy đổi giờ máy chủ sàn (MetaTrader / Vantage) sang giờ Việt Nam (UTC+7).
//
// Báo cáo Daily Confirmation ghi thời gian theo GIỜ MÁY CHỦ SÀN, không phải giờ Việt Nam.
// Máy chủ MetaTrader dùng "giờ đóng cửa New York": UTC+2 mùa Đông, UTC+3 mùa Hè (đổi theo
// giờ mùa hè của Mỹ). Vì vậy cần quy đổi trước khi hiển thị hoặc gom theo ngày.
//
// Mọi phép tính dùng "giờ treo tường" (Date.UTC làm mốc) để không phụ thuộc múi giờ của trình duyệt/máy chủ.

import type { WorkspaceDataset } from '../shared/types.ts';

export const VN_UTC_OFFSET_HOURS = 7;

/** Giá trị mặc định: tự nhận UTC+2/UTC+3 theo giờ mùa hè của Mỹ. */
export const MT_AUTO_TIMEZONE = 'MT-auto';

const HOUR_MS = 3_600_000;

/** Giá trị cũ 'Unknown' (chưa chọn) được coi là tự động theo MetaTrader. */
export function normalizeServerTimezone(tz: string | null | undefined): string {
  if (!tz || tz.trim() === '' || tz.toLowerCase() === 'unknown') return MT_AUTO_TIMEZONE;
  return tz.trim();
}

// Chủ nhật thứ n của tháng (month: 0-11) lúc `hour` giờ, tính bằng ms theo "giờ treo tường".
function nthSundayWallMs(year: number, month: number, nth: number, hour: number): number {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Chủ nhật
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return Date.UTC(year, month, firstSunday + (nth - 1) * 7, hour, 0, 0);
}

// Giờ mùa hè Mỹ: từ Chủ nhật thứ 2 của tháng 3 (02:00) đến Chủ nhật đầu tiên của tháng 11 (02:00).
function isUsDst(newYorkWallMs: number): boolean {
  const year = new Date(newYorkWallMs).getUTCFullYear();
  return (
    newYorkWallMs >= nthSundayWallMs(year, 2, 2, 2) && newYorkWallMs < nthSundayWallMs(year, 10, 1, 2)
  );
}

/** Độ lệch (giờ) so với UTC của giờ máy chủ tại thời điểm `serverWallMs`; null nếu không hiểu giá trị. */
export function serverUtcOffsetHours(serverTz: string | null | undefined, serverWallMs: number): number | null {
  const tz = normalizeServerTimezone(serverTz);
  if (tz === MT_AUTO_TIMEZONE) {
    // Đồng hồ máy chủ = giờ New York + 7 tiếng (00:00 máy chủ = 17:00 New York).
    return isUsDst(serverWallMs - 7 * HOUR_MS) ? 3 : 2;
  }
  if (tz === 'Asia/Ho_Chi_Minh') return VN_UTC_OFFSET_HOURS;
  const m = tz.match(/^UTC([+-]\d+(?:\.\d+)?)$/i);
  return m ? Number(m[1]) : null;
}

const RAW_RE = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseRawWallMs(raw: string): { ms: number; hasSeconds: boolean } | null {
  const m = raw.trim().match(RAW_RE);
  if (!m) return null;
  return {
    ms: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? '0')),
    hasSeconds: m[6] !== undefined,
  };
}

function formatRawWall(ms: number, withSeconds: boolean): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return withSeconds ? `${date} ${time}:${p(d.getUTCSeconds())}` : `${date} ${time}`;
}

/**
 * '2026.11.18 17:06:12' (giờ máy chủ sàn) -> '2026.11.18 22:06:12' (giờ Việt Nam).
 * Giữ nguyên chuỗi gốc nếu không đọc được định dạng hoặc múi giờ.
 */
export function brokerRawToVietnamRaw(raw: string, serverTz: string | null | undefined): string;
export function brokerRawToVietnamRaw(raw: string | null, serverTz: string | null | undefined): string | null;
export function brokerRawToVietnamRaw(raw: string | null, serverTz: string | null | undefined): string | null {
  if (raw === null) return null;
  const parsed = parseRawWallMs(raw);
  if (!parsed) return raw;
  const offset = serverUtcOffsetHours(serverTz, parsed.ms);
  if (offset === null) return raw;
  return formatRawWall(parsed.ms + (VN_UTC_OFFSET_HOURS - offset) * HOUR_MS, parsed.hasSeconds);
}

/** Giờ (0-23) theo giờ Việt Nam của một mốc giờ máy chủ sàn; null nếu không quy đổi được. */
export function vietnamHourFromBrokerRaw(raw: string, serverTz: string | null | undefined): number | null {
  const vn = brokerRawToVietnamRaw(raw, serverTz);
  const m = vn.match(RAW_RE);
  return m ? Number(m[4]) : null;
}

/** Mốc 00:00 hôm qua theo giờ Việt Nam, tính bằng giây epoch (dùng cho bộ lọc `after:` của Gmail). */
export function startOfYesterdayVnEpochSeconds(nowMs: number = Date.now()): number {
  const dayMs = 24 * HOUR_MS;
  const vnNow = nowMs + VN_UTC_OFFSET_HOURS * HOUR_MS;
  const startOfTodayVn = Math.floor(vnNow / dayMs) * dayMs;
  return Math.floor((startOfTodayVn - dayMs - VN_UTC_OFFSET_HOURS * HOUR_MS) / 1000);
}

/**
 * Bản sao của dataset mà mọi thời điểm lệnh đã được đổi sang GIỜ VIỆT NAM, dùng cho mọi màn hình hiển thị
 * (nhật ký, lịch, bộ lọc ngày, thống kê theo ngày/phiên) để ngày và giờ luôn khớp nhau.
 *
 * Lưu ý: trong bản sao này `openTimeRaw`/`closeTimeRaw` đã là giờ Việt Nam, nên `serverTimezone` của
 * tài khoản được đặt thành 'UTC+7' để không bị quy đổi lần thứ hai. Màn hình Cài đặt phải dùng dataset gốc.
 */
export function toVietnamTimeDataset(dataset: WorkspaceDataset): WorkspaceDataset {
  const tzByAccount = new Map(dataset.accounts.map((a) => [a.id, a.serverTimezone]));
  return {
    ...dataset,
    accounts: dataset.accounts.map((a) => ({ ...a, serverTimezone: 'UTC+7', displayTimezone: 'Asia/Ho_Chi_Minh' })),
    trades: dataset.trades.map((t) => {
      const tz = tzByAccount.get(t.accountId);
      return {
        ...t,
        openTimeRaw: brokerRawToVietnamRaw(t.openTimeRaw, tz),
        closeTimeRaw: brokerRawToVietnamRaw(t.closeTimeRaw, tz),
      };
    }),
  };
}
