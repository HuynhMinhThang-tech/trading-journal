import { useSyncExternalStore } from 'react';

/** Theo dõi một media query (ví dụ '(max-width: 1023.98px)'); tự cập nhật khi xoay màn hình / đổi cỡ cửa sổ. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Điện thoại / máy tính bảng dọc: dưới breakpoint `lg` của Tailwind (1024px), nơi bố cục "app" được dùng. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023.98px)');
}
