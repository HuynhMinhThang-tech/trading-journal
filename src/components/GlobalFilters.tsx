import React, { useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { BottomSheet } from './ui/BottomSheet.tsx';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Chip,
  DateField,
  FIELD_BASE,
  SelectField,
} from './ui/controls.tsx';
import { SheetSection } from './ui/StatGrid.tsx';
import { formatIsoDisplay } from '../lib/dateUtils.ts';

export type RangePreset = 'ALL' | '7D' | '30D' | '90D' | 'CUSTOM';

export const RANGE_PRESET_OPTIONS: Array<{ id: RangePreset; label: string; short: string }> = [
  { id: 'ALL', label: 'Tất cả thời gian', short: 'Tất cả' },
  { id: '7D', label: '7 ngày gần nhất', short: '7 ngày' },
  { id: '30D', label: '30 ngày gần nhất', short: '30 ngày' },
  { id: '90D', label: '90 ngày gần nhất', short: '90 ngày' },
  { id: 'CUSTOM', label: 'Tùy chọn khoảng ngày', short: 'Tùy chọn' },
];

interface GlobalFiltersProps {
  rangePreset: RangePreset;
  dateFrom: string;
  dateTo: string;
  accountFilter: string;
  symbolFilter: string;
  accounts: Array<{ id: string; label: string; accountNumber: string }>;
  /** Danh sách mã, phần tử đầu là 'ALL'. */
  symbols: string[];
  /** Số lệnh còn lại sau khi lọc (hiện trên nút "Xem N lệnh"). */
  resultCount: number;
  onPresetChange: (preset: RangePreset) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onSymbolChange: (value: string) => void;
  onReset: () => void;
}

/**
 * Bộ lọc chung của Tổng quan / Nhật ký / Phân tích.
 * - Điện thoại: một thanh gọn ghim ở đầu trang, hiện tóm tắt bộ lọc đang bật; chạm vào mở panel chọn.
 * - Máy tính: một hàng ngang gọn, các ô cùng chiều cao.
 */
