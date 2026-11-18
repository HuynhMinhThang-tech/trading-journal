import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Search, Star, Trash2, X } from 'lucide-react';
import type {
  ObservationTimeframe,
  PriceObservation,
  TradingSessionName,
} from '../shared/types.ts';

interface ResearchViewProps {
  observations: PriceObservation[];
  onCreate: (input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdate: (
    id: string,
    input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const TIMEFRAMES: ObservationTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const SESSIONS: TradingSessionName[] = ['Á', 'Âu', 'Mỹ', 'Giao phiên Âu-Mỹ'];

const QUICK_PRICE_ACTIONS = [
  'Quét thanh khoản 2 đầu',
  'Phá vỡ giả (Fakeout)',
  'Pullback về vùng cung/cầu',
  'Mở rộng biên độ đầu phiên',
  'Tích lũy trong biên độ hẹp',
  'Đảo chiều chữ V tại mốc tròn',
];

const QUICK_CANDLES = [
  'Pin Bar rút râu dài',
  'Nhấn chìm tăng (Bullish Engulfing)',
  'Nhấn chìm giảm (Bearish Engulfing)',
  'Marubozu lực mạnh',
  'Inside Bar nén lực',
  'Doji lưỡng lự',
];

export const ResearchView: React.FC<ResearchViewProps> = ({
  observations,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [search, setSearch] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [tfFilter, setTfFilter] = useState<'ALL' | ObservationTimeframe>('ALL');
  const [sessionFilter, setSessionFilter] = useState<'ALL' | TradingSessionName>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const [symbol, setSymbol] = useState('NAS100ft');
  const [observedDate, setObservedDate] = useState(today);
  const [observedTime, setObservedTime] = useState(nowTime);
  const [timeframe, setTimeframe] = useState<ObservationTimeframe>('M15');
  const [session, setSession] = useState<TradingSessionName>('Mỹ');
  const [priceAction, setPriceAction] = useState('');
  const [candlePattern, setCandlePattern] = useState('');
  const [marketContext, setMarketContext] = useState('');
  const [confidence, setConfidence] = useState<number>(4);
  const [habitTag, setHabitTag] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');

  const symbols = useMemo(() => {
    const s = new Set(observations.map((o) => o.symbol));
    return ['ALL', ...Array.from(s)];
  }, [observations]);

  const filtered = useMemo(() => {
    return observations.filter((o) => {
      if (symbolFilter !== 'ALL' && o.symbol !== symbolFilter) return false;
      if (tfFilter !== 'ALL' && o.timeframe !== tfFilter) return false;
      if (sessionFilter !== 'ALL' && o.session !== sessionFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${o.symbol} ${o.priceAction} ${o.candlePattern} ${o.marketContext} ${o.habitTag} ${o.outcomeNote}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [observations, symbolFilter, tfFilter, sessionFilter, search]);

  // Pattern / Habit recognition summary from filtered observations
  const habitSummary = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; symbol: string; session: string; habit: string; count: number; totalConf: number }
    >();
    for (const o of filtered) {
      const label = o.habitTag.trim() || o.priceAction.trim();
      const k = `${o.symbol}::${o.session}::${label}`;
      const existing = groups.get(k) ?? {
        key: k,
        symbol: o.symbol,
        session: o.session,
        habit: label,
        count: 0,
        totalConf: 0,
      };
      existing.count++;
      existing.totalConf += o.confidence;
      groups.set(k, existing);
    }
    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filtered]);

  const openNewModal = () => {
    setEditingId(null);
    setSymbol('NAS100ft');
    setObservedDate(new Date().toISOString().slice(0, 10));
    setObservedTime(new Date().toTimeString().slice(0, 5));
    setTimeframe('M15');
    setSession('Mỹ');
    setPriceAction('');
    setCandlePattern('');
    setMarketContext('');
    setConfidence(4);
    setHabitTag('');
    setOutcomeNote('');
    setModalOpen(true);
  };

  const openEditModal = (obs: PriceObservation) => {
    setEditingId(obs.id);
    setSymbol(obs.symbol);
    setObservedDate(obs.observedDate);
    setObservedTime(obs.observedTime);
    setTimeframe(obs.timeframe);
    setSession(obs.session);
    setPriceAction(obs.priceAction);
    setCandlePattern(obs.candlePattern);
    setMarketContext(obs.marketContext);
    setConfidence(obs.confidence);
    setHabitTag(obs.habitTag);
    setOutcomeNote(obs.outcomeNote);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      symbol: symbol.trim(),
      observedDate,
      observedTime,
      timeframe,
      session,
      priceAction: priceAction.trim(),
      candlePattern: candlePattern.trim(),
      marketContext: marketContext.trim(),
      confidence,
      habitTag: habitTag.trim(),
      outcomeNote: outcomeNote.trim(),
    };
    try {
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        await onCreate(payload);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <div>
          <h2 className="text-base font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
            Sổ ghi nhận nghiên cứu & Thói quen hành động giá
          </h2>
          <p className="mt-1 text-xs text-[#6B6963] dark:text-[#A6A39B]">
            Ghi lại mã quan sát, ngày giờ, khung thời gian, phiên (Á/Âu/Mỹ), nến và bối cảnh tin tức để nhận diện quy luật giá lặp lại.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#C96442] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B55535] transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Ghi nhận quan sát mới</span>
        </button>
      </div>

      {/* Habit Recognition Summary */}
      {habitSummary.length > 0 && (
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Tổng hợp thói quen giá nổi bật</h3>
            <span className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
              Từ {filtered.length} quan sát đang lọc
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {habitSummary.map((h) => (
              <div
                key={h.key}
                className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] p-3.5"
              >
                <div className="flex items-center justify-between text-xs text-[#6B6963] dark:text-[#A6A39B]">
                  <span>
                    <strong className="text-[#1C1B18] dark:text-[#F2EFE9]">{h.symbol}</strong> · Phiên {h.session}
                  </span>
                  <span className="font-mono-num font-semibold text-[#C96442]">
                    {h.count} lần
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
                  {h.habit}
                </p>
                <p className="mt-1 text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                  Độ tin cậy TB: {(h.totalConf / h.count).toFixed(1)}/5
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#6B6963] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lọc theo hành động giá, nến, tin tức, thẻ thói quen..."
            className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#C96442]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-xs font-medium min-h-[40px]"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'Tất cả mã' : s}
              </option>
            ))}
          </select>

          <select
            value={tfFilter}
            onChange={(e) => setTfFilter(e.target.value as 'ALL' | ObservationTimeframe)}
            className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-xs font-medium min-h-[40px]"
          >
            <option value="ALL">Mọi khung</option>
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>

          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value as 'ALL' | TradingSessionName)}
            className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-xs font-medium min-h-[40px]"
          >
            <option value="ALL">Mọi phiên</option>
            {SESSIONS.map((s) => (
              <option key={s} value={s}>
                Phiên {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] text-[#6B6963] dark:text-[#A6A39B]">
                <th className="py-3 px-4 font-medium">Mã</th>
                <th className="py-3 px-3 font-medium">Ngày · Giờ</th>
                <th className="py-3 px-3 font-medium">Khung · Phiên</th>
                <th className="py-3 px-3 font-medium">Hành động giá</th>
                <th className="py-3 px-3 font-medium">Đặc điểm nến</th>
                <th className="py-3 px-3 font-medium">Bối cảnh & Tin tức</th>
                <th className="py-3 px-3 font-medium text-right">Tin cậy</th>
                <th className="py-3 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70">
              {filtered.map((o) => (
                <tr key={o.id} className="hover:bg-[#FAF9F5] dark:hover:bg-[#2A2925]/50">
                  <td className="py-3 px-4 font-semibold">{o.symbol}</td>
                  <td className="py-3 px-3 font-mono-num whitespace-nowrap">
                    <div>{o.observedDate}</div>
                    <div className="text-[11px] text-[#6B6963] dark:text-[#A6A39B]">{o.observedTime}</div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap text-[#6B6963] dark:text-[#A6A39B]">
                    <span className="font-mono-num font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
                      {o.timeframe}
                    </span>{' '}
                    · Phiên {o.session}
                  </td>
                  <td className="py-3 px-3 max-w-[200px]">
                    <div className="font-medium text-[#1C1B18] dark:text-[#F2EFE9]">{o.priceAction}</div>
                    {o.habitTag && (
                      <div className="mt-0.5 text-[11px] text-[#C96442]">Thói quen: {o.habitTag}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 max-w-[180px]">{o.candlePattern}</td>
                  <td className="py-3 px-3 max-w-[220px] text-[#6B6963] dark:text-[#A6A39B]">
                    <div>{o.marketContext || '—'}</div>
                    {o.outcomeNote && (
                      <div className="mt-0.5 text-[11px] text-[#1C1B18] dark:text-[#F2EFE9]">
                        Kết quả: {o.outcomeNote}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                    {o.confidence}/5
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(o)}
                        className="p-2 rounded-lg text-[#6B6963] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
                        aria-label="Sửa quan sát"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(o.id)}
                        className="p-2 rounded-lg text-[#6B6963] hover:text-[#B91C1C] dark:hover:text-[#F87171] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
                        aria-label="Xóa quan sát"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-[#6B6963]">
                    Chưa có quan sát hành động giá nào. Bấm "Ghi nhận quan sát mới" để bắt đầu xây kho thói quen giá.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map((o) => (
          <div
            key={o.id}
            className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                {o.symbol} · <span className="font-mono-num">{o.timeframe}</span> · Phiên {o.session}
              </div>
              <div className="flex items-center gap-1 text-xs font-mono-num text-[#C96442]">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{o.confidence}/5</span>
              </div>
            </div>
            <div className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
              {o.observedDate} · {o.observedTime}
            </div>
            <div className="text-sm font-medium">{o.priceAction}</div>
            <div className="text-xs text-[#6B6963] dark:text-[#A6A39B]">
              <strong>Nến:</strong> {o.candlePattern}
            </div>
            {o.marketContext && (
              <div className="text-xs text-[#6B6963] dark:text-[#A6A39B]">
                <strong>Bối cảnh:</strong> {o.marketContext}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E5E0]/70 dark:border-[#32302B]/70">
              <button
                type="button"
                onClick={() => openEditModal(o)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E7E5E0] dark:border-[#32302B] min-h-[38px]"
              >
                Chỉnh sửa
              </button>
              <button
                type="button"
                onClick={() => onDelete(o.id)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-[#B91C1C] dark:text-[#F87171] border border-[#E7E5E0] dark:border-[#32302B] min-h-[38px]"
              >
                Xóa
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-8 text-center text-sm text-[#6B6963]">
            Chưa có bản ghi quan sát nào.
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7E5E0] dark:border-[#32302B]">
              <h3 className="text-base font-semibold">
                {editingId ? 'Cập nhật quan sát hành động giá' : 'Ghi nhận quan sát hành động giá'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium mb-1">Mã quan sát *</label>
                  <input
                    type="text"
                    required
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder="NAS100ft"
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Ngày *</label>
                  <input
                    type="date"
                    required
                    value={observedDate}
                    onChange={(e) => setObservedDate(e.target.value)}
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Giờ *</label>
                  <input
                    type="time"
                    required
                    value={observedTime}
                    onChange={(e) => setObservedTime(e.target.value)}
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Khung thời gian *</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as ObservationTimeframe)}
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                  >
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Phiên giao dịch *</label>
                  <select
                    value={session}
                    onChange={(e) => setSession(e.target.value as TradingSessionName)}
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                  >
                    {SESSIONS.map((s) => (
                      <option key={s} value={s}>
                        Phiên {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Độ tin cậy quan sát (1–5)</label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setConfidence(n)}
                        className={`min-h-[38px] min-w-[38px] rounded-lg border text-xs font-mono-num font-semibold transition-colors ${
                          confidence >= n
                            ? 'bg-[#C96442] border-[#C96442] text-white'
                            : 'border-[#E7E5E0] dark:border-[#32302B] text-[#6B6963]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Hành động giá quan sát được *</label>
                <input
                  type="text"
                  required
                  value={priceAction}
                  onChange={(e) => setPriceAction(e.target.value)}
                  placeholder="Mô tả giá đã di chuyển như thế nào..."
                  className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {QUICK_PRICE_ACTIONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPriceAction(preset)}
                      className="text-[11px] rounded-md border border-[#E7E5E0] dark:border-[#32302B] px-2 py-1 text-[#6B6963] dark:text-[#A6A39B] hover:border-[#C96442] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9]"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Đặc điểm cây nến *</label>
                <input
                  type="text"
                  required
                  value={candlePattern}
                  onChange={(e) => setCandlePattern(e.target.value)}
                  placeholder="Hình thái nến xác nhận (râu nến, thân nến, volume)..."
                  className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {QUICK_CANDLES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCandlePattern(c)}
                      className="text-[11px] rounded-md border border-[#E7E5E0] dark:border-[#32302B] px-2 py-1 text-[#6B6963] dark:text-[#A6A39B] hover:border-[#C96442] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9]"
                    >
                      + {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Bối cảnh thị trường & Tin tức</label>
                  <input
                    type="text"
                    value={marketContext}
                    onChange={(e) => setMarketContext(e.target.value)}
                    placeholder="VD: Trước tin CPI 15 phút, H4 đang tăng..."
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nhãn thói quen giá (để gom nhóm)</label>
                  <input
                    type="text"
                    value={habitTag}
                    onChange={(e) => setHabitTag(e.target.value)}
                    placeholder="VD: Quét đỉnh phiên Âu rồi sập đầu Mỹ"
                    className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Diễn biến sau đó / Kết luận rút ra</label>
                <textarea
                  rows={2}
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                  placeholder="Giá có đi đúng kỳ vọng không? Có lặp lại thói quen cũ không?"
                  className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-4 py-2 text-sm font-medium min-h-[42px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#C96442] px-5 py-2 text-sm font-medium text-white hover:bg-[#B55535] disabled:opacity-50 min-h-[42px]"
                >
                  {saving ? 'Đang lưu...' : editingId ? 'Lưu cập nhật' : 'Lưu quan sát'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
