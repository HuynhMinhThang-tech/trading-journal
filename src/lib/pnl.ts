// Màu lãi / lỗ dùng chung cho biểu đồ (màu tô: cột, biểu đồ tròn).
// - Giao diện Sáng: xanh ngọc sáng (#0DAE7E) và đỏ cam (#D92D20). Hai màu khác nhau cả về sắc độ lẫn độ sáng
//   nên vẫn tách biệt khi khó phân biệt đỏ - xanh lá (đã kiểm tra bằng mô phỏng mù màu).
// - Giao diện Tối: xanh bạc hà sáng / đỏ tươi, tương phản cao trên nền tối.
// Giá trị CSS tương ứng cho chữ, thanh và ô lịch nằm trong src/index.css (--pnl-win / --pnl-loss / *-fill).

export const PNL_HEX = {
  light: {
    win: '#0DAE7E',
    loss: '#D92D20',
    flat: '#8A877E',
    axis: '#55534D',
    tooltipBg: '#1C1B18',
    tooltipBorder: '#32302B',
    barCursor: 'rgba(28, 27, 24, 0.06)',
  },
  dark: {
    win: '#4FE3B0',
    loss: '#FF4D4D',
    flat: '#9C998F',
    axis: '#C2BFB6',
    tooltipBg: '#2A2925',
    tooltipBorder: '#4A4740',
    barCursor: 'rgba(242, 239, 233, 0.08)',
  },
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

// Kiểu tooltip dùng chung cho mọi biểu đồ Recharts. Phải đặt rõ màu chữ cho cả tiêu đề và từng dòng số liệu:
// nếu không, chữ số lấy màu mặc định (đen) và biến mất trên nền tooltip tối.
export function chartTooltipProps(colors: { tooltipBg: string; tooltipBorder: string }) {
  return {
    contentStyle: {
      backgroundColor: colors.tooltipBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: '8px',
      fontSize: '12px',
      color: '#F2EFE9',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
    },
    labelStyle: { color: '#F2EFE9', fontWeight: 700, marginBottom: 4 },
    itemStyle: { color: '#F2EFE9', fontWeight: 600 },
  };
}
