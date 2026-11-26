import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { BTN_SECONDARY } from './controls.tsx';

/**
 * Hộp xác nhận dạng panel, thay cho `window.confirm` mặc định của trình duyệt.
 * - Điện thoại: trượt từ đáy lên. Máy tính: hộp thoại giữa màn hình (cùng kiểu với BottomSheet).
 * - Cách dùng:   const confirm = useConfirm();
 *                if (!(await confirm({ title: 'Xóa ảnh này?', message: '...', confirmLabel: 'Xóa ảnh' }))) return;
 * - Nút "Hủy" được focus sẵn nên bấm Enter nhầm sẽ không xóa. Esc / chạm nền mờ = Hủy.
 * - Đặt <ConfirmProvider> một lần ở gốc app (src/main.tsx).
 */

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  /** Mặc định: 'Xóa'. */
  confirmLabel?: string;
  /** Mặc định: 'Hủy'. */
  cancelLabel?: string;
  /** 'danger' (mặc định): nút xác nhận màu đỏ cho thao tác xóa. 'default': dùng cho xác nhận thông thường. */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm phải được dùng bên trong <ConfirmProvider>.');
  return fn;
}

const CLOSE_ANIMATION_MS = 190;

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [closing, setClosing] = useState(false);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);
  const closeTimer = useRef<number | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // Nếu đang có hộp xác nhận khác thì coi như đã Hủy.
    resolverRef.current?.(false);
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setClosing(false);
      setOptions(next);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    if (!resolve) return;
    resolverRef.current = null;
    resolve(result); // thao tác tiếp theo chạy ngay, panel trượt xuống song song
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOptions(null);
      setClosing(false);
    }, CLOSE_ANIMATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmPanel options={options} closing={closing} onResult={settle} />}
    </ConfirmContext.Provider>
  );
};

interface ConfirmPanelProps {
  options: ConfirmOptions;
  closing: boolean;
  onResult: (result: boolean) => void;
}

const ConfirmPanel: React.FC<ConfirmPanelProps> = ({ options, closing, onResult }) => {
  const { title, message, confirmLabel = 'Xóa', cancelLabel = 'Hủy', tone = 'danger' } = options;
  const danger = tone === 'danger';
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const closingRef = useRef(closing);
  closingRef.current = closing;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus({ preventScroll: true });

    // Bắt phím ở giai đoạn capture để Esc chỉ đóng hộp xác nhận, không đóng luôn panel đang mở phía dưới.
    const onKey = (e: KeyboardEvent) => {
      if (closingRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onResultRef.current(false);
        return;
      }
      if (e.key === 'Tab') {
        // Giữ focus trong hai nút của hộp xác nhận.
        const first = cancelRef.current;
        const last = confirmRef.current;
        if (!first || !last) return;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (active !== first && active !== last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  const Icon = danger ? Trash2 : AlertTriangle;

  return createPortal(
    <div
      data-no-swipe
      className="fixed inset-0 z-[80] flex items-end justify-center lg:items-center lg:p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        aria-hidden="true"
        onClick={() => !closing && onResult(false)}
        className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-backdrop-in ${
          closing ? 'opacity-0 transition-opacity duration-200' : ''
        }`}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className={`relative flex w-full flex-col rounded-t-3xl border border-b-0 border-[#E7E5E0] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 text-[#1C1B18] shadow-2xl dark:border-[#32302B] dark:bg-[#22211E] dark:text-[#F2EFE9] lg:max-w-sm lg:rounded-2xl lg:border-b lg:pb-5 lg:pt-5 ${
          closing ? 'animate-sheet-down' : 'animate-sheet-up'
        }`}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#D9D6CF] dark:bg-[#4A4740] lg:hidden" />

        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger
                ? 'bg-[color:var(--pnl-loss-soft)] text-loss'
                : 'bg-[#F3F1EC] text-[#C96442] dark:bg-[#2A2925]'
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="text-base font-bold">
              {title}
            </h2>
            {message && (
              <p id={messageId} className="mt-1 text-sm leading-relaxed text-[#55534D] dark:text-[#C2BFB6]">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button ref={cancelRef} type="button" onClick={() => onResult(false)} className={BTN_SECONDARY}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResult(true)}
            className={`press inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[filter] hover:brightness-95 active:brightness-90 ${
              danger
                ? 'bg-[color:var(--pnl-loss-fill)] text-white dark:text-[#1C1B18]'
                : 'bg-[#C96442] text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
