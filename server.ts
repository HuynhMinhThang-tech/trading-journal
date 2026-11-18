import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';
import { z } from 'zod';
import { calculateMetrics } from './src/lib/analytics/metricsEngine.ts';
import {
  extractBodiesFromGmailPayload,
  parseVantageAnyInput,
  parseVantageEml,
  parseVantageHtml,
  parseVantagePlainText,
  type GmailPayloadPart,
} from './src/lib/parser/vantageParser.ts';
import {
  BOOTSTRAP_SQL,
  commitParsedStatement,
  createPriceObservation,
  deletePriceObservation,
  getDatabaseStatus,
  getWorkspaceDataset,
  initDatabase,
  recordSyncLog,
  resolveReviewItem,
  updatePriceObservation,
  updateTradingAccount,
  upsertJournalEntry,
} from './src/server/store.ts';

const previewSchema = z.object({
  rawContent: z.string().min(10, 'Nội dung báo cáo quá ngắn'),
  mode: z.enum(['auto', 'text', 'html', 'eml']).optional().default('auto'),
});

const commitSchema = z.object({
  rawContent: z.string().min(10, 'Nội dung báo cáo quá ngắn'),
  mode: z.enum(['auto', 'text', 'html', 'eml']).optional().default('auto'),
  source: z.enum(['paste', 'eml']).optional().default('paste'),
});

const gmailSyncSchema = z.object({
  days: z.number().int().min(1).max(365).optional().default(14),
  dryRun: z.boolean().optional().default(false),
});

const journalSchema = z.object({
  strategy: z.string().default(''),
  marketCondition: z.string().default(''),
  thesis: z.string().default(''),
  plannedEntry: z.string().default(''),
  plannedSL: z.string().default(''),
  plannedTP: z.string().default(''),
  exitReason: z.string().default(''),
  emotionBefore: z.string().default(''),
  emotionDuring: z.string().default(''),
  emotionAfter: z.string().default(''),
  ruleAdherence: z.enum(['tuan_thu', 'vi_pham_nhe', 'vi_pham']).default('tuan_thu'),
  mistakeTags: z.array(z.string()).default([]),
  lessonLearned: z.string().default(''),
});

const observationSchema = z.object({
  symbol: z.string().min(1, 'Vui lòng nhập mã quan sát'),
  observedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD'),
  observedTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ phải có dạng HH:mm'),
  timeframe: z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']),
  session: z.enum(['Á', 'Âu', 'Mỹ', 'Giao phiên Âu-Mỹ']),
  priceAction: z.string().min(1, 'Vui lòng nhập mô tả hành động giá'),
  candlePattern: z.string().min(1, 'Vui lòng nhập đặc điểm nến'),
  marketContext: z.string().default(''),
  confidence: z.number().int().min(1).max(5).default(3),
  habitTag: z.string().default(''),
  outcomeNote: z.string().default(''),
});

const reviewResolveSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  resolutionNote: z.string().default(''),
  dealTicket: z.string().nullable().default(null),
  tradeId: z.string().nullable().default(null),
});

const accountUpdateSchema = z.object({
  label: z.string().min(1),
  serverTimezone: z.string().min(1),
  displayTimezone: z.string().min(1),
});

function parseByMode(rawContent: string, mode: 'auto' | 'text' | 'html' | 'eml') {
  if (mode === 'text') return parseVantagePlainText(rawContent, 'text');
  if (mode === 'html') return parseVantageHtml(rawContent, 'html');
  if (mode === 'eml') return parseVantageEml(rawContent).statement;
  return parseVantageAnyInput(rawContent);
}

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

// Vercel detects this root-level Express entrypoint and deploys it as one Function.
// Database initialization is memoized per warm instance so concurrent requests share it.
const app = express();
app.use(express.json({ limit: '6mb' }));

