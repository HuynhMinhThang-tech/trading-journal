import React from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

// Các lớp dùng chung cho nút và ô nhập của giao diện app (cao tối thiểu 44px để dễ chạm bằng ngón tay).

export const FIELD_BASE =
  'w-full rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3.5 min-h-[44px] text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9] placeholder:text-[#8A877E] focus:outline-none focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/20 transition-colors';

export const BTN_PRIMARY =
  'press inline-flex items-center justify-center gap-2 rounded-xl bg-[#C96442] px-4 min-h-[48px] text-sm font-semibold text-white hover:bg-[#B55535] active:bg-[#A24D2F] disabled:opacity-50 transition-colors';

export const BTN_SECONDARY =
  'press inline-flex items-center justify-center gap-2 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-4 min-h-[48px] text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] disabled:opacity-50 transition-colors';

export const BTN_DANGER =
  'press inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--pnl-loss-line)] bg-white dark:bg-[#22211E] px-4 min-h-[48px] text-sm font-semibold text-loss hover:bg-[color:var(--pnl-loss-soft)] disabled:opacity-50 transition-colors';

export const CARD =
  'rounded-2xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E]';

const MUTED = 'text-[#55534D] dark:text-[#C2BFB6]';

// ---------------------------------------------------------------------------------------------
// Ô chọn (giữ <select> gốc để iOS hiện bánh xe chọn của hệ điều hành) có mũi tên riêng, đồng bộ giao diện
// ---------------------------------------------------------------------------------------------

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
  /** Thấp hơn (38px) cho thanh lọc trên máy tính. */
  compact?: boolean;
};

export const SelectField: React.FC<SelectFieldProps> = ({
  className = '',
  wrapperClassName = '',
  compact = false,
  children,
  ...rest
}) => (
  <div className={`relative ${wrapperClassName}`}>
    <select
      {...rest}
      className={`${FIELD_BASE} appearance-none pr-9 ${compact ? '!min-h-[38px] !rounded-lg !text-xs' : ''} ${className}`}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${MUTED}`}
    />
  </div>
);

// ---------------------------------------------------------------------------------------------
// Ô ngày: iOS để ô ngày trống hoàn toàn trắng trơn, nên thêm nhãn gợi ý "Chọn ngày"
// ---------------------------------------------------------------------------------------------

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

export const DateField: React.FC<DateFieldProps> = ({ label, value, onChange, min, max }) => (
  <label className="block min-w-0">
    <span className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>{label}</span>
    <span className="relative block">
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        data-empty={!value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD_BASE} peer font-mono-num`}
      />
      {!value && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#8A877E] peer-focus:hidden">
          Chọn ngày
        </span>
      )}
    </span>
  </label>
);

// ---------------------------------------------------------------------------------------------
// Ô tìm kiếm có nút xóa nhanh
// ---------------------------------------------------------------------------------------------

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  className?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}) => (
  <div className={`relative ${className}`}>
    <Search
      aria-hidden="true"
      className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${MUTED}`}
    />
    <input
      type="search"
      inputMode="search"
      enterKeyHint="search"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className={`${FIELD_BASE} appearance-none pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden`}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Xóa nội dung tìm kiếm"
        className={`absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] ${MUTED}`}
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------------------------
// Chip (lựa chọn nhanh) và hàng chip cuộn ngang
// ---------------------------------------------------------------------------------------------

interface ChipProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({ active = false, onClick, children, icon, className = '' }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`press inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-colors ${
      active
        ? 'border-[#C96442] bg-[#C96442]/10 text-[#B55535] dark:border-[#D97757] dark:bg-[#D97757]/15 dark:text-[#E8987D]'
        : 'border-[#E7E5E0] bg-white text-[#55534D] dark:border-[#32302B] dark:bg-[#22211E] dark:text-[#C2BFB6]'
    } ${className}`}
  >
    {icon}
    {children}
  </button>
);

/** Hàng chip cuộn ngang, tràn sát mép màn hình như các app native; trên máy tính thì xuống dòng bình thường. */
export const ChipScroller: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    data-no-swipe
    className={`no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 ${className}`}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------------------------
// Segmented control (chuyển nhanh giữa 2–4 chế độ xem)
// ---------------------------------------------------------------------------------------------

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-no-swipe
      className={`flex rounded-xl bg-[#F3F1EC] p-1 dark:bg-[#181715] ${className}`}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
              active
                ? 'bg-white text-[#1C1B18] shadow-xs dark:bg-[#2A2925] dark:text-[#F2EFE9]'
                : 'text-[#55534D] dark:text-[#C2BFB6]'
            }`}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
