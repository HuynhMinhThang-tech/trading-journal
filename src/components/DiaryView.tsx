import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Image as ImageIcon, Search, X } from 'lucide-react';
import { ImageGallery, handleImagePaste, type GalleryItem } from './ImageGallery.tsx';
import { Pagination } from './Pagination.tsx';
import { usePagination } from '../hooks/usePagination.ts';
import {
  ImageUploadError,
  attachmentUrl,
  deleteAttachment,
  prepareImageForUpload,
  uploadAttachment,
} from '../lib/attachments.ts';
import { formatIsoDisplay, isoFromRaw } from '../lib/dateUtils.ts';
import {
  formatDateTimeDisplay,
  formatExactHoldingDuration,
  formatPrice,
  formatUsd,
} from '../lib/format.ts';
import { pnlTextClass } from '../lib/pnl.ts';
import { MAX_IMAGES_PER_OWNER } from '../shared/attachments.ts';
import type { ImageAttachmentRecord, JournalEntry, TradeRecord } from '../shared/types.ts';

interface DiaryViewProps {
  trades: TradeRecord[];
  /** Ngày (YYYY-MM-DD) được chọn từ lịch Tổng quan; null = xem tất cả. */
  focusDay: string | null;
  onClearFocusDay: () => void;
  onSaveJournal: (
    tradeId: string,
    payload: Omit<JournalEntry, 'id' | 'tradeId' | 'updatedAt'>,
  ) => Promise<void>;
  /** Toàn bộ ảnh đính kèm (lọc theo lệnh bên trong). */
  attachments: ImageAttachmentRecord[];
  onAttachmentAdded: (attachment: ImageAttachmentRecord) => void;
  onAttachmentRemoved: (id: string) => void;
}

const PAGE_SIZE = 10;

const SELECT_CLASS =
  'rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-xs font-medium min-h-[38px]';

const FIELD_CLASS =
  'w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-[#C96442]';

// Ba ô mô tả tự do + một ô ghi chú thêm. Các trường cũ của nhật ký (chiến lược, thẻ lỗi, SL/TP kế hoạch...)
// vẫn được giữ nguyên trong cơ sở dữ liệu, không bị xóa khi lưu.
const NOTE_FIELDS = [
  {
    key: 'thesis',
    label: 'Lý do vào lệnh',
  },
  {
    key: 'marketCondition',
    label: 'Bối cảnh thị trường & nến',
  },
  {
    key: 'exitReason',
    label: 'Vì sao cắt sớm / chốt non / thoát lệnh',
  },
  {
    key: 'lessonLearned',
    label: 'Ghi chú thêm / Bài học',
  },
] as const;

type NoteKey = (typeof NOTE_FIELDS)[number]['key'];
type NoteDraft = Record<NoteKey, string>;

const EMPTY_DRAFT: NoteDraft = { thesis: '', marketCondition: '', exitReason: '', lessonLearned: '' };

function tradeDay(t: TradeRecord): string {
  return isoFromRaw(t.closeTimeRaw ?? t.openTimeRaw);
}

function hasNote(t: TradeRecord): boolean {
  const j = t.journal;
  return Boolean(
    j && (j.thesis || j.marketCondition || j.exitReason || j.lessonLearned || j.strategy),
  );
}

