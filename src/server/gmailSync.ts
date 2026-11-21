import {
  extractBodiesFromGmailPayload,
  parseVantageHtml,
  parseVantagePlainText,
  type GmailPayloadPart,
} from '../lib/parser/vantageParser.ts';
import { commitParsedStatement, getProcessedGmailMessageIds, recordSyncLog } from './store.ts';

// Đồng bộ Gmail hoàn toàn phía máy chủ: dùng Refresh Token dài hạn để tự lấy Access Token,
// nên không cần đăng nhập / bấm nút trên trình duyệt. Cấu hình bằng biến môi trường:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

const SENDER = 'support@vantagemarkets.com';
const SUBJECT = 'Daily Confirmation';

export class GmailSyncError extends Error {
  status: number;
  needsReauth: boolean;

  constructor(message: string, status = 500, needsReauth = false) {
    super(message);
    this.name = 'GmailSyncError';
    this.status = status;
    this.needsReauth = needsReauth;
  }
}

export interface GmailSyncPreview {
  messageId: string;
  emailDate: string;
  accountNumber: string;
  reportTimestampRaw: string;
  ordersCount: number;
  dealsCount: number;
  status: string;
  message: string;
}

export interface GmailSyncResult {
  scanned: number;
  imported: number;
  partial: number;
  skippedDuplicate: number;
  /** Email đã được xử lý ở các lần trước nên bị bỏ qua, không tải về lại. */
  alreadyProcessed: number;
  rejected: number;
  failed: number;
  previews: GmailSyncPreview[];
  message: string;
}

export type GmailSyncTrigger = 'manual' | 'auto' | 'cron';

interface GmailServerConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function getGmailServerConfig(): GmailServerConfig | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export function isGmailConfigured(): boolean {
  return getGmailServerConfig() !== null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedEmail: string | null = null;

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 2): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { headers });
    if (res.ok || (res.status !== 429 && res.status < 500) || attempt >= retries) {
      return res;
    }
    attempt++;
    await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
  }
}

