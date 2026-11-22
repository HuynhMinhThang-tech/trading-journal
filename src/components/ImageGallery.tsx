import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from 'lucide-react';
import { MAX_IMAGES_PER_OWNER } from '../shared/attachments.ts';
import { IMAGE_ACCEPT, imageFilesFromClipboard, imageFilesFromList } from '../lib/attachments.ts';

export interface GalleryItem {
  key: string;
  url: string;
  name: string;
  /** Ảnh vừa chọn, chưa lưu lên máy chủ. */
  pending?: boolean;
}

/** Dán ảnh (Ctrl+V) vào vùng chứa: chỉ xử lý khi clipboard có ảnh, văn bản dán bình thường không bị ảnh hưởng. */
export function handleImagePaste(e: React.ClipboardEvent, onFiles: (files: File[]) => void): void {
  const files = imageFilesFromClipboard(e.clipboardData);
  if (files.length === 0) return;
  e.preventDefault();
  onFiles(files);
}

// ---------------------------------------------------------------------------------------------
// Khung xem ảnh phóng to
// ---------------------------------------------------------------------------------------------

interface LightboxProps {
  items: Array<Pick<GalleryItem, 'key' | 'url' | 'name'>>;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export const ImageLightbox: React.FC<LightboxProps> = ({ items, index, onIndexChange, onClose }) => {
  const total = items.length;
  const current = items[index];

  const go = useCallback(
    (delta: number) => onIndexChange((index + delta + total) % total),
    [index, total, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && total > 1) go(-1);
      else if (e.key === 'ArrowRight' && total > 1) go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose, total]);

  if (!current) return null;

  // Đưa ra <body> để position: fixed luôn phủ toàn màn hình, không bị thẻ cha có transform/overflow làm lệch.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      data-no-swipe
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="absolute right-4 top-4 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X className="w-5 h-5" />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Ảnh trước"
            className="absolute left-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Ảnh sau"
            className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <figure className="flex max-h-full max-w-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.name}
          className="max-h-[85vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
        />
        <figcaption className="text-xs font-semibold text-white/90 font-mono-num">
          {current.name} {total > 1 && `· ${index + 1}/${total}`}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
};

// ---------------------------------------------------------------------------------------------
// Dải ảnh nhỏ (dùng trong danh sách): bấm để xem phóng to
// ---------------------------------------------------------------------------------------------

export const ThumbStrip: React.FC<{
  items: Array<Pick<GalleryItem, 'key' | 'url' | 'name'>>;
  maxVisible?: number;
}> = ({ items, maxVisible = 4 }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (items.length === 0) return null;
  const visible = items.slice(0, maxVisible);
  const hidden = items.length - visible.length;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" data-no-swipe>
        {visible.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setOpenIndex(i)}
            aria-label={`Xem ảnh ${item.name}`}
            className="h-11 w-11 overflow-hidden rounded-md border border-[#E7E5E0] dark:border-[#32302B] bg-[#F3F1EC] dark:bg-[#181715] hover:border-[#C96442]"
          >
            <img src={item.url} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </button>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setOpenIndex(maxVisible)}
            className="h-11 min-w-[44px] rounded-md border border-[#E7E5E0] dark:border-[#32302B] px-2 text-xs font-semibold font-mono-num text-[#55534D] dark:text-[#C2BFB6] hover:border-[#C96442]"
          >
            +{hidden}
          </button>
        )}
      </div>
      {openIndex !== null && (
        <ImageLightbox items={items} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------------------------
// Lưới ảnh có thêm / xóa
// ---------------------------------------------------------------------------------------------

interface ImageGalleryProps {
  items: GalleryItem[];
  onAddFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ items, onAddFiles, onRemove, busy = false, error, disabled = false }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const full = items.length >= MAX_IMAGES_PER_OWNER;

  const addFiles = (files: File[]) => {
    if (disabled || files.length === 0) return;
    onAddFiles(files);
  };

  return (
    <div
      data-no-swipe
      onDragOver={(e) => {
        if (disabled) return;
        if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        if (disabled) return;
        e.preventDefault();
        addFiles(imageFilesFromList(e.dataTransfer?.files));
      }}
      className={`rounded-lg border border-dashed p-3 transition-colors ${
        dragging
          ? 'border-[#C96442] bg-[#C96442]/10'
          : 'border-[#D9D6CF] dark:border-[#3D3B35] bg-white/60 dark:bg-[#22211E]/60'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <div
            key={item.key}
            className="group relative h-24 w-24 overflow-hidden rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#F3F1EC] dark:bg-[#181715]"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Xem ảnh ${item.name}`}
              className="h-full w-full"
            >
              <img src={item.url} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
            {item.pending && (
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                Chưa lưu
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              disabled={disabled}
              aria-label={`Xóa ảnh ${item.name}`}
              className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white hover:bg-[#D92D20] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy || full}
          aria-label="Thêm ảnh"
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] text-xs font-semibold text-[#55534D] dark:text-[#C2BFB6] hover:border-[#C96442] hover:text-[#C96442] disabled:opacity-50 disabled:hover:border-[#E7E5E0] disabled:hover:text-[#55534D]"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span>{busy ? 'Đang tải...' : 'Thêm ảnh'}</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(imageFilesFromList(e.target.files));
            e.target.value = ''; // cho phép chọn lại cùng một file
          }}
        />
      </div>

      <p className="mt-2 text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
        Ảnh JPEG, PNG, WebP, GIF · tối đa {MAX_IMAGES_PER_OWNER} ảnh · kéo thả hoặc dán ảnh (Ctrl+V) đều được
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-loss">
          {error}
        </p>
      )}

      {openIndex !== null && (
        <ImageLightbox items={items} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
};
