import 'dotenv/config';
import express from 'express';
import JSZip from 'jszip';
import { z } from 'zod';
import { calculateMetrics } from './src/lib/analytics/metricsEngine.ts';
import {
  parseVantageAnyInput,
  parseVantageEml,
  parseVantageHtml,
  parseVantagePlainText,
} from './src/lib/parser/vantageParser.ts';
import {
  GmailSyncError,
  getGmailMailboxEmail,
  isGmailConfigured,
  runGmailSync,
} from './src/server/gmailSync.ts';
import {
  BOOTSTRAP_SQL,
  commitParsedStatement,
  createPriceObservation,
  deletePriceObservation,
  getDatabaseStatus,
  getWorkspaceDataset,
  initDatabase,
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
  // 'yesterday' = chỉ quét email nhận từ 00:00 hôm qua (giờ Việt Nam) trở đi, tức báo cáo ngày T-1.
  window: z.enum(['yesterday', 'days']).optional().default('days'),
  dryRun: z.boolean().optional().default(false),
  trigger: z.enum(['manual', 'auto']).optional().default('manual'),
  rescan: z.boolean().optional().default(false),
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
  // Giờ không còn nhập từ giao diện; bản ghi cũ vẫn giữ giờ đã lưu.
  observedTime: z.string().regex(/^(\d{2}:\d{2})?$/, 'Giờ phải có dạng HH:mm').default(''),
  // Khung thời gian và phiên không còn bắt buộc (giao diện đã bỏ); bản ghi cũ vẫn giữ giá trị đã lưu.
  timeframe: z.enum(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', '']).default(''),
  session: z.enum(['Á', 'Âu', 'Mỹ', 'Giao phiên Âu-Mỹ', '']).default(''),
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

// Vercel detects this root-level Express entrypoint and deploys it as one Function.
// Database initialization is memoized per warm instance so concurrent requests share it.
const app = express();
app.use(express.json({ limit: '6mb' }));

let databaseInitialization: ReturnType<typeof initDatabase> | null = null;
app.use(async (req, res, next) => {
  try {
    if (!databaseInitialization) {
      databaseInitialization = initDatabase();
    }
    const status = await databaseInitialization;
    if (!status.connected && status.error) {
      // Lỗi kết nối thật (không phải thiếu DATABASE_URL): cho phép thử lại ở request sau.
      databaseInitialization = null;
    }
    // Trên Vercel, bộ nhớ tạm của function sẽ mất sau mỗi lần khởi động lại,
    // nên báo lỗi rõ ràng thay vì âm thầm ghi dữ liệu vào bộ nhớ tạm.
    if (process.env.VERCEL && !status.connected && req.path !== '/api/health') {
      return res.status(503).json({
        error: status.error
          ? `Không kết nối được cơ sở dữ liệu Neon: ${status.error}`
          : 'Chưa cấu hình DATABASE_URL trên Vercel (Settings → Environment Variables).',
      });
    }
    next();
  } catch (error) {
    databaseInitialization = null;
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

  function sendGmailError(res: express.Response, err: unknown) {
    if (err instanceof GmailSyncError) {
      return res.status(err.status).json({
        error: err.message,
        needsReauth: err.needsReauth,
        notConfigured: err.status === 503,
      });
    }
    console.error('Gmail sync error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ khi đồng bộ Gmail.' });
  }

  // Trạng thái kết nối Gmail phía máy chủ (không trả về bất kỳ khóa bí mật nào).
  app.get('/api/gmail/status', async (_req, res) => {
    if (!isGmailConfigured()) {
      return res.json({ configured: false, email: null, error: null });
    }
    try {
      const email = await getGmailMailboxEmail();
      return res.json({ configured: true, email, error: null });
    } catch (err) {
      return res.json({
        configured: true,
        email: null,
        error: err instanceof GmailSyncError ? err.message : 'Không kiểm tra được kết nối Gmail.',
      });
    }
  });

  // Đồng bộ thủ công (nút bấm) hoặc tự động khi mở ứng dụng. Dùng thông tin đăng nhập lưu trên máy chủ.
  app.post('/api/gmail/sync', async (req, res) => {
    const parsedBody = gmailSyncSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Tham số đồng bộ không hợp lệ.' });
    }
    // Tự động quét khi mở ứng dụng mà chưa cấu hình Gmail: bỏ qua êm, không trả lỗi.
    if (parsedBody.data.trigger === 'auto' && !isGmailConfigured()) {
      return res.json({ skipped: true, imported: 0, partial: 0, message: 'Gmail chưa được cấu hình.' });
    }
    try {
      const result = await runGmailSync(parsedBody.data);
      return res.json(result);
    } catch (err) {
      return sendGmailError(res, err);
    }
  });

  // Vercel Cron gọi mỗi ngày lúc 08:00 giờ Việt Nam (xem vercel.json), chỉ quét báo cáo ngày T-1.
  // Nếu đặt CRON_SECRET, Vercel tự gửi kèm header Authorization: Bearer <CRON_SECRET>.
  app.get('/api/cron/gmail-sync', async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const result = await runGmailSync({ days: 2, window: 'yesterday', dryRun: false, trigger: 'cron' });
      return res.json(result);
    } catch (err) {
      return sendGmailError(res, err);
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

// Explicit error handling keeps failed requests isolated within a serverless invocation.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error:', error);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

export default app;