async function getAccessToken(): Promise<string> {
  const config = getGmailServerConfig();
  if (!config) {
    throw new GmailSyncError(
      'Chưa cấu hình GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN trên máy chủ.',
      503,
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  } | null;

  if (!res.ok || !data?.access_token) {
    cachedToken = null;
    if (data?.error === 'invalid_grant') {
      throw new GmailSyncError(
        'Refresh Token Gmail đã hết hạn hoặc bị thu hồi. Hãy tạo lại GMAIL_REFRESH_TOKEN.',
        401,
        true,
      );
    }
    throw new GmailSyncError(
      `Không lấy được Access Token Gmail (${data?.error ?? res.status}). Kiểm tra GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET.`,
      502,
      true,
    );
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** Địa chỉ Gmail đang được cấp quyền (để hiển thị trạng thái). */
export async function getGmailMailboxEmail(): Promise<string | null> {
  if (cachedEmail) return cachedEmail;
  const token = await getAccessToken();
  const res = await fetchWithRetry('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    Authorization: `Bearer ${token}`,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { emailAddress?: string };
  cachedEmail = data.emailAddress ?? null;
  return cachedEmail;
}

export async function runGmailSync(options: {
  days: number;
  dryRun: boolean;
  trigger: GmailSyncTrigger;
  /** true = quét lại cả email đã xử lý (vẫn không nhập trùng nhờ kiểm tra ID email + checksum). */
  rescan?: boolean;
}): Promise<GmailSyncResult> {
  const { days, dryRun, trigger, rescan = false } = options;
  const accessToken = await getAccessToken();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const query = encodeURIComponent(`from:${SENDER} subject:"${SUBJECT}" newer_than:${days}d`);
  const listRes = await fetchWithRetry(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
    headers,
  );

  if (listRes.status === 401 || listRes.status === 403) {
    cachedToken = null;
    throw new GmailSyncError(
      'Thiếu quyền đọc Gmail (gmail.readonly) hoặc chưa bật Gmail API cho dự án Google Cloud.',
      listRes.status,
      true,
    );
  }
  if (!listRes.ok) {
    throw new GmailSyncError(`Gmail API trả về lỗi (${listRes.status}).`, 502);
  }

  const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };
  const messageRefs = listData.messages ?? [];

  const emptyResult = (message: string, alreadyProcessed = 0): GmailSyncResult => ({
    scanned: messageRefs.length,
    imported: 0,
    partial: 0,
    skippedDuplicate: 0,
    alreadyProcessed,
    rejected: 0,
    failed: 0,
    previews: [],
    message,
  });

  // Lần chạy "không có gì mới" chỉ ghi nhật ký khi do lịch nền hoặc người dùng bấm tay (để còn biết
  // lần quét gần nhất). Tự động khi mở ứng dụng và quét thử thì không ghi, tránh làm tràn lịch sử.
  const logNothingNew = async (message: string) => {
    if (trigger === 'auto' || dryRun) return;
    await recordSyncLog({
      source: 'gmail',
      gmailMessageId: null,
      sender: SENDER,
      subject: SUBJECT,
      emailDateHeader: null,
      reportTimestampRaw: null,
      accountNumber: null,
      ordersCount: 0,
      dealsCount: 0,
      status: 'no_new_email',
      message,
    });
  };

  if (messageRefs.length === 0) {
    await logNothingNew(`Không tìm thấy email Daily Confirmation mới trong ${days} ngày gần nhất.`);
    return emptyResult(`Không có email Daily Confirmation mới trong ${days} ngày qua.`);
  }

  // Chỉ tải về và phân tích những email CHƯA từng xử lý. Việc này chỉ tốn 1 truy vấn nhẹ vào database
  // thay vì tải đầy đủ + phân tích lại tất cả email trong khoảng ngày mỗi lần đồng bộ.
  const processedIds = rescan
    ? new Set<string>()
    : await getProcessedGmailMessageIds(messageRefs.map((ref) => ref.id));
  const freshRefs = messageRefs.filter((ref) => !processedIds.has(ref.id));
  const alreadyProcessed = messageRefs.length - freshRefs.length;

  if (freshRefs.length === 0) {
    const message = `Không có email mới: ${alreadyProcessed} email trong ${days} ngày qua đã được xử lý trước đó.`;
    await logNothingNew(message);
    return emptyResult(message, alreadyProcessed);
  }

  let imported = 0;
  let partial = 0;
  let skippedDuplicate = 0;
  let rejected = 0;
  let failed = 0;
  const previews: GmailSyncPreview[] = [];

  for (const ref of freshRefs) {
    const msgRes = await fetchWithRetry(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
      headers,
    );
    if (!msgRes.ok) continue;
    const msgData = (await msgRes.json()) as {
      id: string;
      internalDate?: string;
      payload?: GmailPayloadPart;
    };

    const hdrs = msgData.payload?.headers ?? [];
    const getHdr = (name: string) =>
      hdrs.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
    const fromHdr = getHdr('From');
    const subjectHdr = getHdr('Subject');
    const dateHdr = getHdr('Date');

    // Kiểm tra chặt người gửi và tiêu đề
    if (
      !fromHdr.toLowerCase().includes('vantagemarkets.com') ||
      !subjectHdr.toLowerCase().includes('daily confirmation')
    ) {
      rejected++;
      if (!dryRun) {
        await recordSyncLog({
          source: 'gmail',
          gmailMessageId: msgData.id,
          sender: fromHdr,
          subject: subjectHdr,
          emailDateHeader: dateHdr,
          reportTimestampRaw: null,
          accountNumber: null,
          ordersCount: 0,
          dealsCount: 0,
          status: 'rejected',
          message: 'Bỏ qua thư vì người gửi hoặc tiêu đề không khớp mẫu Daily Confirmation.',
        });
      }
      continue;
    }

    const { htmlBody, textBody } = extractBodiesFromGmailPayload(msgData.payload);
    const statement = htmlBody
      ? parseVantageHtml(htmlBody, 'gmail')
      : textBody
        ? parseVantagePlainText(textBody, 'gmail')
        : null;

    if (!statement) {
      rejected++;
      if (!dryRun) {
        await recordSyncLog({
          source: 'gmail',
          gmailMessageId: msgData.id,
          sender: fromHdr,
          subject: subjectHdr,
          emailDateHeader: dateHdr,
          reportTimestampRaw: null,
          accountNumber: null,
          ordersCount: 0,
          dealsCount: 0,
          status: 'rejected',
          message: 'Email không có nội dung HTML hoặc văn bản để phân tích.',
        });
      }
      continue;
    }

    if (dryRun) {
      previews.push({
        messageId: msgData.id,
        emailDate: dateHdr,
        accountNumber: statement.header.accountNumber,
        reportTimestampRaw: statement.header.reportTimestampRaw,
        ordersCount: statement.orders.length,
        dealsCount: statement.deals.length,
        status: statement.validationStatus,
        message: 'Xem trước thành công (chưa ghi vào database).',
      });
      continue;
    }

    let outcome: Awaited<ReturnType<typeof commitParsedStatement>>;
    try {
      outcome = await commitParsedStatement(statement, {
        source: 'gmail',
        gmailMessageId: msgData.id,
        sender: fromHdr,
        subject: subjectHdr,
        emailDateHeader: dateHdr,
      });
    } catch (err) {
      // Hai lần đồng bộ chạy song song (ví dụ lịch nền + mở ứng dụng) có thể cùng nhập một email:
      // lần đến sau vi phạm chỉ mục duy nhất. Coi là trùng thay vì làm hỏng cả đợt đồng bộ.
      const code = (err as { code?: string; cause?: { code?: string } })?.code
        ?? (err as { cause?: { code?: string } })?.cause?.code;
      if (code === '23505') {
        skippedDuplicate++;
        continue;
      }
      console.error('Gmail import error:', err);
      failed++;
      await recordSyncLog({
        source: 'gmail',
        gmailMessageId: msgData.id,
        sender: fromHdr,
        subject: subjectHdr,
        emailDateHeader: dateHdr,
        reportTimestampRaw: statement.header.reportTimestampRaw || null,
        accountNumber: statement.header.accountNumber || null,
        ordersCount: statement.orders.length,
        dealsCount: statement.deals.length,
        status: 'failed',
        message: 'Lỗi khi lưu báo cáo vào cơ sở dữ liệu; sẽ thử lại ở lần đồng bộ sau.',
      });
      continue;
    }

    if (outcome.status === 'imported') imported++;
    else if (outcome.status === 'partial') partial++;
    else if (outcome.status === 'skipped_duplicate') skippedDuplicate++;
    else rejected++;

    previews.push({
      messageId: msgData.id,
      emailDate: dateHdr,
      accountNumber: statement.header.accountNumber,
      reportTimestampRaw: statement.header.reportTimestampRaw,
      ordersCount: statement.orders.length,
      dealsCount: statement.deals.length,
      status: outcome.status,
      message: outcome.message,
    });
  }

  const skippedNote = alreadyProcessed > 0 ? `; bỏ qua ${alreadyProcessed} email đã xử lý trước đó` : '';
  return {
    scanned: messageRefs.length,
    imported,
    partial,
    skippedDuplicate,
    alreadyProcessed,
    rejected,
    failed,
    previews,
    message: dryRun
      ? `Đã quét thử ${freshRefs.length} email chưa xử lý${skippedNote} (Dry-run).`
      : `Đồng bộ xong ${freshRefs.length} email mới: ${imported} nhập mới, ${partial} có cảnh báo, ${skippedDuplicate} trùng báo cáo đã có${skippedNote}.`,
  };
}
