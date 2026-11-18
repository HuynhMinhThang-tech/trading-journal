import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  compact?: boolean;
  iconOnly?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  iconOnly = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="Cài đặt ứng dụng (PWA)"
        aria-label="Cài đặt ứng dụng (PWA)"
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#C96442] text-xs font-medium text-white hover:bg-[#B55535] transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
          iconOnly ? 'w-10 px-0' : 'px-3.5 py-2'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        {!iconOnly && <span>{compact ? 'Cài App' : 'Cài đặt ứng dụng (PWA)'}</span>}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        title={isIOS ? 'Cài lên iPhone' : 'Hướng dẫn cài iPhone PWA'}
        aria-label="Hướng dẫn cài iPhone PWA"
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] text-xs font-medium text-[#1C1B18] dark:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
          iconOnly ? 'w-10 px-0' : 'px-3.5 py-2'
        }`}
      >
        <Smartphone className="w-4 h-4 text-[#C96442] shrink-0" />
        {!iconOnly && (
          <span>{compact ? 'iPhone PWA' : isIOS ? 'Cài lên iPhone' : 'Hướng dẫn cài iPhone PWA'}</span>
        )}
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                  Cài đặt lên Màn hình chính iPhone
                </h3>
                <p className="mt-1 text-xs text-[#6B6963] dark:text-[#A6A39B]">
                  Mở nhanh mọi lúc như ứng dụng gốc trên iOS Safari.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#6B6963] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]"
                aria-label="Đóng hướng dẫn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="mt-4 space-y-3 text-sm text-[#1C1B18] dark:text-[#F2EFE9]">
              <li className="flex items-start gap-3">
                <span className="font-mono-num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F3F1EC] dark:bg-[#2A2925] text-xs font-semibold">
                  1
                </span>
                <span>
                  Mở liên kết ứng dụng này bằng trình duyệt <strong>Safari</strong> trên iPhone.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono-num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F3F1EC] dark:bg-[#2A2925] text-xs font-semibold">
                  2
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  Nhấn vào biểu tượng <Share className="inline w-4 h-4 text-[#C96442]" />{' '}
                  <strong>Chia sẻ (Share)</strong> ở thanh dưới cùng Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono-num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F3F1EC] dark:bg-[#2A2925] text-xs font-semibold">
                  3
                </span>
                <span>
                  Cuộn xuống và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>, sau đó nhấn{' '}
                  <strong>Thêm</strong>.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-[#1C1B18] dark:bg-[#F2EFE9] text-sm font-medium text-white dark:text-[#1C1B18] hover:opacity-90 transition-opacity"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
};