let databaseInitialization: ReturnType<typeof initDatabase> | null = null;
app.use(async (_req, _res, next) => {
  try {
    if (!databaseInitialization) {
      databaseInitialization = initDatabase();
    }
    await databaseInitialization;
    next();
  } catch (error) {
    next(error);
  }
});

  app.get('/api/health', (_req, res) => {
    const status = getDatabaseStatus();
    res.json({
      ok: true,
      dbConnected: status.connected,
      hasConnectionString: status.hasConnectionString,
      error: status.error,
    });
  });

  app.get('/api/workspace', async (_req, res) => {
    try {
      const dataset = await getWorkspaceDataset();
      const unmatchedDealsCount = dataset.reviewItems.filter(
        (r) => r.type === 'unmatched_deal' && r.status === 'pending',
      ).length;
      const metrics = calculateMetrics(
        dataset.trades,
        dataset.snapshots,
        unmatchedDealsCount,
        dataset.accounts,
      );
      res.json({ dataset, metrics });
    } catch (err) {
      console.error('Error fetching workspace:', err);
      res.status(500).json({ error: 'Không thể tải dữ liệu không gian làm việc.' });
    }
  });

  app.post('/api/imports/preview', (req, res) => {
    const parsedBody = previewSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: parsedBody.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' });
    }
    const result = parseByMode(parsedBody.data.rawContent, parsedBody.data.mode);
    return res.json({ statement: result });
  });

  app.post('/api/imports/commit', async (req, res) => {
    const parsedBody = commitSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: parsedBody.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' });
    }
    try {
      const statement = parseByMode(parsedBody.data.rawContent, parsedBody.data.mode);
      const outcome = await commitParsedStatement(statement, {
        source: parsedBody.data.source,
      });
      return res.json({ outcome, statement });
    } catch (err) {
      console.error('Import commit error:', err);
      return res.status(500).json({ error: 'Lỗi khi lưu báo cáo vào cơ sở dữ liệu.' });
    }
  });

  app.post('/api/gmail/sync', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Thiếu access token Gmail. Vui lòng kết nối lại Gmail.' });
    }
    const parsedBody = gmailSyncSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Tham số đồng bộ không hợp lệ.' });
    }

    const { days, dryRun } = parsedBody.data;
    const headers = { Authorization: authHeader };

    try {
      const query = encodeURIComponent(`from:support@vantagemarkets.com subject:"Daily Confirmation" newer_than:${days}d`);
      const listRes = await fetchWithRetry(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
        headers,
      );

      if (listRes.status === 401 || listRes.status === 403) {
        return res.status(listRes.status).json({
          error: 'Phiên cấp quyền Gmail đã hết hạn hoặc thiếu quyền đọc thư. Vui lòng kết nối lại Gmail.',
          needsReauth: true,
        });
      }
      if (!listRes.ok) {
        return res.status(502).json({ error: `Gmail API trả về lỗi (${listRes.status}).` });
      }

      const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };
      const messageRefs = listData.messages ?? [];

      if (messageRefs.length === 0) {
        await recordSyncLog({
          source: 'gmail',
          gmailMessageId: null,
          sender: 'support@vantagemarkets.com',
          subject: 'Daily Confirmation',
          emailDateHeader: null,
          reportTimestampRaw: null,
          accountNumber: null,
          ordersCount: 0,
          dealsCount: 0,
          status: 'no_new_email',
          message: `Không tìm thấy email Daily Confirmation mới trong ${days} ngày gần nhất.`,
        });
        return res.json({
          scanned: 0,
          imported: 0,
          partial: 0,
          skippedDuplicate: 0,
          rejected: 0,
          previews: [],
          message: `Không có email Daily Confirmation mới trong ${days} ngày qua (không tự ghi P/L = 0).`,
        });
      }

      let imported = 0;
      let partial = 0;
      let skippedDuplicate = 0;
      let rejected = 0;
      const previews: Array<{
        messageId: string;
        emailDate: string;
        accountNumber: string;
        reportTimestampRaw: string;
        ordersCount: number;
        dealsCount: number;
        status: string;
        message: string;
      }> = [];

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

        // Strict verification of sender & subject
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

      return res.json({
        scanned: messageRefs.length,
        imported,
        partial,
        skippedDuplicate,
        rejected,
        previews,
        message: dryRun
          ? `Đã quét thử ${messageRefs.length} email (Dry-run).`
          : `Đồng bộ xong ${messageRefs.length} email: ${imported} mới, ${partial} có cảnh báo, ${skippedDuplicate} đã có sẵn.`,
      });
    } catch (err) {
      console.error('Gmail sync error:', err);
      return res.status(500).json({ error: 'Lỗi máy chủ khi đồng bộ Gmail.' });
    }
  });

  app.put('/api/trades/:tradeId/journal', async (req, res) => {
    const parsed = journalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Nội dung nhật ký không hợp lệ.' });
    }
    try {
      const saved = await upsertJournalEntry(req.params.tradeId, parsed.data);
      return res.json({ journal: saved });
    } catch (err) {
      console.error('Journal save error:', err);
      return res.status(500).json({ error: 'Không thể lưu nhật ký giao dịch.' });
    }
  });

  app.post('/api/observations', async (req, res) => {
    const parsed = observationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dữ liệu quan sát không hợp lệ' });
    }
    try {
      const created = await createPriceObservation(parsed.data);
      return res.status(201).json({ observation: created });
    } catch (err) {
      console.error('Create observation error:', err);
      return res.status(500).json({ error: 'Không thể lưu bản ghi nghiên cứu giá.' });
    }
  });

  app.put('/api/observations/:id', async (req, res) => {
    const parsed = observationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dữ liệu quan sát không hợp lệ' });
    }
    try {
      const updated = await updatePriceObservation(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ error: 'Không tìm thấy bản ghi quan sát.' });
      return res.json({ observation: updated });
    } catch (err) {
      console.error('Update observation error:', err);
      return res.status(500).json({ error: 'Không thể cập nhật bản ghi nghiên cứu giá.' });
    }
  });

  app.delete('/api/observations/:id', async (req, res) => {
    try {
      const ok = await deletePriceObservation(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Không tìm thấy bản ghi cần xóa.' });
      return res.json({ deleted: true });
    } catch (err) {
      console.error('Delete observation error:', err);
      return res.status(500).json({ error: 'Không thể xóa bản ghi nghiên cứu giá.' });
    }
  });

  app.post('/api/review/:id/resolve', async (req, res) => {
    const parsed = reviewResolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dữ liệu xử lý hàng đợi không hợp lệ.' });
    }
    try {
      await resolveReviewItem(
        req.params.id,
        parsed.data.status,
        parsed.data.resolutionNote,
        parsed.data.dealTicket,
        parsed.data.tradeId,
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('Review resolve error:', err);
      return res.status(500).json({ error: 'Không thể cập nhật trạng thái rà soát.' });
    }
  });

  app.patch('/api/accounts/:id', async (req, res) => {
    const parsed = accountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Thông tin tài khoản không hợp lệ.' });
    }
    try {
      await updateTradingAccount(req.params.id, parsed.data);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Account update error:', err);
      return res.status(500).json({ error: 'Không thể cập nhật cài đặt tài khoản.' });
    }
  });

  app.get('/api/export/json', async (_req, res) => {
    try {
      const dataset = await getWorkspaceDataset();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="trading-journal-export.json"');
      return res.send(JSON.stringify(dataset, null, 2));
    } catch {
      return res.status(500).json({ error: 'Không thể xuất dữ liệu.' });
    }
  });

  app.get('/api/export/zip', async (_req, res) => {
    try {
      const dataset = await getWorkspaceDataset();
      const zip = new JSZip();

      const escapeCsv = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const buildCsv = (headers: string[], rows: Array<Array<string | number>>) =>
        '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

      zip.file(
        'lich-su-giao-dich.csv',
        buildCsv(
          ['Ma', 'Chieu', 'Mo', 'Dong', 'KhoiLuong', 'GiaVao', 'GiaRa', 'Phi', 'Swap', 'NetPL', 'ChienLuoc', 'BaiHoc'],
          dataset.trades.map((t) => [
            t.symbol,
            t.side,
            t.openTimeRaw,
            t.closeTimeRaw ?? '',
            t.volume,
            t.entryPrice,
            t.exitPrice ?? '',
            t.commission,
            t.swap,
            t.netPL,
            t.journal?.strategy ?? '',
            t.journal?.lessonLearned ?? '',
          ]),
        ),
      );

      zip.file(
        'nghien-cuu-hanh-dong-gia.csv',
        buildCsv(
          ['Ma', 'Ngay', 'Gio', 'Khung', 'Phien', 'HanhDongGia', 'Nen', 'BoiCanh', 'TinCay', 'ThoiQuen', 'KetQua'],
          dataset.observations.map((o) => [
            o.symbol,
            o.observedDate,
            o.observedTime,
            o.timeframe,
            o.session,
            o.priceAction,
            o.candlePattern,
            o.marketContext,
            o.confidence,
            o.habitTag,
            o.outcomeNote,
          ]),
        ),
      );

      zip.file('sao-luu-toan-bo.json', JSON.stringify(dataset, null, 2));
      zip.file('neon-schema.sql', BOOTSTRAP_SQL.trim() + '\n');

      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="nhat-ky-giao-dich-du-lieu.zip"');
      return res.send(buf);
    } catch (err) {
      console.error('Data ZIP export error:', err);
      return res.status(500).json({ error: 'Không thể tạo file ZIP dữ liệu.' });
    }
  });

  app.get('/api/export/project-zip', async (_req, res) => {
    try {
      const rootDir = process.cwd();
      const zip = new JSZip();
      const ignoredDirs = new Set(['node_modules', 'dist', '.git', '.aistudio', 'dev-dist']);
      const ignoredFiles = new Set(['.env', '.DS_Store']);

      const walk = (dir: string, relBase = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (ignoredDirs.has(entry.name)) continue;
            walk(path.join(dir, entry.name), path.join(relBase, entry.name));
          } else if (entry.isFile()) {
            if (ignoredFiles.has(entry.name) || entry.name.endsWith('.zip')) continue;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.join(relBase, entry.name).replace(/\\/g, '/');
            // Skip large uploaded attachment markdown/screenshots in public/assets/aistudio
            if (relPath.startsWith('public/assets/aistudio/')) continue;
            zip.file(relPath, fs.readFileSync(fullPath));
          }
        }
      };

      walk(rootDir);
      zip.file('neon-schema.sql', BOOTSTRAP_SQL.trim() + '\n');

      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="nhat-ky-giao-dich-full-project.zip"');
      return res.send(buf);
    } catch (err) {
      console.error('Project ZIP export error:', err);
      return res.status(500).json({ error: 'Không thể đóng gói file ZIP mã nguồn.' });
    }
  });

// Explicit error handling keeps failed requests isolated within a serverless invocation.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error:', error);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

export default app;
