import {
  extractBodiesFromGmailPayload,
  parseVantageHtml,
  parseVantagePlainText,
  type GmailPayloadPart,
} from '../lib/parser/vantageParser.ts';
import { commitParsedStatement, recordSyncLog } from './store.ts';

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
  rejected: number;
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
}): Promise<GmailSyncResult> {
  const { days, dryRun, trigger } = options;
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

  if (messageRefs.length === 0) {
    // Tự động chạy rất thường xuyên nên không ghi log "không có email" để khỏi làm tràn lịch sử.
    if (trigger !== 'auto') {
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
        message: `Không tìm thấy email Daily Confirmation mới trong ${days} ngày gần nhất.`,
      });
    }
    return {
      scanned: 0,
      imported: 0,
      partial: 0,
      skippedDuplicate: 0,
      rejected: 0,
      previews: [],
      message: `Không có email Daily Confirmation mới trong ${days} ngày qua.`,
    };
  }

  let imported = 0;
  let partial = 0;
  let skippedDuplicate = 0;
  let rejected = 0;
  const previews: GmailSyncPreview[] = [];

  for (const ref of messageRefs) {
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

    const outcome = await commitParsedStatement(statement, {
      source: 'gmail',
      gmailMessageId: msgData.id,
      sender: fromHdr,
      subject: subjectHdr,
      emailDateHeader: dateHdr,
    });

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

  return {
    scanned: messageRefs.length,
    imported,
    partial,
    skippedDuplicate,
    rejected,
    previews,
    message: dryRun
      ? `Đã quét thử ${messageRefs.length} email (Dry-run).`
      : `Đồng bộ xong ${messageRefs.length} email: ${imported} mới, ${partial} có cảnh báo, ${skippedDuplicate} đã có sẵn.`,
  };
}
