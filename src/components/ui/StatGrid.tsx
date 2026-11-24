import React from 'react';

export interface StatItem {
  label: string;
  value: React.ReactNode;
  /** Chiếm cả hai cột (dành cho giá trị dài). */
  wide?: boolean;
  /** Lớp màu / kiểu cho giá trị (ví dụ text-win). */
  valueClassName?: string;
}

/**
 * Lưới thông số 2 cột có đường kẻ mảnh — dùng trong panel chi tiết để thay cho một hàng của bảng.
 * Đường kẻ tạo bằng khe 1px lộ nền, nên luôn đều dù số ô lẻ.
 */
export const StatGrid: React.FC<{ items: StatItem[] }> = ({ items }) => (
  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E7E5E0] bg-[#E7E5E0] dark:border-[#32302B] dark:bg-[#32302B]">
    {items.map((item) => (
      <div
        key={item.label}
        className={`bg-[#FAF9F5] px-3.5 py-3 dark:bg-[#181715] ${item.wide ? 'col-span-2' : ''}`}
      >
        <dt className="text-[11px] font-semibold text-[#55534D] dark:text-[#C2BFB6]">{item.label}</dt>
        <dd
          className={`mt-1 break-words font-mono-num text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9] ${
            item.valueClassName ?? ''
          }`}
        >
          {item.value}
        </dd>
      </div>
    ))}
  </dl>
);

/** Một mục có tiêu đề nhỏ trong panel chi tiết. */
export const SheetSection: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = '',
}) => (
  <section className={`mt-5 ${className}`}>
    <h3 className="mb-2 text-xs font-bold text-[#55534D] dark:text-[#C2BFB6]">{title}</h3>
    {children}
  </section>
);