export const GlobalFilters: React.FC<GlobalFiltersProps> = ({
  rangePreset,
  dateFrom,
  dateTo,
  accountFilter,
  symbolFilter,
  accounts,
  symbols,
  resultCount,
  onPresetChange,
  onDateFromChange,
  onDateToChange,
  onAccountChange,
  onSymbolChange,
  onReset,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);

  // "Tùy chọn" mà chưa chọn ngày nào thì chưa lọc gì, không tính là bộ lọc đang bật
  const rangeActive = rangePreset !== 'ALL' && !(rangePreset === 'CUSTOM' && !dateFrom && !dateTo);
  const activeCount = (rangeActive ? 1 : 0) + (accountFilter !== 'ALL' ? 1 : 0) + (symbolFilter !== 'ALL' ? 1 : 0);

  const account = accounts.find((a) => a.id === accountFilter);
  const presetMeta = RANGE_PRESET_OPTIONS.find((o) => o.id === rangePreset) ?? RANGE_PRESET_OPTIONS[0];

  let rangeText = presetMeta.label;
  if (rangePreset === 'CUSTOM') {
    rangeText =
      dateFrom || dateTo
        ? `${dateFrom ? formatIsoDisplay(dateFrom) : '…'} → ${dateTo ? formatIsoDisplay(dateTo) : '…'}`
        : presetMeta.label;
  }
  const summaryParts = [
    rangeText,
    account ? `TK ${account.accountNumber}` : null,
    symbolFilter !== 'ALL' ? symbolFilter : null,
  ].filter(Boolean);

  return (
    <div
      data-no-swipe
      className="max-lg:sticky max-lg:top-0 z-20 border-b border-transparent bg-[#FAF9F5]/90 backdrop-blur-md dark:bg-[#181715]/90 max-lg:border-[#E7E5E0]/60 dark:max-lg:border-[#32302B]/60"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8 lg:pb-0 lg:pt-4">
        {/* ---------------- Điện thoại: thanh tóm tắt ---------------- */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Bộ lọc: ${summaryParts.join(', ')}`}
            className="press flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[#E7E5E0] bg-white px-3.5 text-left dark:border-[#32302B] dark:bg-[#22211E]"
          >
            <span
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                activeCount > 0
                  ? 'bg-[#C96442] text-white'
                  : 'bg-[#F3F1EC] text-[#55534D] dark:bg-[#2A2925] dark:text-[#C2BFB6]'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1C1B18] px-1 text-[10px] font-bold leading-none text-white dark:bg-[#F2EFE9] dark:text-[#1C1B18]">
                  {activeCount}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold leading-tight text-[#55534D] dark:text-[#C2BFB6]">
                Bộ lọc
              </span>
              <span className="block truncate text-sm font-semibold leading-snug text-[#1C1B18] dark:text-[#F2EFE9]">
                {summaryParts.join(' · ')}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[#55534D] dark:text-[#C2BFB6]" />
          </button>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Xóa tất cả bộ lọc"
              className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#E7E5E0] bg-white text-[#55534D] dark:border-[#32302B] dark:bg-[#22211E] dark:text-[#C2BFB6]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ---------------- Máy tính: một hàng ngang ---------------- */}
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#E7E5E0] bg-white px-4 py-3 dark:border-[#32302B] dark:bg-[#22211E] lg:flex">
          <SelectField
            compact
            wrapperClassName="w-[176px]"
            value={rangePreset}
            onChange={(e) => onPresetChange(e.target.value as RangePreset)}
            aria-label="Khoảng thời gian"
          >
            {RANGE_PRESET_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </SelectField>

          <div className="inline-flex items-center gap-2 text-xs text-[#55534D] dark:text-[#C2BFB6]">
            <span>Từ</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => onDateFromChange(e.target.value)}
              aria-label="Từ ngày"
              className={`${FIELD_BASE} !min-h-[38px] !w-[132px] !rounded-lg !px-2 !text-xs font-mono-num`}
            />
            <span>đến</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => onDateToChange(e.target.value)}
              aria-label="Đến ngày"
              className={`${FIELD_BASE} !min-h-[38px] !w-[132px] !rounded-lg !px-2 !text-xs font-mono-num`}
            />
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SelectField
              compact
              wrapperClassName="w-[184px]"
              value={accountFilter}
              onChange={(e) => onAccountChange(e.target.value)}
              aria-label="Tài khoản"
            >
              <option value="ALL">Tất cả tài khoản</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.accountNumber})
                </option>
              ))}
            </SelectField>

            <SelectField
              compact
              wrapperClassName="w-[148px]"
              value={symbolFilter}
              onChange={(e) => onSymbolChange(e.target.value)}
              aria-label="Mã giao dịch"
            >
              {symbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym === 'ALL' ? 'Mọi mã giao dịch' : sym}
                </option>
              ))}
            </SelectField>

            {activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#C96442] hover:bg-[#C96442]/10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Đặt lại
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Panel chọn bộ lọc (điện thoại) ---------------- */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bộ lọc"
        subtitle="Áp dụng cho Tổng quan, Nhật ký và Phân tích"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onReset}
              disabled={activeCount === 0}
              className={`${BTN_SECONDARY} flex-1`}
            >
              Đặt lại
            </button>
            <button type="button" onClick={() => setSheetOpen(false)} className={`${BTN_PRIMARY} flex-[2]`}>
              {resultCount > 0 ? `Xem ${resultCount} lệnh` : 'Xong'}
            </button>
          </div>
        }
      >
        <SheetSection title="Khoảng thời gian" className="!mt-1">
          <div className="grid grid-cols-3 gap-2">
            {RANGE_PRESET_OPTIONS.map((o) => (
              <Chip
                key={o.id}
                active={rangePreset === o.id}
                onClick={() => onPresetChange(o.id)}
                className="w-full justify-center"
              >
                {o.short}
              </Chip>
            ))}
          </div>
          {rangePreset === 'CUSTOM' ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DateField label="Từ ngày" value={dateFrom} max={dateTo || undefined} onChange={onDateFromChange} />
              <DateField label="Đến ngày" value={dateTo} min={dateFrom || undefined} onChange={onDateToChange} />
            </div>
          ) : (
            rangePreset !== 'ALL' &&
            dateFrom &&
            dateTo && (
              <p className="mt-2.5 font-mono-num text-xs text-[#55534D] dark:text-[#C2BFB6]">
                {formatIsoDisplay(dateFrom)} → {formatIsoDisplay(dateTo)}
              </p>
            )
          )}
        </SheetSection>

        {accounts.length > 0 && (
          <SheetSection title="Tài khoản">
            <div className="flex flex-wrap gap-2">
              <Chip active={accountFilter === 'ALL'} onClick={() => onAccountChange('ALL')}>
                Tất cả
              </Chip>
              {accounts.map((a) => (
                <Chip key={a.id} active={accountFilter === a.id} onClick={() => onAccountChange(a.id)}>
                  {a.label} · {a.accountNumber}
                </Chip>
              ))}
            </div>
          </SheetSection>
        )}

        <SheetSection title="Mã giao dịch">
          <div className="flex flex-wrap gap-2">
            {symbols.map((sym) => (
              <Chip key={sym} active={symbolFilter === sym} onClick={() => onSymbolChange(sym)}>
                {sym === 'ALL' ? 'Mọi mã' : sym}
              </Chip>
            ))}
          </div>
        </SheetSection>
      </BottomSheet>
    </div>
  );
};
