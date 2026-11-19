import { useRef } from 'react';
import type { TouchEvent } from 'react';

const MIN_DISTANCE = 70; // px: kéo ngang tối thiểu để chuyển tab
const MAX_DURATION = 600; // ms: thao tác quá chậm thì coi là kéo cuộn, không phải vuốt
const DIRECTION_RATIO = 1.8; // |ngang| phải lớn hơn |dọc| ít nhất 1,8 lần

// Bỏ qua vuốt bắt đầu trong ô nhập liệu hoặc vùng tự cuộn ngang (bảng, biểu đồ rộng...)
function startsInsideInteractiveArea(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) {
      return true;
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Vuốt ngang để chuyển giữa các panel/tab như app native.
 * Trả về các handler gắn vào vùng nội dung: <div {...useSwipeTabs(onSwipe)} />
 */
export function useSwipeTabs(onSwipe: (direction: 'next' | 'prev') => void) {
  const start = useRef<{ x: number; y: number; time: number; blocked: boolean } | null>(null);

  return {
    onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        start.current = null;
        return;
      }
      const t = e.touches[0];
      start.current = {
        x: t.clientX,
        y: t.clientY,
        time: Date.now(),
        blocked: startsInsideInteractiveArea(e.target),
      };
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current;
      start.current = null;
      if (!s || s.blocked) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.time > MAX_DURATION) return;
      if (Math.abs(dx) < MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;
      onSwipe(dx < 0 ? 'next' : 'prev');
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
