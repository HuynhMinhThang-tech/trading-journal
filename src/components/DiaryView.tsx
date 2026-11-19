import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Search, X } from 'lucide-react';
import { formatIsoDisplay, isoFromRaw } from '../lib/dateUtils.ts';
import {
  formatDateTimeDisplay,
  formatExactHoldingDuration,
  formatPrice,
  formatUsd,
} from '../lib/format.ts';
import { pnlTextClass } from '../lib/pnl.ts';
import type { JournalEntry, RuleAdherence, TradeRecord } from '../shared/types.ts';

interface DiaryViewProps {
  trades: TradeRecord[];
  /** Ngày (YYYY-MM-DD) được chọn từ lịch Tổng quan; null = xem tất cả. */
  focusDay: string | null;
  onClearFocusDay: () => void;
  onSaveJournal: (
    tradeId: string,
    payload: Omit<JournalEntry, 'id' | 'tradeId' | 'updatedAt'>,
  ) => Promise<void>;
}

const ADHERENCE_LABELS: Record<RuleAdherence, string> = {
  tuan_thu: 'Tuân thủ kế hoạch',
  vi_pham_nhe: 'Vi phạm nhẹ',
  vi_pham: 'Vi phạm kỷ luật',
};

const SELECT_CLASS =
  'rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-xs font-medium min-h-[38px]';

const FIELD_CLASS =
  'w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-2 text-sm';

function tradeDay(t: TradeRecord): string {
  return isoFromRaw(t.closeTimeRaw ?? t.openTimeRaw);
}

function hasNote(t: TradeRecord): boolean {
  return Boolean(
    t.journal &&
      (t.journal.strategy || t.journal.thesis || t.journal.lessonLearned || t.journal.exitReason),
  );
}

