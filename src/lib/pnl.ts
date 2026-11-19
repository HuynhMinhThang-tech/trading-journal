// Màu lãi / lỗ dùng chung.
// - Giao diện Sáng: xanh lá đậm / đỏ đậm (đọc tốt trên nền trắng).
// - Giao diện Tối: xanh bạc hà sáng / san hô sáng (tương phản cao trên nền tối,
//   và khác biệt rõ hơn cả khi nhìn không dựa vào sắc độ đỏ-xanh).
// Giá trị CSS tương ứng nằm trong src/index.css (--pnl-win / --pnl-loss).

export const PNL_HEX = {
  light: { win: '#15803D', loss: '#B91C1C', axis: '#6B6963', tooltipBg: '#1C1B18', tooltipBorder: '#32302B' },
  dark: { win: '#34E3A0', loss: '#FF7A85', axis: '#A6A39B', tooltipBg: '#2A2925', tooltipBorder: '#4A4740' },
} as const;

export function chartColors(isDark: boolean) {
  return isDark ? PNL_HEX.dark : PNL_HEX.light;
}

export function pnlTextClass(value: number): string {
  if (value > 0) return 'text-win';
  if (value < 0) return 'text-loss';
  return '';
}

export function pnlBarClass(value: number): string {
  return value >= 0 ? 'bg-win' : 'bg-loss';
}
