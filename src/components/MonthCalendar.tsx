import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  monthLabel,
  todayIso,
} from '../lib/dateUtils.ts';

export type CalendarTone = 'win' | 'loss' | 'neutral' | 'accent';

interface MonthCalendarProps {
  year: number;
  month: number; // 0-11
  onMonthChange: (year: number, month: number) => void;
  /** Nội dung hiển thị trong ô ngày (chỉ gọi cho ngày thuộc tháng đang xem). */
  renderDay: (iso: string) => React.ReactNode;
  /** Màu nền của ô ngày. */
  getTone?: (iso: string) => CalendarTone | null;
  /** Ô nào bấm được. Mặc định: tất cả ngày trong tháng. */
  isClickable?: (iso: string) => boolean;
  onDayClick?: (iso: string) => void;
  selectedIso?: string | null;
  /** Thông tin tóm tắt hiển thị cạnh tên tháng (ví dụ tổng lãi/lỗ của tháng). */
  summary?: React.ReactNode;
}

const TONE_CLASS: Record<CalendarTone, string> = {
  win: 'cal-win',
  loss: 'cal-loss',
  neutral: 'bg-[#FAF9F5] dark:bg-[#181715] border-[#E7E5E0] dark:border-[#32302B]',
  accent: 'bg-[#C96442]/10 dark:bg-[#D97757]/15 border-[#C96442]/35 dark:border-[#D97757]/45',
};

export const MonthCalendar: React.FC<MonthCalendarProps> = ({
  year,
  month,
  onMonthChange,
  renderDay,
  getTone,
  isClickable,
  onDayClick,
  selectedIso = null,
  summary,
}) => {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = todayIso();

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onMonthChange(d.getFullYear(), d.getMonth());
  };

  const goToday = () => {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth());
  };

  return (
    <div data-no-swipe>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Tháng trước"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E7E5E0] dark:border-[#32302B] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[116px] text-center text-sm font-semibold">
            {monthLabel(year, month)}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Tháng sau"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E7E5E0] dark:border-[#32302B] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="min-h-[36px] rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-3 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
          >
            Hôm nay
          </button>
        </div>
        {summary && <div className="text-xs font-mono-num">{summary}</div>}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
        {WEEKDAY_LABELS.map((w) => (
          <div
            key={w}
            className="text-center text-[11px] font-medium text-[#6B6963] dark:text-[#A6A39B] py-1"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return (
              <div
                key={cell.iso}
                className="min-h-[58px] sm:min-h-[84px] rounded-lg p-1.5 text-[11px] text-[#6B6963]/40 dark:text-[#A6A39B]/35"
              >
                {cell.day}
              </div>
            );
          }

          const tone = getTone?.(cell.iso) ?? null;
          const clickable = onDayClick ? (isClickable ? isClickable(cell.iso) : true) : false;
          const isToday = cell.iso === today;
          const isSelected = selectedIso === cell.iso;
          const base = `min-h-[58px] sm:min-h-[84px] rounded-lg border p-1 sm:p-2 text-left overflow-hidden flex flex-col gap-0.5 transition-colors min-w-0 ${
            tone ? TONE_CLASS[tone] : 'border-[#E7E5E0]/70 dark:border-[#32302B]/70 bg-white dark:bg-[#22211E]'
          } ${isToday ? 'ring-1 ring-[#C96442] dark:ring-[#D97757]' : ''} ${
            isSelected ? 'outline-2 outline-[#1C1B18] dark:outline-[#F2EFE9] -outline-offset-2' : ''
          }`;

          const content = (
            <>
              <span
                className={`text-[11px] leading-none ${
                  isToday
                    ? 'font-bold text-[#C96442] dark:text-[#D97757]'
                    : 'font-medium text-[#6B6963] dark:text-[#A6A39B]'
                }`}
              >
                {cell.day}
              </span>
              {renderDay(cell.iso)}
            </>
          );

          return clickable ? (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onDayClick?.(cell.iso)}
              className={`${base} cursor-pointer hover:brightness-95 dark:hover:brightness-110`}
            >
              {content}
            </button>
          ) : (
            <div key={cell.iso} className={base}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};
