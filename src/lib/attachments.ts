import {
  MAX_IMAGE_BYTES,
  type AllowedImageMime,
  sniffImageMime,
} from '../shared/attachments.ts';
import type { AttachmentOwnerType, ImageAttachmentRecord } from '../shared/types.ts';

/** Ảnh có cạnh dài hơn mức này sẽ được thu nhỏ trước khi tải lên. */
export const MAX_IMAGE_DIMENSION = 2400;
// Ảnh nhỏ hơn mức này (và không quá to về kích thước) được giữ nguyên để không giảm chất lượng biểu đồ.
const KEEP_ORIGINAL_BELOW_BYTES = Math.round(1.5 * 1024 * 1024);

const DECODE_TIMEOUT_MS = 10_000;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export class ImageUploadError extends Error {}

export interface PreparedImage {
  blob: Blob;
  fileName: string;
  mimeType: AllowedImageMime;
  width: number | null;
  height: number | null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function attachmentUrl(id: string): string {
  return `/api/attachments/${encodeURIComponent(id)}`;
}

/** Kích thước sau khi thu nhỏ sao cho cạnh dài nhất không vượt `maxDim` (giữ nguyên tỉ lệ). */
export function computeTargetSize(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDim) return { width, height };
  const scale = maxDim / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function readHeadBytes(file: Blob, length = 16): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  if (typeof slice.arrayBuffer === 'function') return new Uint8Array(await slice.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    }
  } catch {
    // thử cách dự phòng bên dưới
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      // Giới hạn thời gian: nếu trình duyệt không báo kết quả giải mã thì bỏ qua, tránh treo nút "Đang tải".
      const timer = setTimeout(() => reject(new Error('decode timeout')), DECODE_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('decode'));
      };
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Vẽ lại ảnh ở kích thước mới và mã hóa WebP; trình duyệt không hỗ trợ WebP thì dùng JPEG (nền trắng).
async function reencode(
  image: DecodedImage,
  maxDim: number,
  quality: number,
): Promise<{ blob: Blob; mime: AllowedImageMime; width: number; height: number } | null> {
  const size = computeTargetSize(image.width, image.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image.source, 0, 0, size.width, size.height);
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return { blob: webp, mime: 'image/webp', ...size };

  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
  return jpeg ? { blob: jpeg, mime: 'image/jpeg', ...size } : null;
}

function swapExtension(name: string, mime: AllowedImageMime): string {
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'gif';
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'anh';
  return `${base}.${ext}`;
}

/**
 * Kiểm tra file thật sự là ảnh (theo nội dung, không theo đuôi file) và chuẩn bị tải lên:
 * ảnh quá to về kích thước hoặc dung lượng được thu nhỏ/nén; ảnh nhỏ giữ nguyên bản gốc.
 * Ném ImageUploadError với thông báo tiếng Việt nếu không dùng được.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const mime = sniffImageMime(await readHeadBytes(file));
  if (!mime) throw new ImageUploadError(`"${file.name}" không phải ảnh JPEG, PNG, WebP hoặc GIF.`);

  const fileName = (file.name || 'anh').slice(0, 120);
  const image = await decodeImage(file);
  const width = image?.width ?? null;
  const height = image?.height ?? null;
  const tooLargeMessage = `"${file.name}" quá lớn (${formatBytes(file.size)}), tối đa ${formatBytes(MAX_IMAGE_BYTES)}.`;

  try {
    const oversizedDimensions = image !== null && Math.max(image.width, image.height) > MAX_IMAGE_DIMENSION;
    const keepOriginal =
      mime === 'image/gif' || image === null || (!oversizedDimensions && file.size <= KEEP_ORIGINAL_BELOW_BYTES);
    if (keepOriginal) {
      if (file.size > MAX_IMAGE_BYTES) throw new ImageUploadError(tooLargeMessage);
      return { blob: file, fileName, mimeType: mime, width, height };
    }

    const originalFits = file.size <= MAX_IMAGE_BYTES;
    for (const attempt of [
      { maxDim: MAX_IMAGE_DIMENSION, quality: 0.88 },
      { maxDim: 1920, quality: 0.8 },
      { maxDim: 1600, quality: 0.7 },
    ]) {
      const out = await reencode(image, attempt.maxDim, attempt.quality);
      if (!out) break;
      if (out.blob.size > MAX_IMAGE_BYTES) continue; // vẫn quá lớn: thử mức thu nhỏ mạnh hơn
      // Chỉ khi kích thước (pixel) không phải lý do thu nhỏ, mà bản nén lại không nhỏ hơn bản gốc: giữ bản gốc.
      if (originalFits && !oversizedDimensions && out.blob.size >= file.size) {
        return { blob: file, fileName, mimeType: mime, width, height };
      }
      return {
        blob: out.blob,
        fileName: swapExtension(fileName, out.mime),
        mimeType: out.mime,
        width: out.width,
        height: out.height,
      };
    }
    // Không nén được (ví dụ trình duyệt không hỗ trợ canvas): dùng bản gốc nếu còn trong giới hạn.
    if (originalFits) return { blob: file, fileName, mimeType: mime, width, height };
    throw new ImageUploadError(tooLargeMessage);
  } finally {
    image?.close();
  }
}

export async function uploadAttachment(
  ownerType: AttachmentOwnerType,
  ownerId: string,
  image: PreparedImage,
): Promise<ImageAttachmentRecord> {
  const params = new URLSearchParams({ ownerType, ownerId, name: image.fileName });
  if (image.width) params.set('width', String(image.width));
  if (image.height) params.set('height', String(image.height));
  let res: Response;
  try {
    res = await fetch(`/api/attachments?${params.toString()}`, {
      method: 'POST',
      // Luôn gửi dạng octet-stream: máy chủ tự nhận dạng loại ảnh theo nội dung file (và Vercel xử lý sẵn loại này).
      headers: { 'Content-Type': 'application/octet-stream' },
      body: image.blob,
    });
  } catch {
    throw new ImageUploadError('Không kết nối được máy chủ để tải ảnh lên.');
  }
  const body = (await res.json().catch(() => null)) as { attachment?: ImageAttachmentRecord; error?: string } | null;
  if (!res.ok || !body?.attachment) throw new ImageUploadError(body?.error ?? 'Không thể tải ảnh lên.');
  return body.attachment;
}

export async function deleteAttachment(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(attachmentUrl(id), { method: 'DELETE' });
  } catch {
    throw new ImageUploadError('Không kết nối được máy chủ để xóa ảnh.');
  }
  // 404 = ảnh đã không còn, coi như xóa thành công.
  if (!res.ok && res.status !== 404) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ImageUploadError(body?.error ?? 'Không thể xóa ảnh.');
  }
}

/** Lấy các file ảnh từ thao tác dán (Ctrl+V) — ví dụ ảnh chụp màn hình biểu đồ. */
export function imageFilesFromClipboard(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

export function imageFilesFromList(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []);
}
