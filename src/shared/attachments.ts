// Quy tắc ảnh đính kèm dùng chung cho giao diện và máy chủ.

/** Dung lượng tối đa mỗi ảnh gửi lên (Vercel giới hạn thân request khoảng 4,5 MB). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Số ảnh tối đa cho mỗi lệnh / mỗi bản ghi quan sát. */
export const MAX_IMAGES_PER_OWNER = 10;

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export function isAllowedImageMime(value: string): value is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(value);
}

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

/**
 * Nhận dạng ảnh theo "chữ ký" của chính nội dung file (không tin tên file hay Content-Type do người gửi khai báo).
 * Chỉ chấp nhận JPEG, PNG, WebP, GIF. SVG và mọi định dạng khác bị từ chối (SVG có thể chứa script).
 */
export function sniffImageMime(bytes: Uint8Array): AllowedImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return 'image/gif';
  }
  // WebP: "RIFF" .... "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}
