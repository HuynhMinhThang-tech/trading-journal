import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Edit3, Image as ImageIcon, List, Plus, SearchX, Star, Tag, Trash2, X } from 'lucide-react';
import { ImageGallery, ThumbStrip, handleImagePaste, type GalleryItem } from './ImageGallery.tsx';
import { MonthCalendar } from './MonthCalendar.tsx';
import { Pagination } from './Pagination.tsx';
import { BottomSheet } from './ui/BottomSheet.tsx';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  Chip,
  ChipScroller,
  FIELD_BASE,
  SearchField,
  SegmentedControl,
  SelectField,
} from './ui/controls.tsx';
import { StatGrid } from './ui/StatGrid.tsx';
import { useIsMobile } from '../hooks/useMediaQuery.ts';
import { usePagination } from '../hooks/usePagination.ts';
import {
  ImageUploadError,
  attachmentUrl,
  deleteAttachment,
  prepareImageForUpload,
  uploadAttachment,
  type PreparedImage,
} from '../lib/attachments.ts';
import { formatIsoDisplay, todayIso } from '../lib/dateUtils.ts';
import { MAX_IMAGES_PER_OWNER } from '../shared/attachments.ts';
import type { ImageAttachmentRecord, PriceObservation } from '../shared/types.ts';

interface ResearchViewProps {
  observations: PriceObservation[];
  attachments: ImageAttachmentRecord[];
  onAttachmentAdded: (attachment: ImageAttachmentRecord) => void;
  onAttachmentRemoved: (id: string) => void;
  /** Trả về bản ghi vừa tạo (để gắn ảnh vào đó) hoặc null nếu lưu thất bại. */
  onCreate: (
    input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<PriceObservation | null | void>;
  onUpdate: (
    id: string,
    input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const PAGE_SIZE = 10;

// Ảnh vừa chọn trong form, chỉ được tải lên khi bấm "Lưu" (để nút "Hủy" bỏ được tất cả thay đổi).
interface PendingImage {
  key: string;
  prepared: PreparedImage;
  previewUrl: string;
}

const OBSERVATION_FORM_ID = 'observation-form';

const Stars: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex items-center gap-0.5 text-[#C96442] dark:text-[#D97757]" role="img" aria-label={`Độ tin cậy ${value} trên 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? 'fill-current' : 'opacity-30'}`} />
    ))}
  </span>
);

const TextBlock: React.FC<{ label: string; value: string }> = ({ label, value }) =>
  value ? (
    <div className="rounded-2xl border border-[#E7E5E0] bg-[#FAF9F5] p-3.5 dark:border-[#32302B] dark:bg-[#181715]">
      <p className="text-[11px] font-bold text-[#55534D] dark:text-[#C2BFB6]">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
    </div>
  ) : null;

