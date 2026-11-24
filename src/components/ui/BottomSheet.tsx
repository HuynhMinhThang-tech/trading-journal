import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Biểu tượng / avatar đặt bên trái tiêu đề. */
  leading?: React.ReactNode;
  children: React.ReactNode;
  /** Thanh nút cố định ở đáy panel (luôn nhìn thấy khi nội dung cuộn). */
  footer?: React.ReactNode;
  /** Nhãn đọc cho trình đọc màn hình; mặc định dùng `title` nếu là chuỗi. */
  ariaLabel?: string;
  /** Rộng hơn trên máy tính (dành cho form nhiều trường). */
  wide?: boolean;
}

const CLOSE_ANIMATION_MS = 190;
const DRAG_CLOSE_DISTANCE = 110;

/**
 * Panel trượt từ đáy lên (điện thoại) / hộp thoại giữa màn hình (máy tính).
 * - Đóng bằng: nút X, chạm nền mờ, phím Esc hoặc vuốt xuống ở thanh tiêu đề.
 * - Đưa ra <body> bằng portal để `position: fixed` luôn phủ toàn màn hình.
 * - `data-no-swipe` để thao tác vuốt trong panel không bị hiểu nhầm là vuốt đổi tab.
 * - Màu chữ đặt rõ ngay trên panel: nằm ngoài <App> nên không thừa hưởng màu chữ sáng của giao diện tối.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  leading,
  children,
  footer,
  ariaLabel,
  wide = false,
}) => {
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (timer.current !== null) return;
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onCloseRef.current();
    }, CLOSE_ANIMATION_MS);
  }, []);

  // Mỗi lần mở lại: bỏ trạng thái đang đóng / đang kéo của lần trước
  useEffect(() => {
    if (open) {
      setClosing(false);
      setDragY(0);
      setDragging(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // Esc để đóng + đưa focus vào panel (và trả lại chỗ cũ khi đóng)
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, requestClose]);

  if (!open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - dragStartY.current));
  };
  const onTouchEnd = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    setDragging(false);
    if (dragY > DRAG_CLOSE_DISTANCE) requestClose();
    else setDragY(0);
  };

  const label = ariaLabel ?? (typeof title === 'string' ? title : 'Chi tiết');

  return createPortal(
    <div
      data-no-swipe
      className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        aria-hidden="true"
        onClick={requestClose}
        className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-backdrop-in ${
          closing ? 'opacity-0 transition-opacity duration-200' : ''
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : dragY === 0 ? 'transform 200ms ease-out' : undefined,
        }}
        className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-[#E7E5E0] bg-white text-[#1C1B18] shadow-2xl outline-none dark:border-[#32302B] dark:bg-[#22211E] dark:text-[#F2EFE9] ${wide ? 'lg:max-w-2xl' : 'lg:max-w-xl'} lg:rounded-2xl lg:border-b ${
          closing ? 'animate-sheet-down' : 'animate-sheet-up'
        }`}
      >
        {/* Thanh tiêu đề (vuốt xuống để đóng) */}
        <div
          className="shrink-0 touch-none lg:touch-auto"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[#D9D6CF] dark:bg-[#4A4740] lg:hidden" />
          <div className="flex items-center gap-3 px-5 pb-3 pt-3.5">
            {leading}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-bold text-[#1C1B18] dark:text-[#F2EFE9]">{title}</h2>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-[#55534D] dark:text-[#C2BFB6]">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Đóng"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F1EC] text-[#55534D] hover:bg-[#E7E5E0] dark:bg-[#2A2925] dark:text-[#C2BFB6] dark:hover:bg-[#32302B]"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${
            footer ? 'pb-5' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[#E7E5E0] bg-white px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-[#32302B] dark:bg-[#22211E]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