export const DiaryView: React.FC<DiaryViewProps> = ({
  trades,
  focusDay,
  onClearFocusDay,
  onSaveJournal,
  attachments,
  onAttachmentAdded,
  onAttachmentRemoved,
}) => {
  const [noteFilter, setNoteFilter] = useState<'all' | 'documented' | 'missing'>('all');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const [imageBusy, setImageBusy] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});

  // Ảnh của từng lệnh (ảnh được lưu ngay khi tải lên, không phụ thuộc nút "Lưu ghi chú")
  const imagesByTrade = useMemo(() => {
    const map = new Map<string, ImageAttachmentRecord[]>();
    for (const a of attachments) {
      if (a.ownerType !== 'trade') continue;
      const list = map.get(a.ownerId) ?? [];
      list.push(a);
      map.set(a.ownerId, list);
    }
    return map;
  }, [attachments]);

  const setTradeImageError = (tradeId: string, message: string | null) =>
    setImageErrors((prev) => {
      const next = { ...prev };
      if (message) next[tradeId] = message;
      else delete next[tradeId];
      return next;
    });

  const addImages = async (tradeId: string, files: File[]) => {
    setTradeImageError(tradeId, null);
    setImageBusy((prev) => new Set(prev).add(tradeId));
    const problems: string[] = [];
    let count = imagesByTrade.get(tradeId)?.length ?? 0;
    for (const file of files) {
      if (count >= MAX_IMAGES_PER_OWNER) {
        problems.push(`Mỗi lệnh chỉ đính kèm tối đa ${MAX_IMAGES_PER_OWNER} ảnh, các ảnh còn lại đã bị bỏ qua.`);
        break;
      }
      try {
        const saved = await uploadAttachment('trade', tradeId, await prepareImageForUpload(file));
        onAttachmentAdded(saved);
        count += 1;
      } catch (err) {
        problems.push(err instanceof ImageUploadError ? err.message : `Không thể tải "${file.name}" lên.`);
      }
    }
    setImageBusy((prev) => {
      const next = new Set(prev);
      next.delete(tradeId);
      return next;
    });
    if (problems.length > 0) setTradeImageError(tradeId, problems.join(' '));
  };

  const removeImage = async (tradeId: string, attachmentId: string) => {
    if (typeof window.confirm === 'function' && !window.confirm('Xóa ảnh này khỏi nhật ký?')) return;
    setTradeImageError(tradeId, null);
    try {
      await deleteAttachment(attachmentId);
      onAttachmentRemoved(attachmentId);
    } catch (err) {
      setTradeImageError(tradeId, err instanceof ImageUploadError ? err.message : 'Không thể xóa ảnh.');
    }
  };

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
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const j = t.journal;
        const hay = `${t.symbol} ${t.openTimeRaw} ${t.closeTimeRaw ?? ''} ${j?.strategy ?? ''} ${j?.thesis ?? ''} ${j?.marketCondition ?? ''} ${j?.exitReason ?? ''} ${j?.lessonLearned ?? ''} ${(j?.mistakeTags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedTrades, focusDay, sideFilter, noteFilter, search]);

  const pagination = usePagination(filtered, PAGE_SIZE, `${focusDay ?? ''}|${sideFilter}|${noteFilter}|${search}`);

  // Tổng theo ngày tính trên toàn bộ kết quả lọc (không phải riêng trang đang xem),
  // để dòng tiêu đề ngày luôn khớp với lịch ở Tổng quan dù ngày đó bị chia qua nhiều trang.
  const dayTotals = useMemo(() => {
    const map = new Map<string, { count: number; net: number }>();
    for (const t of filtered) {
      const day = tradeDay(t);
      const entry = map.get(day) ?? { count: 0, net: 0 };
      entry.count += 1;
      entry.net += Number(t.netPL) || 0;
      map.set(day, entry);
    }
    for (const entry of map.values()) entry.net = Math.round(entry.net * 100) / 100;
    return map;
  }, [filtered]);

  // Nhóm các lệnh của trang hiện tại theo ngày
  const dayGroups = useMemo(() => {
    const groups: Array<{ day: string; trades: TradeRecord[] }> = [];
    for (const t of pagination.pageItems) {
      const day = tradeDay(t);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.trades.push(t);
      else groups.push({ day, trades: [t] });
    }
    return groups;
  }, [pagination.pageItems]);

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
    setDraft({
      thesis: j?.thesis ?? '',
      marketCondition: j?.marketCondition ?? '',
      exitReason: j?.exitReason ?? '',
      lessonLearned: j?.lessonLearned ?? '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTradeId) return;
    // Giữ nguyên các trường cũ (nếu có) để việc sửa ghi chú không làm mất dữ liệu đã lưu trước đây.
    const prev = trades.find((t) => t.id === editingTradeId)?.journal ?? null;
    setSaving(true);
    try {
      await onSaveJournal(editingTradeId, {
        strategy: prev?.strategy ?? '',
        marketCondition: draft.marketCondition.trim(),
        thesis: draft.thesis.trim(),
        plannedEntry: prev?.plannedEntry ?? '',
        plannedSL: prev?.plannedSL ?? '',
        plannedTP: prev?.plannedTP ?? '',
        exitReason: draft.exitReason.trim(),
        emotionBefore: prev?.emotionBefore ?? '',
        emotionDuring: prev?.emotionDuring ?? '',
        emotionAfter: prev?.emotionAfter ?? '',
        ruleAdherence: prev?.ruleAdherence ?? 'tuan_thu',
        mistakeTags: prev?.mistakeTags ?? [],
        lessonLearned: draft.lessonLearned.trim(),
      });
      setEditingTradeId(null);
    } finally {
      setSaving(false);
    }
  };

  const renderDetail = (t: TradeRecord) => {
    const isEditing = editingTradeId === t.id;
    const j = t.journal;
    const feeSwap = (Number(t.commission) || 0) + (Number(t.swap) || 0);
    const legacy: string[] = [];
    if (j?.strategy) legacy.push(`Chiến lược: ${j.strategy}`);
    if (j && j.mistakeTags.length > 0) legacy.push(`Thẻ lỗi: ${j.mistakeTags.join(' · ')}`);

    const galleryItems: GalleryItem[] = (imagesByTrade.get(t.id) ?? []).map((a) => ({
      key: a.id,
      url: attachmentUrl(a.id),
      name: a.fileName,
    }));

    return (
      <div
        className="px-4 py-4 bg-[#FAF9F5] dark:bg-[#181715]/60 space-y-3"
        onPaste={(e) => handleImagePaste(e, (files) => void addImages(t.id, files))}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
            {formatDateTimeDisplay(t.openTimeRaw)} →{' '}
            {t.closeTimeRaw ? formatDateTimeDisplay(t.closeTimeRaw) : 'Chưa có giờ đóng'} · Phí/Swap: {formatUsd(feeSwap)}
          </p>
          {!isEditing && (
            <button
              type="button"
              onClick={() => startEditing(t)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-1.5 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[36px] whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#C96442]" />
              <span>{hasNote(t) ? 'Chỉnh sửa ghi chú' : 'Viết ghi chú'}</span>
            </button>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold">Hình ảnh</p>
          <ImageGallery
            items={galleryItems}
            onAddFiles={(files) => void addImages(t.id, files)}
            onRemove={(key) => void removeImage(t.id, key)}
            busy={imageBusy.has(t.id)}
            error={imageErrors[t.id] ?? null}
          />
        </div>

        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-3">
            {NOTE_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-semibold mb-1">{f.label}</label>
                <textarea
                  rows={3}
                  value={draft[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className={FIELD_CLASS}
                />
              </div>
            ))}

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
                {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
              </button>
            </div>
          </form>
        ) : hasNote(t) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {NOTE_FIELDS.map((f) => (
              <div key={f.key}>
                <p className="text-xs font-semibold text-[#55534D] dark:text-[#C2BFB6]">{f.label}</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{j?.[f.key] || '—'}</p>
              </div>
            ))}
            {legacy.length > 0 && (
              <p className="md:col-span-2 text-xs text-[#55534D] dark:text-[#C2BFB6]">
                {legacy.join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Chưa có ghi chú cho lệnh này.</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div
        data-no-swipe
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#55534D] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã, lý do vào lệnh, bối cảnh, bài học..."
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
        </div>
      </div>

      {/* Trades table: cột chữ căn trái, cột số căn phải (tiêu đề và ô cùng hướng), cột trạng thái căn phải */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <p className="mb-3 text-right text-[11px] font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
          Giờ hiển thị: Việt Nam (UTC+7)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed text-left text-xs">
            <colgroup>
              <col />
              <col className="w-[84px]" />
              <col className="w-[136px]" />
              <col className="w-[104px]" />
              <col className="w-[150px]" />
              <col className="w-[132px]" />
              <col className="w-[148px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#55534D] dark:text-[#C2BFB6] text-[11px] tracking-wide">
                <th className="py-2.5 pr-3 font-semibold text-left">MÃ GIAO DỊCH</th>
                <th className="py-2.5 px-3 font-semibold text-left">CHIỀU</th>
                <th className="py-2.5 px-3 font-semibold text-right">GIÁ VÀO → RA</th>
                <th className="py-2.5 px-3 font-semibold text-right">KHỐI LƯỢNG</th>
                <th className="py-2.5 px-3 font-semibold text-right">THỜI GIAN GIỮ</th>
                <th className="py-2.5 px-3 font-semibold text-right">LÃI / LỖ RÒNG</th>
                <th className="py-2.5 pl-3 font-semibold text-right">ĐÁNH GIÁ</th>
              </tr>
            </thead>
            <tbody>
              {dayGroups.map((group) => {
                const total = dayTotals.get(group.day) ?? { count: group.trades.length, net: 0 };
                return (
                  <React.Fragment key={group.day}>
                    <tr className="bg-[#F3F1EC] dark:bg-[#181715]">
                      <td colSpan={5} className="py-2 pr-3 pl-3 text-left">
                        <span className="text-[11px] font-semibold font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]">
                          {formatIsoDisplay(group.day)}
                          <span className="ml-2 font-normal text-[#55534D] dark:text-[#C2BFB6]">
                            {total.count} lệnh
                          </span>
                        </span>
                      </td>
                      <td
                        className={`py-2 px-3 text-right text-[11px] font-mono-num font-semibold ${pnlTextClass(total.net)}`}
                      >
                        {formatUsd(total.net)}
                      </td>
                      <td />
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
                            <td className="py-3 pr-3 pl-3 text-left">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="h-8 w-8 rounded-lg bg-[#F3F1EC] dark:bg-[#181715] border border-[#E7E5E0] dark:border-[#32302B] flex items-center justify-center font-mono-num text-[11px] font-semibold text-[#55534D] dark:text-[#C2BFB6] shrink-0">
                                  {tickerShort}
                                </span>
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1.5 font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                                    <span className="truncate">{t.symbol}</span>
                                    {(imagesByTrade.get(t.id)?.length ?? 0) > 0 && (
                                      <span
                                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold font-mono-num text-[#55534D] dark:text-[#C2BFB6]"
                                        title="Số ảnh đính kèm"
                                      >
                                        <ImageIcon className="h-3.5 w-3.5" />
                                        {imagesByTrade.get(t.id)?.length}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
                                    {formatDateTimeDisplay(t.openTimeRaw)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-left">
                              <span className={`font-semibold ${t.side === 'BUY' ? 'text-win' : 'text-loss'}`}>
                                {t.side === 'BUY' ? 'MUA' : 'BÁN'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono-num">
                              <div className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                                {formatPrice(t.entryPrice)}
                              </div>
                              <div className="text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
                                {formatPrice(t.exitPrice)}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono-num font-semibold">
                              {Number(t.volume).toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]">
                              {formatExactHoldingDuration(t.openTimeRaw, t.closeTimeRaw, t.holdingMinutes)}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono-num font-semibold ${pnlTextClass(netNum)}`}
                            >
                              {formatUsd(t.netPL)}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <span className="inline-flex items-center justify-end gap-1.5">
                                <span
                                  className={`text-[11px] font-semibold whitespace-nowrap ${
                                    noted ? 'text-win' : 'text-amber-700 dark:text-amber-400'
                                  }`}
                                >
                                  {noted ? 'ĐÃ ĐÁNH GIÁ' : 'CHỜ ĐÁNH GIÁ'}
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 shrink-0 text-[#55534D] dark:text-[#C2BFB6] transition-transform ${
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
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[#55534D] dark:text-[#C2BFB6]">
                    Chưa có lệnh giao dịch nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setPage}
          unit="lệnh"
        />
      </div>
    </div>
  );
};
