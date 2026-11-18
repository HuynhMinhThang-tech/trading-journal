import React, { useMemo, useState } from 'react';
import { BookOpen, Filter, Search } from 'lucide-react';
import type { JournalEntry, RuleAdherence, TradeRecord } from '../shared/types.ts';

interface DiaryViewProps {
  trades: TradeRecord[];
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

function formatMoney(val: string): string {
  const num = Number(val);
  if (Number.isNaN(num)) return '$0.00';
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}g ${m}p` : `${h} giờ`;
}

export const DiaryView: React.FC<DiaryViewProps> = ({ trades, onSaveJournal }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'documented' | 'missing'>('all');
  const [adherenceFilter, setAdherenceFilter] = useState<'ALL' | RuleAdherence>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [search, setSearch] = useState('');
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
      if (sideFilter !== 'ALL' && t.side !== sideFilter) return false;
      const hasNote = Boolean(
        t.journal &&
          (t.journal.strategy ||
            t.journal.thesis ||
            t.journal.lessonLearned ||
            t.journal.exitReason),
      );
      if (filterMode === 'documented' && !hasNote) return false;
      if (filterMode === 'missing' && hasNote) return false;
      if (adherenceFilter !== 'ALL' && t.journal?.ruleAdherence !== adherenceFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${t.symbol} ${t.openTimeRaw} ${t.closeTimeRaw ?? ''} ${t.journal?.strategy ?? ''} ${t.journal?.thesis ?? ''} ${t.journal?.lessonLearned ?? ''} ${(t.journal?.mistakeTags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedTrades, sideFilter, filterMode, adherenceFilter, search]);

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

  const documentedCount = trades.filter(
    (t) =>
      t.journal &&
      (t.journal.strategy || t.journal.thesis || t.journal.lessonLearned || t.journal.exitReason),
  ).length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Nhật ký giao dịch & Kinh nghiệm cá nhân</h2>
          <p className="mt-1 text-xs text-[#6B6963] dark:text-[#A6A39B]">
            Xem lại toàn bộ lịch sử lệnh đã đóng từ báo cáo cuối ngày (giá vào/ra, thời gian giữ, phí và P/L) để ghi nhận bối cảnh, tâm lý và bài học rút ra sau mỗi giao dịch.
          </p>
        </div>
        <div className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B] shrink-0">
          Đã ghi nhật ký:{' '}
          <strong className="text-[#1C1B18] dark:text-[#F2EFE9]">
            {documentedCount}/{trades.length}
          </strong>{' '}
          lệnh
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
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
          <div className="inline-flex rounded-lg bg-[#F3F1EC] dark:bg-[#181715] p-1">
            {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setSideFilter(side)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  sideFilter === side
                    ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                    : 'text-[#6B6963] dark:text-[#A6A39B]'
                }`}
              >
                {side === 'ALL' ? 'Mọi chiều' : side}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg bg-[#F3F1EC] dark:bg-[#181715] p-1">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'documented', label: 'Đã ghi' },
                { id: 'missing', label: 'Chưa ghi' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterMode === opt.id
                    ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                    : 'text-[#6B6963] dark:text-[#A6A39B]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[#6B6963]" />
            <select
              value={adherenceFilter}
              onChange={(e) => setAdherenceFilter(e.target.value as 'ALL' | RuleAdherence)}
              className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-xs font-medium min-h-[38px]"
            >
              <option value="ALL">Mọi mức tuân thủ</option>
              <option value="tuan_thu">Tuân thủ kế hoạch</option>
              <option value="vi_pham_nhe">Vi phạm nhẹ</option>
              <option value="vi_pham">Vi phạm kỷ luật</option>
            </select>
          </div>
        </div>
      </div>

      {/* Diary List */}
      <div className="space-y-4">
        {filtered.map((t) => {
          const isEditing = editingTradeId === t.id;
          const j = t.journal;
          const netNum = Number(t.netPL);
          return (
            <div
              key={t.id}
              className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5"
            >
              {/* Execution Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{t.symbol}</span>
                    <span>·</span>
                    <span
                      className={`font-medium ${
                        t.side === 'BUY'
                          ? 'text-[#15803D] dark:text-[#4ADE80]'
                          : 'text-[#B91C1C] dark:text-[#F87171]'
                      }`}
                    >
                      {t.side} {t.volume} lot
                    </span>
                    <span>·</span>
                    <span className="font-mono-num text-xs text-[#6B6963] dark:text-[#A6A39B]">
                      {t.entryPrice} → {t.exitPrice ?? '—'}
                    </span>
                  </div>
                  <div className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                    {t.openTimeRaw} → {t.closeTimeRaw ?? 'Chưa có giờ đóng'} · Giữ lệnh:{' '}
                    {formatDuration(t.holdingMinutes)} · Phí/Swap:{' '}
                    {formatMoney(String(Number(t.commission) + Number(t.swap)))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono-num text-base font-semibold ${
                      netNum > 0
                        ? 'text-[#15803D] dark:text-[#4ADE80]'
                        : netNum < 0
                          ? 'text-[#B91C1C] dark:text-[#F87171]'
                          : ''
                    }`}
                  >
                    {formatMoney(t.netPL)}
                  </span>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => startEditing(t)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-3 py-1.5 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[36px] whitespace-nowrap"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#C96442]" />
                      <span>{j ? 'Chỉnh sửa nhật ký' : 'Viết nhật ký'}</span>
                    </button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <form onSubmit={handleSave} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Chiến lược / Setup</label>
                      <input
                        type="text"
                        value={strategy}
                        onChange={(e) => setStrategy(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Điều kiện thị trường</label>
                      <input
                        type="text"
                        value={marketCondition}
                        onChange={(e) => setMarketCondition(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
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
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">SL kế hoạch</label>
                      <input
                        type="text"
                        value={plannedSL}
                        onChange={(e) => setPlannedSL(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">TP kế hoạch</label>
                      <input
                        type="text"
                        value={plannedTP}
                        onChange={(e) => setPlannedTP(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm font-mono-num"
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
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Lý do thoát lệnh</label>
                      <textarea
                        rows={2}
                        value={exitReason}
                        onChange={(e) => setExitReason(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
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
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Cảm xúc trong lệnh</label>
                      <input
                        type="text"
                        value={emotionDuring}
                        onChange={(e) => setEmotionDuring(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Cảm xúc sau lệnh</label>
                      <input
                        type="text"
                        value={emotionAfter}
                        onChange={(e) => setEmotionAfter(e.target.value)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Tuân thủ kế hoạch</label>
                      <select
                        value={ruleAdherence}
                        onChange={(e) => setRuleAdherence(e.target.value as RuleAdherence)}
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
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
                        className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Bài học rút ra</label>
                    <textarea
                      rows={2}
                      value={lessonLearned}
                      onChange={(e) => setLessonLearned(e.target.value)}
                      className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
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
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
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
                <p className="mt-3 text-xs text-[#6B6963] dark:text-[#A6A39B]">
                  Chưa có ghi chép kinh nghiệm cho lệnh này. Bấm &quot;Viết nhật ký&quot; để lưu lại setup, tâm lý và bài học cá nhân.
                </p>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-8 text-center text-sm text-[#6B6963]">
            Chưa có lệnh giao dịch nào trong lịch sử phù hợp với bộ lọc.
          </div>
        )}
      </div>
    </div>
  );
};
