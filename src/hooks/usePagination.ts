import { useEffect, useMemo, useState } from 'react';

export interface PaginationState<T> {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageItems: T[];
  setPage: (page: number) => void;
}

/**
 * Phân trang phía trình duyệt. `resetKey` đổi giá trị (ví dụ khi đổi bộ lọc) thì quay về trang 1;
 * nếu dữ liệu co lại làm trang hiện tại vượt quá tổng số trang thì tự lùi về trang cuối.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey: string = ''): PaginationState<T> {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return { page: safePage, totalPages, total: items.length, pageSize, pageItems, setPage };
}
