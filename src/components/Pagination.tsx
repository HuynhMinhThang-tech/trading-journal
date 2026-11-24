import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Đơn vị hiển thị, ví dụ "lệnh", "quan sát", "bản ghi". */
  unit?: string;
}

// 1 … 4 5 6 … 20 — luôn có trang đầu, trang cuối và các trang kề trang hiện tại.
function buildPageList(page: number, totalPages: number): Array<number | 'gap-start' | 'gap-end'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: Array<number | 'gap-start' | 'gap-end'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) pages.push('gap-start');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push('gap-end');
  pages.push(totalPages);
  return pages;
}

const BTN =
  'min-h-[36px] min-w-[36px] px-2 inline-flex items-center justify-center rounded-lg border text-xs font-mono-num font-semibold transition-colors';

/** Chỉ hiện khi số bản ghi vượt quá một trang. */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  unit = 'bản ghi',
}) => {
  const navRef = useRef<HTMLElement>(null);

  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Trên điện thoại, đổi trang xong thì đưa người dùng về đầu danh sách (thay vì ở lại cuối trang cũ)
  const goTo = (target: number) => {
    onPageChange(target);
    if (window.matchMedia('(max-width: 1023.98px)').matches) {
      requestAnimationFrame(() => {
        navRef.current?.closest('[data-scroll-root]')?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  const summary = (
    <p className="font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
      Hiển thị{' '}
      <strong className="text-[#1C1B18] dark:text-[#F2EFE9]">
        {from}–{to}
      </strong>{' '}
      / {total} {unit}
    </p>
  );

  return (
    <nav
      ref={navRef}
      data-no-swipe
      aria-label="Phân trang"
      className="mt-4 text-xs"
    >
      {/* Điện thoại: Trước · Trang x / y · Sau, nút lớn dễ chạm */}
      <div className="lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className="press inline-flex min-h-[46px] flex-1 items-center justify-center gap-1 rounded-xl border border-[#E7E5E0] bg-white text-sm font-semibold disabled:opacity-40 dark:border-[#32302B] dark:bg-[#22211E]"
          >
            <ChevronLeft className="h-4 w-4" />
            Trước
          </button>
          <span className="min-w-[84px] text-center font-mono-num text-sm font-bold">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages}
            className="press inline-flex min-h-[46px] flex-1 items-center justify-center gap-1 rounded-xl border border-[#E7E5E0] bg-white text-sm font-semibold disabled:opacity-40 dark:border-[#32302B] dark:bg-[#22211E]"
          >
            Sau
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 text-center">{summary}</div>
      </div>

      {/* Máy tính: dãy số trang */}
      <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
      {summary}

      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Trang trước"
          className={`${BTN} border-[#E7E5E0] dark:border-[#32302B] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {buildPageList(page, totalPages).map((item) =>
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`Trang ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={`${BTN} ${
                item === page
                  ? 'bg-[#C96442] border-[#C96442] text-white'
                  : 'border-[#E7E5E0] dark:border-[#32302B] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925]'
              }`}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="min-w-[24px] text-center text-[#55534D] dark:text-[#C2BFB6]">
              …
            </span>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Trang sau"
          className={`${BTN} border-[#E7E5E0] dark:border-[#32302B] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      </div>
    </nav>
  );
};