export const ResearchView: React.FC<ResearchViewProps> = ({
  observations,
  attachments,
  onAttachmentAdded,
  onAttachmentRemoved,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [search, setSearch] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('ALL');

  // Chế độ xem: danh sách (bảng) hoặc lịch
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const initialNow = new Date();
  const [calYear, setCalYear] = useState(initialNow.getFullYear());
  const [calMonth, setCalMonth] = useState(initialNow.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  const isMobile = useIsMobile();
  // Điện thoại: quan sát đang mở trong panel chi tiết, và bước xác nhận xóa
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [symbol, setSymbol] = useState('NAS100ft');
  const [observedDate, setObservedDate] = useState(() => todayIso());
  const [priceAction, setPriceAction] = useState('');
  const [candlePattern, setCandlePattern] = useState('');
  const [marketContext, setMarketContext] = useState('');
  const [confidence, setConfidence] = useState<number>(4);
  const [habitTag, setHabitTag] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');

  // Ảnh trong form: ảnh mới chọn (chưa lưu) và ảnh đã lưu bị đánh dấu xóa (xóa thật khi bấm "Lưu")
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const pendingRef = useRef<PendingImage[]>([]);
  pendingRef.current = pendingImages;
  // Giải phóng các URL xem trước khi rời màn hình
  useEffect(
    () => () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [],
  );

  const imagesByObservation = useMemo(() => {
    const map = new Map<string, ImageAttachmentRecord[]>();
    for (const a of attachments) {
      if (a.ownerType !== 'observation') continue;
      const list = map.get(a.ownerId) ?? [];
      list.push(a);
      map.set(a.ownerId, list);
    }
    return map;
  }, [attachments]);

  const thumbsFor = (id: string) =>
    (imagesByObservation.get(id) ?? []).map((a) => ({ key: a.id, url: attachmentUrl(a.id), name: a.fileName }));

  const symbols = useMemo(() => {
    const s = new Set(observations.map((o) => o.symbol));
    return ['ALL', ...Array.from(s)];
  }, [observations]);

  // Bộ lọc chung (mã / khung / phiên / từ khóa) — dùng cho cả bảng lẫn lịch
  const baseFiltered = useMemo(() => {
    return observations.filter((o) => {
      if (symbolFilter !== 'ALL' && o.symbol !== symbolFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${o.symbol} ${o.priceAction} ${o.candlePattern} ${o.marketContext} ${o.habitTag} ${o.outcomeNote}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [observations, symbolFilter, search]);

  // Bảng: thêm lọc theo ngày khi bấm từ lịch
  const filtered = useMemo(
    () => (dayFilter ? baseFiltered.filter((o) => o.observedDate === dayFilter) : baseFiltered),
    [baseFiltered, dayFilter],
  );

  const pagination = usePagination(filtered, PAGE_SIZE, `${symbolFilter}|${search}|${dayFilter ?? ''}`);

  // Lịch: gom quan sát theo ngày
  const byDay = useMemo(() => {
    const map = new Map<string, PriceObservation[]>();
    for (const o of baseFiltered) {
      const list = map.get(o.observedDate) ?? [];
      list.push(o);
      map.set(o.observedDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.observedTime.localeCompare(b.observedTime) || a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [baseFiltered]);

  const selectedDayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  const monthObservationCount = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-`;
    let count = 0;
    for (const [day, list] of byDay) {
      if (day.startsWith(prefix)) count += list.length;
    }
    return count;
  }, [byDay, calYear, calMonth]);

  // Pattern / Habit recognition summary from filtered observations
  const habitSummary = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; symbol: string; habit: string; count: number; totalConf: number }
    >();
    for (const o of filtered) {
      const label = o.habitTag.trim() || o.priceAction.trim();
      const k = `${o.symbol}::${label}`;
      const existing = groups.get(k) ?? {
        key: k,
        symbol: o.symbol,
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

  const resetImageState = () => {
    pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPendingImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setImageBusy(false);
  };

  const closeModal = () => {
    resetImageState();
    setModalOpen(false);
  };

  const openNewModal = (presetDate?: string) => {
    resetImageState();
    setEditingId(null);
    setSymbol('NAS100ft');
    setObservedDate(presetDate ?? todayIso());
    setPriceAction('');
    setCandlePattern('');
    setMarketContext('');
    setConfidence(4);
    setHabitTag('');
    setOutcomeNote('');
    setModalOpen(true);
  };

  const openEditModal = (obs: PriceObservation) => {
    resetImageState();
    setEditingId(obs.id);
    setSymbol(obs.symbol);
    setObservedDate(obs.observedDate);
    setPriceAction(obs.priceAction);
    setCandlePattern(obs.candlePattern);
    setMarketContext(obs.marketContext);
    setConfidence(obs.confidence);
    setHabitTag(obs.habitTag);
    setOutcomeNote(obs.outcomeNote);
    setModalOpen(true);
  };

  const savedImages = editingId
    ? (imagesByObservation.get(editingId) ?? []).filter((a) => !removedImageIds.includes(a.id))
    : [];
  const galleryItems: GalleryItem[] = [
    ...savedImages.map((a) => ({ key: a.id, url: attachmentUrl(a.id), name: a.fileName })),
    ...pendingImages.map((p) => ({ key: `pending:${p.key}`, url: p.previewUrl, name: p.prepared.fileName, pending: true })),
  ];

  const addFormImages = async (files: File[]) => {
    setImageError(null);
    setImageBusy(true);
    const problems: string[] = [];
    let count = galleryItems.length;
    for (const file of files) {
      if (count >= MAX_IMAGES_PER_OWNER) {
        problems.push(`Mỗi quan sát chỉ đính kèm tối đa ${MAX_IMAGES_PER_OWNER} ảnh, các ảnh còn lại đã bị bỏ qua.`);
        break;
      }
      try {
        const prepared = await prepareImageForUpload(file);
        const item: PendingImage = {
          key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          prepared,
          previewUrl: URL.createObjectURL(prepared.blob),
        };
        setPendingImages((prev) => [...prev, item]);
        count += 1;
      } catch (err) {
        problems.push(err instanceof ImageUploadError ? err.message : `Không đọc được "${file.name}".`);
      }
    }
    setImageBusy(false);
    if (problems.length > 0) setImageError(problems.join(' '));
  };

  const removeFormImage = (key: string) => {
    setImageError(null);
    if (key.startsWith('pending:')) {
      const pendingKey = key.slice('pending:'.length);
      setPendingImages((prev) => {
        const target = prev.find((p) => p.key === pendingKey);
        if (target) URL.revokeObjectURL(target.previewUrl);
        return prev.filter((p) => p.key !== pendingKey);
      });
    } else {
      setRemovedImageIds((prev) => [...prev, key]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Giữ nguyên giờ, khung thời gian và phiên đã lưu của bản ghi cũ khi sửa; bản ghi mới để trống.
    const original = editingId ? observations.find((o) => o.id === editingId) : undefined;
    const payload = {
      symbol: symbol.trim(),
      observedDate,
      observedTime: original?.observedTime ?? '',
      timeframe: original?.timeframe ?? ('' as const),
      session: original?.session ?? ('' as const),
      priceAction: priceAction.trim(),
      candlePattern: candlePattern.trim(),
      marketContext: marketContext.trim(),
      confidence,
      habitTag: habitTag.trim(),
      outcomeNote: outcomeNote.trim(),
    };
    try {
      let targetId = editingId;
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        const created = await onCreate(payload);
        if (!created) {
          setImageError('Không lưu được bản ghi quan sát. Vui lòng thử lại.');
          return;
        }
        targetId = created.id;
        // Nếu bước tải ảnh bên dưới lỗi, bấm "Lưu" lần nữa sẽ cập nhật bản ghi này thay vì tạo thêm bản ghi trùng.
        setEditingId(created.id);
      }

      const problems: string[] = [];
      for (const id of removedImageIds) {
        try {
          await deleteAttachment(id);
          onAttachmentRemoved(id);
          setRemovedImageIds((prev) => prev.filter((x) => x !== id));
        } catch (err) {
          problems.push(err instanceof ImageUploadError ? err.message : 'Không thể xóa một ảnh.');
        }
      }
      if (targetId) {
        for (const item of pendingImages) {
          try {
            const saved = await uploadAttachment('observation', targetId, item.prepared);
            onAttachmentAdded(saved);
            URL.revokeObjectURL(item.previewUrl);
            setPendingImages((prev) => prev.filter((p) => p.key !== item.key));
          } catch (err) {
            problems.push(err instanceof ImageUploadError ? err.message : `Không thể tải "${item.prepared.fileName}" lên.`);
          }
        }
      }
      if (problems.length > 0) {
        setImageError(`Đã lưu quan sát nhưng chưa xử lý xong ảnh. ${problems.join(' ')} Bấm "Lưu" để thử lại.`);
        return;
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Form thêm / sửa quan sát: panel trượt từ đáy (điện thoại) hoặc hộp thoại (máy tính)
  // ---------------------------------------------------------------------------------------------
  const labelClass = 'block text-xs font-semibold mb-1.5';
  const formSheet = (
    <BottomSheet
      open={modalOpen}
      onClose={closeModal}
      wide
      title={editingId ? 'Cập nhật quan sát hành động giá' : 'Ghi nhận quan sát hành động giá'}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={closeModal} className={`${BTN_SECONDARY} flex-1`}>
            Hủy
          </button>
          <button type="submit" form={OBSERVATION_FORM_ID} disabled={saving} className={`${BTN_PRIMARY} flex-[2]`}>
            {saving ? 'Đang lưu...' : editingId ? 'Lưu cập nhật' : 'Lưu quan sát'}
          </button>
        </div>
      }
    >
      <form
        id={OBSERVATION_FORM_ID}
        onSubmit={handleSubmit}
        onPaste={(e) => handleImagePaste(e, (files) => void addFormImages(files))}
        className="space-y-4 pt-1"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Mã quan sát *</label>
            <input type="text" required value={symbol} onChange={(e) => setSymbol(e.target.value)} className={FIELD_BASE} />
          </div>
          <div>
            <label className={labelClass}>Ngày *</label>
            <input
              type="date"
              required
              value={observedDate}
              onChange={(e) => setObservedDate(e.target.value)}
              className={`${FIELD_BASE} font-mono-num`}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Độ tin cậy quan sát (1–5)</label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setConfidence(n)}
                aria-pressed={confidence === n}
                className={`press min-h-[44px] flex-1 rounded-xl border text-sm font-mono-num font-bold transition-colors ${
                  confidence >= n
                    ? 'bg-[#C96442] border-[#C96442] text-white'
                    : 'border-[#E7E5E0] dark:border-[#32302B] text-[#55534D] dark:text-[#C2BFB6]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Hành động giá quan sát được *</label>
          <input type="text" required value={priceAction} onChange={(e) => setPriceAction(e.target.value)} className={FIELD_BASE} />
        </div>

        <div>
          <label className={labelClass}>Đặc điểm cây nến *</label>
          <input type="text" required value={candlePattern} onChange={(e) => setCandlePattern(e.target.value)} className={FIELD_BASE} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Bối cảnh thị trường & Tin tức</label>
            <input type="text" value={marketContext} onChange={(e) => setMarketContext(e.target.value)} className={FIELD_BASE} />
          </div>
          <div>
            <label className={labelClass}>Nhãn thói quen giá (để gom nhóm)</label>
            <input type="text" value={habitTag} onChange={(e) => setHabitTag(e.target.value)} className={FIELD_BASE} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Diễn biến sau đó / Kết luận rút ra</label>
          <textarea
            rows={3}
            value={outcomeNote}
            onChange={(e) => setOutcomeNote(e.target.value)}
            className={`${FIELD_BASE} py-3 leading-relaxed`}
          />
        </div>

        <div>
          <label className={labelClass}>Hình ảnh</label>
          <ImageGallery
            items={galleryItems}
            onAddFiles={(files) => void addFormImages(files)}
            onRemove={removeFormImage}
            busy={imageBusy}
            error={imageError}
            disabled={saving}
          />
        </div>
      </form>
    </BottomSheet>
  );

  // ---------------------------------------------------------------------------------------------
  // Điện thoại
  // ---------------------------------------------------------------------------------------------
  const closeDetail = () => {
    setDetailId(null);
    setConfirmDelete(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await onDelete(id);
      closeDetail();
    } finally {
      setDeleting(false);
    }
  };

  const openFromDay = (iso: string) => {
    setSelectedDay(iso);
  };

  const renderObservationCard = (o: PriceObservation) => {
    const imageCount = imagesByObservation.get(o.id)?.length ?? 0;
    return (
      <button
        key={o.id}
        type="button"
        onClick={() => setDetailId(o.id)}
        aria-haspopup="dialog"
        className={`${CARD} press block w-full p-4 text-left active:bg-[#F3F1EC] dark:active:bg-[#2A2925]`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-bold">{o.symbol}</span>
            <span className="shrink-0 font-mono-num text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
              {formatIsoDisplay(o.observedDate)}
            </span>
          </span>
          <Stars value={o.confidence} />
        </span>

        <span className="mt-2 line-clamp-2 block text-sm font-semibold leading-snug">{o.priceAction}</span>
        {o.candlePattern && (
          <span className="mt-1 line-clamp-1 block text-xs text-[#55534D] dark:text-[#C2BFB6]">{o.candlePattern}</span>
        )}

        {(o.habitTag || imageCount > 0) && (
          <span className="mt-2.5 flex items-center gap-2">
            {o.habitTag && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[#C96442]/10 px-2.5 py-1 text-[11px] font-bold text-[#B55535] dark:bg-[#D97757]/15 dark:text-[#E8987D]">
                <Tag className="h-3 w-3 shrink-0" />
                <span className="truncate">{o.habitTag}</span>
              </span>
            )}
            {imageCount > 0 && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono-num text-[11px] font-semibold text-[#55534D] dark:text-[#C2BFB6]">
                <ImageIcon className="h-3.5 w-3.5" />
                {imageCount}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  const detailObs = detailId ? (observations.find((o) => o.id === detailId) ?? null) : null;
  const detailSheet = detailObs && (
    <BottomSheet
      open
      onClose={closeDetail}
      ariaLabel={`Chi tiết quan sát ${detailObs.symbol}`}
      title={detailObs.symbol}
      subtitle={formatIsoDisplay(detailObs.observedDate)}
      footer={
        confirmDelete ? (
          <div>
            <p className="mb-2.5 text-center text-sm font-semibold">Xóa quan sát này? Ảnh đính kèm cũng sẽ bị xóa.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(false)} className={`${BTN_SECONDARY} flex-1`}>
                Giữ lại
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete(detailObs.id)}
                className={`${BTN_DANGER} flex-1 !bg-[color:var(--pnl-loss-soft)]`}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirmDelete(true)} className={BTN_DANGER} aria-label="Xóa quan sát">
              <Trash2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => openEditModal(detailObs)} className={`${BTN_PRIMARY} flex-1`}>
              <Edit3 className="h-4 w-4" />
              Chỉnh sửa
            </button>
          </div>
        )
      }
    >
      <div className="space-y-3 pt-1">
        <StatGrid
          items={[
            { label: 'Độ tin cậy', value: <Stars value={detailObs.confidence} /> },
            { label: 'Nhãn thói quen', value: detailObs.habitTag || '—' },
          ]}
        />
        <TextBlock label="Hành động giá" value={detailObs.priceAction} />
        <TextBlock label="Đặc điểm nến" value={detailObs.candlePattern} />
        <TextBlock label="Bối cảnh & Tin tức" value={detailObs.marketContext} />
        <TextBlock label="Diễn biến sau đó / Kết luận" value={detailObs.outcomeNote} />
        {(imagesByObservation.get(detailObs.id)?.length ?? 0) > 0 && (
          <div>
            <h3 className="mb-0.5 mt-4 text-xs font-bold text-[#55534D] dark:text-[#C2BFB6]">Hình ảnh</h3>
            <ThumbStrip items={thumbsFor(detailObs.id)} maxVisible={8} />
          </div>
        )}
      </div>
    </BottomSheet>
  );

  // Lịch: chạm vào một ngày -> panel liệt kê các quan sát của ngày đó
  const daySheet = isMobile && viewMode === 'calendar' && selectedDay && (
    <BottomSheet
      open
      onClose={() => setSelectedDay(null)}
      ariaLabel={`Quan sát ngày ${formatIsoDisplay(selectedDay)}`}
      title={`Ngày ${formatIsoDisplay(selectedDay)}`}
      subtitle={`${selectedDayItems.length} quan sát`}
      footer={
        <div className="flex gap-3">
          {selectedDayItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDayFilter(selectedDay);
                setSelectedDay(null);
                setViewMode('list');
              }}
              className={`${BTN_SECONDARY} flex-1`}
            >
              <List className="h-4 w-4" />
              Xem danh sách
            </button>
          )}
          <button type="button" onClick={() => openNewModal(selectedDay)} className={`${BTN_PRIMARY} flex-1`}>
            <Plus className="h-4 w-4" />
            Ghi nhận
          </button>
        </div>
      }
    >
      {selectedDayItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#55534D] dark:text-[#C2BFB6]">
          Chưa có quan sát nào trong ngày này.
        </p>
      ) : (
        <div className="space-y-3 pt-1">{selectedDayItems.map(renderObservationCard)}</div>
      )}
    </BottomSheet>
  );

  const addButtonTarget = viewMode === 'calendar' && selectedDay ? selectedDay : undefined;

  const mobileView = (
    <div className="space-y-3.5 pb-20">
      <SegmentedControl
        ariaLabel="Chế độ xem"
        value={viewMode}
        onChange={setViewMode}
        options={[
          { id: 'list', label: 'Danh sách', icon: <List className="h-3.5 w-3.5" /> },
          { id: 'calendar', label: 'Lịch', icon: <CalendarDays className="h-3.5 w-3.5" /> },
        ]}
      />

      <div data-no-swipe className="space-y-2.5">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Tìm hành động giá, nến, thói quen"
          ariaLabel="Tìm trong sổ nghiên cứu"
        />
        <ChipScroller>
          {viewMode === 'list' && dayFilter && (
            <Chip active onClick={() => setDayFilter(null)} icon={<CalendarDays className="h-3.5 w-3.5" />} className="font-mono-num">
              {formatIsoDisplay(dayFilter)}
              <X className="h-3.5 w-3.5" aria-label="Bỏ lọc theo ngày" />
            </Chip>
          )}
          {symbols.map((sym) => (
            <Chip key={sym} active={symbolFilter === sym} onClick={() => setSymbolFilter(sym)}>
              {sym === 'ALL' ? 'Tất cả mã' : sym}
            </Chip>
          ))}
        </ChipScroller>
      </div>

      {viewMode === 'list' ? (
        <>
          {habitSummary.length > 0 && (
            <section aria-label="Thói quen giá nổi bật">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-bold">Thói quen nổi bật</h3>
                <span className="font-mono-num text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
                  từ {filtered.length} quan sát
                </span>
              </div>
              <div
                data-no-swipe
                className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6"
              >
                {habitSummary.map((h) => (
                  <div key={h.key} className={`${CARD} w-[210px] shrink-0 snap-start p-3.5`}>
                    <div className="flex items-center justify-between text-xs">
                      <strong>{h.symbol}</strong>
                      <span className="font-mono-num font-bold text-[#C96442] dark:text-[#D97757]">{h.count} lần</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug">{h.habit}</p>
                    <p className="mt-1 font-mono-num text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
                      Tin cậy TB {(h.totalConf / h.count).toFixed(1)}/5
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="px-1 text-xs font-semibold text-[#55534D] dark:text-[#C2BFB6]">
            <span className="font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]">{filtered.length}</span> quan sát
          </p>

          {filtered.length === 0 ? (
            <div className={`${CARD} flex flex-col items-center px-6 py-12 text-center`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F1EC] text-[#55534D] dark:bg-[#181715] dark:text-[#C2BFB6]">
                <SearchX className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-bold">Chưa có quan sát nào</p>
              <p className="mt-1 text-xs text-[#55534D] dark:text-[#C2BFB6]">Bấm nút + để ghi nhận quan sát đầu tiên.</p>
            </div>
          ) : (
            <div className="space-y-3">{pagination.pageItems.map(renderObservationCard)}</div>
          )}

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            unit="quan sát"
          />
        </>
      ) : (
        <div className={`${CARD} p-3.5`}>
          <MonthCalendar
            year={calYear}
            month={calMonth}
            onMonthChange={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
            }}
            summary={
              <span className="text-[#55534D] dark:text-[#C2BFB6]">{monthObservationCount} quan sát</span>
            }
            selectedIso={selectedDay}
            onDayClick={openFromDay}
            getTone={(iso) => (byDay.has(iso) ? 'accent' : null)}
            renderDay={(iso) => {
              const items = byDay.get(iso);
              if (!items || items.length === 0) return null;
              return (
                <span className="mt-auto font-mono-num text-xs font-bold text-[#C96442] dark:text-[#D97757]">
                  {items.length}
                </span>
              );
            }}
          />
          <p className="mt-3 text-center text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
            Chạm vào một ngày để xem hoặc ghi nhận quan sát
          </p>
        </div>
      )}

      {/* Nút nổi "Ghi nhận" (đưa ra <body> để luôn cố định theo màn hình) */}
      {createPortal(
        <button
          type="button"
          onClick={() => openNewModal(addButtonTarget)}
          aria-label="Ghi nhận quan sát mới"
          className="press fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#C96442] text-white shadow-lg shadow-black/25 active:bg-[#A24D2F] bottom-[calc(5rem+env(safe-area-inset-bottom))]"
        >
          <Plus className="h-6 w-6" />
        </button>,
        document.body,
      )}

      {detailSheet}
      {daySheet}
      {formSheet}
    </div>
  );

  const desktopView = (
    <div className="space-y-5">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <h2 className="text-base font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
          Sổ ghi nhận nghiên cứu & Thói quen hành động giá
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Chế độ xem"
            data-no-swipe
            className="inline-flex rounded-lg bg-[#F3F1EC] dark:bg-[#181715] p-1"
          >
            {(
              [
                { id: 'list', label: 'Danh sách', icon: List },
                { id: 'calendar', label: 'Lịch', icon: CalendarDays },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === t.id}
                  onClick={() => setViewMode(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    viewMode === t.id
                      ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                      : 'text-[#55534D] dark:text-[#C2BFB6]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => openNewModal(viewMode === 'calendar' && selectedDay ? selectedDay : undefined)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#C96442] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B55535] transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Ghi nhận quan sát mới</span>
          </button>
        </div>
      </div>

      {/* Habit Recognition Summary */}
      {viewMode === 'list' && habitSummary.length > 0 && (
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Tổng hợp thói quen giá nổi bật</h3>
            <span className="text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
              Từ {filtered.length} quan sát đang lọc
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {habitSummary.map((h) => (
              <div
                key={h.key}
                className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] p-3.5"
              >
                <div className="flex items-center justify-between text-xs text-[#55534D] dark:text-[#C2BFB6]">
                  <span>
                    <strong className="text-[#1C1B18] dark:text-[#F2EFE9]">{h.symbol}</strong>
                  </span>
                  <span className="font-mono-num font-semibold text-[#C96442]">
                    {h.count} lần
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
                  {h.habit}
                </p>
                <p className="mt-1 text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
                  Độ tin cậy TB: {(h.totalConf / h.count).toFixed(1)}/5
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div
        data-no-swipe
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-3"
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Lọc theo hành động giá, nến, tin tức, thẻ thói quen"
          className="flex-1 max-w-md"
        />

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'list' && dayFilter && (
            <Chip active onClick={() => setDayFilter(null)} icon={<CalendarDays className="h-3.5 w-3.5" />} className="font-mono-num">
              {formatIsoDisplay(dayFilter)}
              <X className="h-3.5 w-3.5" aria-label="Bỏ lọc theo ngày" />
            </Chip>
          )}
          <SelectField
            compact
            wrapperClassName="w-[170px]"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            aria-label="Mã"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'Tất cả mã' : s}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {viewMode === 'list' && (
      <>
      {/* Desktop Table */}
      <div className="hidden lg:block rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] overflow-hidden">
        <div className="overflow-x-auto">
          {/* Cột chữ căn trái, cột số (Tin cậy) và Thao tác căn phải; tiêu đề cùng hướng với ô */}
          <table className="w-full min-w-[900px] table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[116px]" />
              <col />
              <col className="w-[190px]" />
              <col className="w-[230px]" />
              <col className="w-[80px]" />
              <col className="w-[96px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] text-[#55534D] dark:text-[#C2BFB6]">
                <th className="py-3 px-4 font-semibold text-left">Mã</th>
                <th className="py-3 px-3 font-semibold text-left">Ngày</th>
                <th className="py-3 px-3 font-semibold text-left">Hành động giá</th>
                <th className="py-3 px-3 font-semibold text-left">Đặc điểm nến</th>
                <th className="py-3 px-3 font-semibold text-left">Bối cảnh & Tin tức</th>
                <th className="py-3 px-3 font-semibold text-right">Tin cậy</th>
                <th className="py-3 px-4 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70">
              {pagination.pageItems.map((o) => (
                <tr key={o.id} className="align-top hover:bg-[#FAF9F5] dark:hover:bg-[#2A2925]/50">
                  <td className="py-3 px-4 text-left font-semibold">{o.symbol}</td>
                  <td className="py-3 px-3 text-left font-mono-num whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        const [y, m] = o.observedDate.split('-').map(Number);
                        setCalYear(y);
                        setCalMonth(m - 1);
                        setSelectedDay(o.observedDate);
                        setViewMode('calendar');
                      }}
                      className="hover:text-[#C96442] hover:underline underline-offset-4"
                    >
                      {o.observedDate}
                    </button>
                  </td>
                  <td className="py-3 px-3 text-left break-words">
                    <div className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">{o.priceAction}</div>
                    <ThumbStrip items={thumbsFor(o.id)} />
                    {o.habitTag && (
                      <div className="mt-0.5 text-[11px] text-[#C96442]">Thói quen: {o.habitTag}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-left break-words">{o.candlePattern}</td>
                  <td className="py-3 px-3 text-left break-words text-[#55534D] dark:text-[#C2BFB6]">
                    <div>{o.marketContext || '—'}</div>
                    {o.outcomeNote && (
                      <div className="mt-0.5 text-[11px] text-[#1C1B18] dark:text-[#F2EFE9]">
                        Kết quả: {o.outcomeNote}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-num font-semibold whitespace-nowrap">
                    {o.confidence}/5
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(o)}
                        className="p-2 rounded-lg text-[#55534D] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
                        aria-label="Sửa quan sát"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(o.id)}
                        className="p-2 rounded-lg text-[#55534D] hover:text-loss hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
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
                  <td colSpan={7} className="py-10 text-center text-sm text-[#55534D] dark:text-[#C2BFB6]">
                    Chưa có quan sát hành động giá nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={pagination.pageSize}
        onPageChange={pagination.setPage}
        unit="quan sát"
      />
      </>
      )}

      {viewMode === 'calendar' && (
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 space-y-5">
          <MonthCalendar
            year={calYear}
            month={calMonth}
            onMonthChange={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
            }}
            summary={
              <span className="text-[#55534D] dark:text-[#C2BFB6]">
                {monthObservationCount} quan sát trong tháng
              </span>
            }
            selectedIso={selectedDay}
            onDayClick={(iso) => setSelectedDay((prev) => (prev === iso ? null : iso))}
            getTone={(iso) => (byDay.has(iso) ? 'accent' : null)}
            renderDay={(iso) => {
              const items = byDay.get(iso);
              if (!items || items.length === 0) return null;
              const first = items[0];
              const label = first.habitTag.trim() || first.priceAction.trim();
              return (
                <>
                  <span className="hidden sm:block mt-0.5 text-[11px] leading-snug font-medium text-[#1C1B18] dark:text-[#F2EFE9] line-clamp-2 break-words">
                    {label}
                  </span>
                  <span className="mt-auto text-[10px] sm:text-[11px] font-mono-num font-semibold text-[#C96442] dark:text-[#D97757]">
                    {items.length} quan sát
                  </span>
                </>
              );
            }}
          />

          {selectedDay && (
            <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715]/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold font-mono-num">
                  Ngày {formatIsoDisplay(selectedDay)}
                  <span className="ml-2 font-normal text-xs text-[#55534D] dark:text-[#C2BFB6]">
                    {selectedDayItems.length} quan sát
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDayItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDayFilter(selectedDay);
                        setViewMode('list');
                      }}
                      className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-1.5 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[36px] whitespace-nowrap"
                    >
                      Xem trong bảng
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openNewModal(selectedDay)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#C96442] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#B55535] min-h-[36px] whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ghi nhận cho ngày này</span>
                  </button>
                </div>
              </div>

              {selectedDayItems.length === 0 ? (
                <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">
                  Chưa có quan sát nào trong ngày này.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {selectedDayItems.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-3.5 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs">
                          <strong className="text-sm">{o.symbol}</strong>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 text-xs font-mono-num text-[#C96442] dark:text-[#D97757] mr-1">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            {o.confidence}/5
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditModal(o)}
                            className="p-2 rounded-lg text-[#55534D] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
                            aria-label="Sửa quan sát"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(o.id)}
                            className="p-2 rounded-lg text-[#55534D] hover:text-loss hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
                            aria-label="Xóa quan sát"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-medium">{o.priceAction}</p>
                      <ThumbStrip items={thumbsFor(o.id)} />
                      <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">
                        <strong>Nến:</strong> {o.candlePattern}
                      </p>
                      {o.habitTag && (
                        <p className="text-xs text-[#C96442] dark:text-[#D97757]">Thói quen: {o.habitTag}</p>
                      )}
                      {o.marketContext && (
                        <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">
                          <strong>Bối cảnh:</strong> {o.marketContext}
                        </p>
                      )}
                      {o.outcomeNote && (
                        <p className="text-xs">
                          <strong>Kết quả:</strong> {o.outcomeNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {formSheet}
    </div>
  );

  return isMobile ? mobileView : desktopView;
};
