import { useEffect, useState } from 'react';

// Theo dõi class `dark` trên <html> để biểu đồ (recharts dùng mã màu cố định) đổi màu theo giao diện.
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    setIsDark(root.classList.contains('dark'));
    return () => observer.disconnect();
  }, []);

  return isDark;
}