export const DiaryView: React.FC<DiaryViewProps> = ({
  trades,
  focusDay,
  onClearFocusDay,
  onSaveJournal,
}) => {
  const [noteFilter, setNoteFilter] = useState<'all' | 'documented' | 'missing'>('all');
  const [adherenceFilter, setAdherenceFilter] = useState<'ALL' | RuleAdherence>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [strategy, setStrategy] = useState('');
  const [marketCondition, setMarketCondition] = useState('');
  const [thesis, setThesis] = useState('');
  const [plannedEntry, setPlannedEntry] = useState('');
  const [plannedSL, setPlannedSL] = useState('');
  const [plannedTP, setPlannedTP] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [emotionBefore, setEmotionBefore] = useState('');
  const [emotionDuring, setEmotionDuring] = useState('');
  const [emotionAfter, setEmotionAfter] = useState('');
  const [ruleAdherence, setRuleAdherence] = useState<RuleAdherence>('tuan_thu');
  const [mistakeTagsText, setMistakeTagsText] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');

  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) =>
      (b.closeTimeRaw ?? b.openTimeRaw).localeCompare(a.closeTimeRaw ?? a.openTimeRaw),
    );
  }, [trades]);

  const filtered = useMemo(() => {
    return sortedTrades.filter((t) => {
      if (focusDay && tradeDay(t) !== focusDay) return false;
      if (sideFilter !== 'ALL' && t.side !== sideFilter) return false;
      const noted = hasNote(t);
      if (noteFilter === 'documented' && !noted) return false;
      if (noteFilter === 'missing' && noted) return false;
      if (adherenceFilter !== 'ALL' && t.journal?.ruleAdherence !== adherenceFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${t.symbol} ${t.openTimeRaw} ${t.closeTimeRaw ?? ''} ${t.journal?.strategy ?? ''} ${t.journal?.thesis ?? ''} ${t.journal?.lessonLearned ?? ''} ${(t.journal?.mistakeTags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedTrades, focusDay, sideFilter, noteFilter, adherenceFilter, search]);

  // Nhóm theo ngày để dễ đối chiếu với lịch ở Tổng quan
  const dayGroups = useMemo(() => {
    const groups: Array<{ day: string; trades: TradeRecord[]; net: number }> = [];
    for (const t of filtered) {
      const day = tradeDay(t);
      const last = groups[groups.length - 1];
      if (last && last.day === day) {
        last.trades.push(t);
        last.net += Number(t.netPL) || 0;
      } else {
        groups.push({ day, trades: [t], net: Number(t.netPL) || 0 });
      }
    }
    return groups.map((g) => ({ ...g, net: Math.round(g.net * 100) / 100 }));
  }, [filtered]);

  // Khi mở từ lịch: tự bung chi tiết các lệnh của ngày đó
  const appliedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusDay) {
      appliedFocus.current = null;
      return;
    }
    if (appliedFocus.current === focusDay) return;
    appliedFocus.current = focusDay;
    setExpandedIds(new Set(sortedTrades.filter((t) => tradeDay(t) === focusDay).map((t) => t.id)));
  }, [focusDay, sortedTrades]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditing = (trade: TradeRecord) => {
    setEditingTradeId(trade.id);
    const j = trade.journal;
    setStrategy(j?.strategy ?? '');
    setMarketCondition(j?.marketCondition ?? '');
    setThesis(j?.thesis ?? '');
    setPlannedEntry(j?.plannedEntry ?? '');
    setPlannedSL(j?.plannedSL ?? '');
    setPlannedTP(j?.plannedTP ?? '');
    setExitReason(j?.exitReason ?? '');
    setEmotionBefore(j?.emotionBefore ?? '');
    setEmotionDuring(j?.emotionDuring ?? '');
    setEmotionAfter(j?.emotionAfter ?? '');
    setRuleAdherence(j?.ruleAdherence ?? 'tuan_thu');
    setMistakeTagsText((j?.mistakeTags ?? []).join(', '));
    setLessonLearned(j?.lessonLearned ?? '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTradeId) return;
    setSaving(true);
    try {
      await onSaveJournal(editingTradeId, {
        strategy,
        marketCondition,
        thesis,
        plannedEntry,
        plannedSL,
        plannedTP,
        exitReason,
        emotionBefore,
        emotionDuring,
        emotionAfter,
        ruleAdherence,
        mistakeTags: mistakeTagsText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        lessonLearned,
      });
      setEditingTradeId(null);
    } finally {
      setSaving(false);
    }
  };

  const documentedCount = trades.filter(hasNote).length;

  const renderDetail = (t: TradeRecord) => {
    const isEditing = editingTradeId === t.id;
    const j = t.journal;
    const feeSwap = (Number(t.commission) || 0) + (Number(t.swap) || 0);

    return (
      <div className="px-4 py-4 bg-[#FAF9F5] dark:bg-[#181715]/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
            {t.openTimeRaw} → {t.closeTimeRaw ?? 'Chưa có giờ đóng'} · Phí/Swap:{' '}
            {formatUsd(feeSwap)}
          </p>
          {!isEditing && (
            <button
              type="button"
              onClick={() => startEditing(t)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-1.5 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[36px] whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#C96442]" />
              <span>{j ? 'Chỉnh sửa nhật ký' : 'Viết nhật ký'}</span>
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Chiến lược / Setup</label>
                <input
                  type="text"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Điều kiện thị trường</label>
                <input
                  type="text"
                  value={marketCondition}
                  onChange={(e) => setMarketCondition(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Entry dự kiến</label>
                <input
                  type="text"
                  value={plannedEntry}
                  onChange={(e) => setPlannedEntry(e.target.value)}
                  className={`${FIELD_CLASS} font-mono-num`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">SL kế hoạch</label>
                <input
                  type="text"
                  value={plannedSL}
                  onChange={(e) => setPlannedSL(e.target.value)}
                  className={`${FIELD_CLASS} font-mono-num`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">TP kế hoạch</label>
                <input
                  type="text"
                  value={plannedTP}
                  onChange={(e) => setPlannedTP(e.target.value)}
                  className={`${FIELD_CLASS} font-mono-num`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Lý do vào lệnh (Thesis)</label>
                <textarea
                  rows={2}
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Lý do thoát lệnh</label>
                <textarea
                  rows={2}
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Cảm xúc trước lệnh</label>
                <input
                  type="text"
                  value={emotionBefore}
                  onChange={(e) => setEmotionBefore(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Cảm xúc trong lệnh</label>
                <input
                  type="text"
                  value={emotionDuring}
                  onChange={(e) => setEmotionDuring(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Cảm xúc sau lệnh</label>
                <input
                  type="text"
                  value={emotionAfter}
                  onChange={(e) => setEmotionAfter(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Tuân thủ kế hoạch</label>
                <select
                  value={ruleAdherence}
                  onChange={(e) => setRuleAdherence(e.target.value as RuleAdherence)}
                  className={FIELD_CLASS}
                >
                  {(Object.keys(ADHERENCE_LABELS) as RuleAdherence[]).map((k) => (
                    <option key={k} value={k}>
                      {ADHERENCE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Thẻ lỗi sai (cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={mistakeTagsText}
                  onChange={(e) => setMistakeTagsText(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Bài học rút ra</label>
              <textarea
                rows={2}
                value={lessonLearned}
                onChange={(e) => setLessonLearned(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTradeId(null)}
                className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-4 py-2 text-xs font-medium min-h-[38px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#C96442] px-4 py-2 text-xs font-medium text-white hover:bg-[#B55535] disabled:opacity-50 min-h-[38px]"
              >
                {saving ? 'Đang lưu...' : 'Lưu nhật ký'}
              </button>
            </div>
          </form>
        ) : j ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Chiến lược:</span>{' '}
                <strong>{j.strategy || '—'}</strong>
              </p>
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Bối cảnh:</span>{' '}
                {j.marketCondition || '—'}
              </p>
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Tuân thủ:</span>{' '}
                {ADHERENCE_LABELS[j.ruleAdherence]}
              </p>
            </div>
            <div className="space-y-1">
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Lý do vào:</span>{' '}
                {j.thesis || '—'}
              </p>
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Lý do ra:</span>{' '}
                {j.exitReason || '—'}
              </p>
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Tâm lý:</span>{' '}
                {[j.emotionBefore, j.emotionDuring, j.emotionAfter].filter(Boolean).join(' → ') || '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Thẻ lỗi:</span>{' '}
                {j.mistakeTags.length > 0 ? j.mistakeTags.join(' · ') : 'Không có'}
              </p>
              <p>
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Bài học:</span>{' '}
                {j.lessonLearned || '—'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#6B6963] dark:text-[#A6A39B]">Chưa có nhật ký cho lệnh này.</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Nhật ký giao dịch</h2>
        <div className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B] shrink-0">
          Đã ghi nhật ký:{' '}
          <strong className="text-[#1C1B18] dark:text-[#F2EFE9]">
            {documentedCount}/{trades.length}
          </strong>{' '}
          lệnh
        </div>
      </div>

      {/* Filters */}
      <div
        data-no-swipe
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#6B6963] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã, chiến lược, lý do vào lệnh, bài học..."
            className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#C96442]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {focusDay && (
            <button
              type="button"
              onClick={onClearFocusDay}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C96442]/50 bg-[#C96442]/10 px-3 py-2 text-xs font-medium min-h-[38px]"
              aria-label="Bỏ lọc theo ngày"
            >
              <span className="font-mono-num">Ngày {formatIsoDisplay(focusDay)}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <select
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value as 'ALL' | 'BUY' | 'SELL')}
            aria-label="Chiều lệnh"
            className={SELECT_CLASS}
          >
            <option value="ALL">Mọi chiều</option>
            <option value="BUY">MUA</option>
            <option value="SELL">BÁN</option>
          </select>

          <select
            value={noteFilter}
            onChange={(e) => setNoteFilter(e.target.value as 'all' | 'documented' | 'missing')}
            aria-label="Trạng thái nhật ký"
            className={SELECT_CLASS}
          >
            <option value="all">Tất cả nhật ký</option>
            <option value="documented">Đã ghi</option>
            <option value="missing">Chưa ghi</option>
          </select>

          <select
            value={adherenceFilter}
            onChange={(e) => setAdherenceFilter(e.target.value as 'ALL' | RuleAdherence)}
            aria-label="Mức tuân thủ"
            className={SELECT_CLASS}
          >
            <option value="ALL">Mọi mức tuân thủ</option>
            <option value="tuan_thu">Tuân thủ kế hoạch</option>
            <option value="vi_pham_nhe">Vi phạm nhẹ</option>
            <option value="vi_pham">Vi phạm kỷ luật</option>
          </select>
        </div>
      </div>

      {/* Trades table */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#6B6963] dark:text-[#A6A39B] text-[11px] tracking-wide">
                <th className="py-2.5 pr-4 font-medium">MÃ GIAO DỊCH</th>
                <th className="py-2.5 px-3 font-medium">CHIỀU</th>
                <th className="py-2.5 px-3 font-medium">GIÁ VÀO → RA</th>
                <th className="py-2.5 px-3 font-medium text-right">KHỐI LƯỢNG</th>
                <th className="py-2.5 px-3 font-medium">THỜI GIAN GIỮ</th>
                <th className="py-2.5 px-3 font-medium text-right">LÃI / LỖ RÒNG</th>
                <th className="py-2.5 pl-3 font-medium text-right">ĐÁNH GIÁ</th>
              </tr>
            </thead>
            <tbody>
              {dayGroups.map((group) => (
                <React.Fragment key={group.day}>
                  <tr className="bg-[#F3F1EC] dark:bg-[#181715]">
                    <td colSpan={7} className="py-2 px-3">
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-semibold font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]">
                          {formatIsoDisplay(group.day)}
                          <span className="ml-2 font-normal text-[#6B6963] dark:text-[#A6A39B]">
                            {group.trades.length} lệnh
                          </span>
                        </span>
                        <span className={`font-mono-num font-semibold ${pnlTextClass(group.net)}`}>
                          {formatUsd(group.net)}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {group.trades.map((t) => {
                    const netNum = Number(t.netPL);
                    const noted = hasNote(t);
                    const expanded = expandedIds.has(t.id);
                    const tickerShort = t.symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
                    return (
                      <React.Fragment key={t.id}>
                        <tr
                          onClick={() => toggleExpanded(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleExpanded(t.id);
                            }
                          }}
                          tabIndex={0}
                          aria-expanded={expanded}
                          className="border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70 hover:bg-[#FAF9F5] dark:hover:bg-[#181715]/60 cursor-pointer transition-colors focus:outline-none focus-visible:bg-[#FAF9F5] dark:focus-visible:bg-[#181715]/60"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <span className="h-8 w-8 rounded-lg bg-[#F3F1EC] dark:bg-[#181715] border border-[#E7E5E0] dark:border-[#32302B] flex items-center justify-center font-mono-num text-[11px] font-semibold text-[#6B6963] dark:text-[#A6A39B] shrink-0">
                                {tickerShort}
                              </span>
                              <div>
                                <p className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">{t.symbol}</p>
                                <p className="text-[11px] font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                                  {formatDateTimeDisplay(t.openTimeRaw)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`font-semibold ${t.side === 'BUY' ? 'text-win' : 'text-loss'}`}>
                              {t.side === 'BUY' ? 'MUA' : 'BÁN'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono-num">
                            <div className="font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
                              {formatPrice(t.entryPrice)}
                            </div>
                            <div className="text-[11px] text-[#6B6963] dark:text-[#A6A39B]">
                              {formatPrice(t.exitPrice)}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono-num font-medium">
                            {Number(t.volume).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]">
                            {formatExactHoldingDuration(t.openTimeRaw, t.closeTimeRaw, t.holdingMinutes)}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono-num font-semibold ${pnlTextClass(netNum)}`}
                          >
                            {formatUsd(t.netPL)}
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`text-[11px] font-medium ${
                                  noted ? 'text-win' : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {noted ? 'ĐÃ ĐÁNH GIÁ' : 'CHỜ ĐÁNH GIÁ'}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] transition-transform ${
                                  expanded ? 'rotate-180' : ''
                                }`}
                              />
                            </span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70">
                            <td colSpan={7} className="p-0">
                              {renderDetail(t)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[#6B6963] dark:text-[#A6A39B]">
                    Chưa có lệnh giao dịch nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
