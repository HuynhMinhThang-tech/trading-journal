import crypto from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type {
  AccountSnapshotRecord,
  DealEntryType,
  DealRecord,
  JournalEntry,
  OrderRecord,
  ParsedStatement,
  ParseWarning,
  PriceObservation,
  ReviewItem,
  RuleAdherence,
  StatementImportRecord,
  SyncLogRecord,
  TradingAccountRecord,
  WorkspaceDataset,
} from '../shared/types.ts';
import { matchDealsToTrades, type DealWithAccount } from '../lib/trading/tradeMatcher.ts';
import * as schema from './schema.ts';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;
let dbReady = false;
let dbError: string | null = null;

// In-memory fallback store used ONLY when DATABASE_URL is not configured yet
const mem = {
  accounts: [] as TradingAccountRecord[],
  imports: [] as StatementImportRecord[],
  orders: [] as Array<OrderRecord & { accountId: string; accountNumber: string; importId: string }>,
  deals: [] as Array<DealRecord & { accountId: string; accountNumber: string; importId: string }>,
  snapshots: [] as AccountSnapshotRecord[],
  journals: new Map<string, JournalEntry>(),
  observations: [] as PriceObservation[],
  reviewOverrides: new Map<string, { status: 'resolved' | 'dismissed'; note: string; dealTicket: string | null; tradeId: string | null; resolvedAt: string }>(),
  syncLogs: [] as SyncLogRecord[],
};

export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS trading_accounts (
  id TEXT PRIMARY KEY,
  broker TEXT NOT NULL DEFAULT 'Vantage Markets',
  label TEXT NOT NULL,
  account_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  server_timezone TEXT NOT NULL DEFAULT 'Unknown',
  display_timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_number ON trading_accounts(account_number);

CREATE TABLE IF NOT EXISTS statement_imports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES trading_accounts(id),
  account_number TEXT NOT NULL,
  source_type TEXT NOT NULL,
  gmail_message_id TEXT,
  email_date_header TEXT,
  report_timestamp_raw TEXT NOT NULL,
  report_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  orders_count INTEGER NOT NULL DEFAULT 0,
  deals_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_gmail_msg ON statement_imports(gmail_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_checksum ON statement_imports(account_id, checksum);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES statement_imports(id),
  account_id TEXT NOT NULL REFERENCES trading_accounts(id),
  account_number TEXT NOT NULL,
  open_time_raw TEXT NOT NULL,
  ticket TEXT NOT NULL,
  type TEXT NOT NULL,
  size_raw TEXT NOT NULL,
  size_requested NUMERIC(24, 10),
  size_filled NUMERIC(24, 10),
  symbol TEXT NOT NULL,
  price_raw TEXT NOT NULL,
  stop_loss NUMERIC(24, 10),
  take_profit NUMERIC(24, 10),
  execution_time_raw TEXT NOT NULL,
  state TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_account_ticket ON orders(account_id, ticket);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES statement_imports(id),
  account_id TEXT NOT NULL REFERENCES trading_accounts(id),
  account_number TEXT NOT NULL,
  time_raw TEXT NOT NULL,
  ticket TEXT NOT NULL,
  type TEXT NOT NULL,
  volume NUMERIC(24, 10) NOT NULL,
  symbol TEXT NOT NULL,
  price NUMERIC(24, 10) NOT NULL,
  order_ticket TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  entry TEXT NOT NULL,
  commission NUMERIC(20, 8) NOT NULL DEFAULT 0,
  swap NUMERIC(20, 8) NOT NULL DEFAULT 0,
  profit NUMERIC(20, 8) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_account_ticket ON deals(account_id, ticket);

CREATE TABLE IF NOT EXISTS account_snapshots (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES statement_imports(id),
  account_id TEXT NOT NULL REFERENCES trading_accounts(id),
  account_number TEXT NOT NULL,
  report_timestamp_raw TEXT NOT NULL,
  report_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  previous_ledger_balance NUMERIC(20, 8) NOT NULL,
  previous_equity NUMERIC(20, 8) NOT NULL,
  balance NUMERIC(20, 8) NOT NULL,
  equity NUMERIC(20, 8) NOT NULL,
  floating_pl NUMERIC(20, 8) NOT NULL,
  closed_trade_pl NUMERIC(20, 8) NOT NULL,
  deposits_withdrawals NUMERIC(20, 8) NOT NULL,
  credit_facility NUMERIC(20, 8) NOT NULL,
  round_commission NUMERIC(20, 8) NOT NULL,
  instant_commission NUMERIC(20, 8) NOT NULL,
  additional_operations NUMERIC(20, 8) NOT NULL,
  total NUMERIC(20, 8) NOT NULL,
  margin_requirements NUMERIC(20, 8) NOT NULL,
  available_margin NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_account_ts ON account_snapshots(account_id, report_timestamp_raw);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT '',
  market_condition TEXT NOT NULL DEFAULT '',
  thesis TEXT NOT NULL DEFAULT '',
  planned_entry TEXT NOT NULL DEFAULT '',
  planned_sl TEXT NOT NULL DEFAULT '',
  planned_tp TEXT NOT NULL DEFAULT '',
  exit_reason TEXT NOT NULL DEFAULT '',
  emotion_before TEXT NOT NULL DEFAULT '',
  emotion_during TEXT NOT NULL DEFAULT '',
  emotion_after TEXT NOT NULL DEFAULT '',
  rule_adherence TEXT NOT NULL DEFAULT 'tuan_thu',
  mistake_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  lesson_learned TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_observations (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  observed_time TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  session TEXT NOT NULL,
  price_action TEXT NOT NULL,
  candle_pattern TEXT NOT NULL,
  market_context TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 3,
  habit_tag TEXT NOT NULL DEFAULT '',
  outcome_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_overrides (
  id TEXT PRIMARY KEY,
  review_item_id TEXT NOT NULL,
  deal_ticket TEXT,
  trade_id TEXT,
  status TEXT NOT NULL,
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  gmail_message_id TEXT,
  sender TEXT,
  subject TEXT,
  email_date_header TEXT,
  report_timestamp_raw TEXT,
  account_number TEXT,
  orders_count INTEGER NOT NULL DEFAULT 0,
  deals_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function initDatabase(): Promise<{ connected: boolean; error: string | null }> {
  const connStr = process.env.DATABASE_URL?.trim();
  if (!connStr) {
    dbReady = false;
    dbError = null;
    return { connected: false, error: null };
  }

  try {
    if (!pool) {
      pool = new Pool({
        connectionString: connStr,
        ssl: connStr.includes('localhost') || connStr.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
        max: 5,
      });
      db = drizzle(pool, { schema });
    }
    await pool.query(BOOTSTRAP_SQL);
    dbReady = true;
    dbError = null;
    return { connected: true, error: null };
  } catch (err) {
    dbReady = false;
    dbError = err instanceof Error ? err.message : 'Không thể kết nối Neon PostgreSQL';
    console.error('Neon DB initialization error:', dbError);
    return { connected: false, error: dbError };
  }
}

export function getDatabaseStatus() {
  return {
    connected: dbReady,
    hasConnectionString: Boolean(process.env.DATABASE_URL?.trim()),
    error: dbError,
  };
}

export async function getWorkspaceDataset(): Promise<WorkspaceDataset> {
  if (dbReady && db) {
    const [
      acctRows,
      importRows,
      orderRows,
      dealRows,
      snapRows,
      journalRows,
      obsRows,
      overrideRows,
      logRows,
    ] = await Promise.all([
      db.select().from(schema.tradingAccounts),
      db.select().from(schema.statementImports).orderBy(desc(schema.statementImports.createdAt)),
      db.select().from(schema.ordersTable).orderBy(desc(schema.ordersTable.openTimeRaw)),
      db.select().from(schema.dealsTable).orderBy(desc(schema.dealsTable.timeRaw)),
      db.select().from(schema.accountSnapshots).orderBy(schema.accountSnapshots.reportTimestampRaw),
      db.select().from(schema.journalEntries),
      db.select().from(schema.priceObservations).orderBy(desc(schema.priceObservations.observedDate), desc(schema.priceObservations.observedTime)),
      db.select().from(schema.reviewOverrides),
      db.select().from(schema.syncLogs).orderBy(desc(schema.syncLogs.createdAt)).limit(50),
    ]);

    const accounts: TradingAccountRecord[] = acctRows.map((a) => ({
      id: a.id,
      broker: a.broker,
      label: a.label,
      accountNumber: a.accountNumber,
      currency: a.currency,
      serverTimezone: a.serverTimezone,
      displayTimezone: a.displayTimezone,
      createdAt: a.createdAt.toISOString(),
    }));

    const imports: StatementImportRecord[] = importRows.map((im) => ({
      id: im.id,
      accountId: im.accountId,
      accountNumber: im.accountNumber,
      sourceType: im.sourceType as StatementImportRecord['sourceType'],
      gmailMessageId: im.gmailMessageId,
      emailDateHeader: im.emailDateHeader,
      reportTimestampRaw: im.reportTimestampRaw,
      reportDate: im.reportDate,
      currency: im.currency,
      parserVersion: im.parserVersion,
      ordersCount: im.ordersCount,
      dealsCount: im.dealsCount,
      status: im.status as StatementImportRecord['status'],
      warnings: (im.warnings as ParseWarning[]) ?? [],
      checksum: im.checksum,
      createdAt: im.createdAt.toISOString(),
    }));

    const orders = orderRows.map((o) => ({
      importId: o.importId,
      accountNumber: o.accountNumber,
      openTimeRaw: o.openTimeRaw,
      ticket: o.ticket,
      type: o.type,
      sizeRaw: o.sizeRaw,
      sizeRequested: o.sizeRequested,
      sizeFilled: o.sizeFilled,
      symbol: o.symbol,
      priceRaw: o.priceRaw,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      executionTimeRaw: o.executionTimeRaw,
      state: o.state,
      comment: o.comment,
    }));

    const dealsForUi = dealRows.map((d) => ({
      importId: d.importId,
      accountNumber: d.accountNumber,
      timeRaw: d.timeRaw,
      ticket: d.ticket,
      type: d.type,
      volume: String(Number(d.volume)),
      symbol: d.symbol,
      price: String(Number(d.price)),
      orderTicket: d.orderTicket,
      comment: d.comment,
      entry: d.entry as DealEntryType,
      commission: Number(d.commission).toFixed(2),
      swap: Number(d.swap).toFixed(2),
      profit: Number(d.profit).toFixed(2),
    }));

    const dealsForMatcher: DealWithAccount[] = dealRows.map((d) => ({
      accountId: d.accountId,
      accountNumber: d.accountNumber,
      timeRaw: d.timeRaw,
      ticket: d.ticket,
      type: d.type,
      volume: String(d.volume),
      symbol: d.symbol,
      price: String(d.price),
      orderTicket: d.orderTicket,
      comment: d.comment,
      entry: d.entry as DealEntryType,
      commission: String(d.commission),
      swap: String(d.swap),
      profit: String(d.profit),
    }));

    const journalsMap = new Map<string, JournalEntry>();
    for (const j of journalRows) {
      journalsMap.set(j.tradeId, {
        id: j.id,
        tradeId: j.tradeId,
        strategy: j.strategy,
        marketCondition: j.marketCondition,
        thesis: j.thesis,
        plannedEntry: j.plannedEntry,
        plannedSL: j.plannedSL,
        plannedTP: j.plannedTP,
        exitReason: j.exitReason,
        emotionBefore: j.emotionBefore,
        emotionDuring: j.emotionDuring,
        emotionAfter: j.emotionAfter,
        ruleAdherence: j.ruleAdherence as RuleAdherence,
        mistakeTags: (j.mistakeTags as string[]) ?? [],
        lessonLearned: j.lessonLearned,
        updatedAt: j.updatedAt.toISOString(),
      });
    }

    const overrideByItem = new Map<string, typeof overrideRows[number]>();
    const manualDealOverrides = new Map<string, string>();
    for (const ov of overrideRows) {
      overrideByItem.set(ov.reviewItemId, ov);
      if (ov.status === 'resolved' && ov.dealTicket && ov.tradeId) {
        manualDealOverrides.set(ov.dealTicket, ov.tradeId);
      }
    }

    const { trades, reviewItems: generatedReviews } = matchDealsToTrades(
      dealsForMatcher,
      journalsMap,
      manualDealOverrides,
    );

    const reviewItems: ReviewItem[] = generatedReviews.map((item) => {
      const ov = overrideByItem.get(item.id);
      if (!ov) return item;
      return {
        ...item,
        status: ov.status as ReviewItem['status'],
        resolutionNote: ov.resolutionNote,
        resolvedAt: ov.resolvedAt.toISOString(),
      };
    });

    // Add warning-based review items from partial imports
    for (const im of imports) {
      if (im.warnings.length > 0) {
        const revId = `rev_warn_${im.id}`;
        const ov = overrideByItem.get(revId);
        reviewItems.push({
          id: revId,
          type: 'parse_warning',
          status: (ov?.status as ReviewItem['status']) ?? 'pending',
          symbol: 'Tài khoản ' + im.accountNumber,
          dealTicket: null,
          tradeId: null,
          title: `Cảnh báo đối chiếu báo cáo ngày ${im.reportDate}`,
          description: im.warnings.map((w) => w.message).join(' | '),
          resolutionNote: ov?.resolutionNote ?? null,
          createdAt: im.createdAt,
          resolvedAt: ov?.resolvedAt.toISOString() ?? null,
        });
      }
    }

    const snapshots: AccountSnapshotRecord[] = snapRows.map((s) => ({
      id: s.id,
      accountId: s.accountId,
      accountNumber: s.accountNumber,
      reportTimestampRaw: s.reportTimestampRaw,
      reportDate: s.reportDate,
      currency: s.currency,
      previousLedgerBalance: Number(s.previousLedgerBalance).toFixed(2),
      previousEquity: Number(s.previousEquity).toFixed(2),
      balance: Number(s.balance).toFixed(2),
      equity: Number(s.equity).toFixed(2),
      floatingPL: Number(s.floatingPL).toFixed(2),
      closedTradePL: Number(s.closedTradePL).toFixed(2),
      depositsWithdrawals: Number(s.depositsWithdrawals).toFixed(2),
      creditFacility: Number(s.creditFacility).toFixed(2),
      roundCommission: Number(s.roundCommission).toFixed(2),
      instantCommission: Number(s.instantCommission).toFixed(2),
      additionalOperations: Number(s.additionalOperations).toFixed(2),
      total: Number(s.total).toFixed(2),
      marginRequirements: Number(s.marginRequirements).toFixed(2),
      availableMargin: Number(s.availableMargin).toFixed(2),
    }));

    const observations: PriceObservation[] = obsRows.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      observedDate: o.observedDate,
      observedTime: o.observedTime,
      timeframe: o.timeframe as PriceObservation['timeframe'],
      session: o.session as PriceObservation['session'],
      priceAction: o.priceAction,
      candlePattern: o.candlePattern,
      marketContext: o.marketContext,
      confidence: o.confidence,
      habitTag: o.habitTag,
      outcomeNote: o.outcomeNote,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }));

    const syncLogsList: SyncLogRecord[] = logRows.map((l) => ({
      id: l.id,
      source: l.source as SyncLogRecord['source'],
      gmailMessageId: l.gmailMessageId,
      sender: l.sender,
      subject: l.subject,
      emailDateHeader: l.emailDateHeader,
      reportTimestampRaw: l.reportTimestampRaw,
      accountNumber: l.accountNumber,
      ordersCount: l.ordersCount,
      dealsCount: l.dealsCount,
      status: l.status as SyncLogRecord['status'],
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    }));

    return {
      dbConnected: true,
      accounts,
      imports,
      orders,
      deals: dealsForUi,
      trades,
      snapshots,
      observations,
      reviewItems,
      syncLogs: syncLogsList,
    };
  }

  // In-memory fallback mode when DATABASE_URL is not configured yet
  const manualDealOverrides = new Map<string, string>();
  for (const [, ov] of mem.reviewOverrides.entries()) {
    if (ov.status === 'resolved' && ov.dealTicket && ov.tradeId) {
      manualDealOverrides.set(ov.dealTicket, ov.tradeId);
    }
  }
  const { trades, reviewItems: generatedReviews } = matchDealsToTrades(
    mem.deals,
    mem.journals,
    manualDealOverrides,
  );
  const reviewItems: ReviewItem[] = generatedReviews.map((item) => {
    const ov = mem.reviewOverrides.get(item.id);
    if (!ov) return item;
    return {
      ...item,
      status: ov.status,
      resolutionNote: ov.note,
      resolvedAt: ov.resolvedAt,
    };
  });
  for (const im of mem.imports) {
    if (im.warnings.length > 0) {
      const revId = `rev_warn_${im.id}`;
      const ov = mem.reviewOverrides.get(revId);
      reviewItems.push({
        id: revId,
        type: 'parse_warning',
        status: ov?.status ?? 'pending',
        symbol: 'Tài khoản ' + im.accountNumber,
        dealTicket: null,
        tradeId: null,
        title: `Cảnh báo đối chiếu báo cáo ngày ${im.reportDate}`,
        description: im.warnings.map((w) => w.message).join(' | '),
        resolutionNote: ov?.note ?? null,
        createdAt: im.createdAt,
        resolvedAt: ov?.resolvedAt ?? null,
      });
    }
  }

  return {
    dbConnected: false,
    accounts: [...mem.accounts],
    imports: [...mem.imports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    orders: [...mem.orders].sort((a, b) => b.openTimeRaw.localeCompare(a.openTimeRaw)),
    deals: [...mem.deals].sort((a, b) => b.timeRaw.localeCompare(a.timeRaw)),
    trades,
    snapshots: [...mem.snapshots].sort((a, b) => a.reportTimestampRaw.localeCompare(b.reportTimestampRaw)),
    observations: [...mem.observations].sort((a, b) =>
      `${b.observedDate} ${b.observedTime}`.localeCompare(`${a.observedDate} ${a.observedTime}`),
    ),
    reviewItems,
    syncLogs: [...mem.syncLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export interface CommitMeta {
  source: 'gmail' | 'eml' | 'paste';
  gmailMessageId?: string | null;
  sender?: string | null;
  subject?: string | null;
  emailDateHeader?: string | null;
}

export async function commitParsedStatement(
  parsed: ParsedStatement,
  meta: CommitMeta,
): Promise<{ status: 'imported' | 'partial' | 'skipped_duplicate' | 'rejected'; message: string; importId?: string }> {
  if (parsed.validationStatus === 'invalid') {
    const msg = parsed.warnings.map((w) => w.message).join('; ') || 'Báo cáo không hợp lệ';
    await recordSyncLog({
      source: meta.source,
      gmailMessageId: meta.gmailMessageId ?? null,
      sender: meta.sender ?? null,
      subject: meta.subject ?? null,
      emailDateHeader: meta.emailDateHeader ?? null,
      reportTimestampRaw: parsed.header.reportTimestampRaw || null,
      accountNumber: parsed.header.accountNumber || null,
      ordersCount: 0,
      dealsCount: 0,
      status: 'rejected',
      message: msg,
    });
    return { status: 'rejected', message: msg };
  }

  const acctNum = parsed.header.accountNumber;
  const acctId = `acct_${acctNum}`;
  const importId = `imp_${crypto.randomUUID()}`;

  if (dbReady && db) {
    // Check duplicate by gmailMessageId or account+checksum
    if (meta.gmailMessageId) {
      const existingByMsg = await db
        .select()
        .from(schema.statementImports)
        .where(eq(schema.statementImports.gmailMessageId, meta.gmailMessageId));
      if (existingByMsg.length > 0) {
        return {
          status: 'skipped_duplicate',
          message: `Email (ID ${meta.gmailMessageId}) đã được nhập trước đó.`,
        };
      }
    }

    const existingChecksum = await db
      .select()
      .from(schema.statementImports)
      .where(eq(schema.statementImports.checksum, parsed.checksum));
    if (existingChecksum.some((r) => r.accountId === acctId)) {
      await recordSyncLog({
        source: meta.source,
        gmailMessageId: meta.gmailMessageId ?? null,
        sender: meta.sender ?? null,
        subject: meta.subject ?? null,
        emailDateHeader: meta.emailDateHeader ?? null,
        reportTimestampRaw: parsed.header.reportTimestampRaw,
        accountNumber: acctNum,
        ordersCount: parsed.orders.length,
        dealsCount: parsed.deals.length,
        status: 'skipped_duplicate',
        message: `Báo cáo ngày ${parsed.header.reportTimestampRaw} của tài khoản ${acctNum} đã tồn tại (chống trùng).`,
      });
      return {
        status: 'skipped_duplicate',
        message: `Báo cáo ngày ${parsed.header.reportTimestampRaw} đã tồn tại — bỏ qua để tránh trùng lặp.`,
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.tradingAccounts)
        .values({
          id: acctId,
          broker: 'Vantage Markets',
          label: `Vantage ${acctNum}`,
          accountNumber: acctNum,
          currency: parsed.header.currency,
          serverTimezone: 'Unknown',
          displayTimezone: 'Asia/Ho_Chi_Minh',
        })
        .onConflictDoNothing();

      await tx.insert(schema.statementImports).values({
        id: importId,
        accountId: acctId,
        accountNumber: acctNum,
        sourceType: parsed.sourceType,
        gmailMessageId: meta.gmailMessageId ?? null,
        emailDateHeader: meta.emailDateHeader ?? null,
        reportTimestampRaw: parsed.header.reportTimestampRaw,
        reportDate: parsed.header.reportDate,
        currency: parsed.header.currency,
        parserVersion: parsed.parserVersion,
        ordersCount: parsed.orders.length,
        dealsCount: parsed.deals.length,
        status: parsed.validationStatus,
        warnings: parsed.warnings,
        checksum: parsed.checksum,
      });

      for (const o of parsed.orders) {
        await tx
          .insert(schema.ordersTable)
          .values({
            id: `ord_${acctId}_${o.ticket}`,
            importId,
            accountId: acctId,
            accountNumber: acctNum,
            openTimeRaw: o.openTimeRaw,
            ticket: o.ticket,
            type: o.type,
            sizeRaw: o.sizeRaw,
            sizeRequested: o.sizeRequested,
            sizeFilled: o.sizeFilled,
            symbol: o.symbol,
            priceRaw: o.priceRaw,
            stopLoss: o.stopLoss,
            takeProfit: o.takeProfit,
            executionTimeRaw: o.executionTimeRaw,
            state: o.state,
            comment: o.comment,
          })
          .onConflictDoNothing();
      }

      for (const d of parsed.deals) {
        await tx
          .insert(schema.dealsTable)
          .values({
            id: `deal_${acctId}_${d.ticket}`,
            importId,
            accountId: acctId,
            accountNumber: acctNum,
            timeRaw: d.timeRaw,
            ticket: d.ticket,
            type: d.type,
            volume: d.volume,
            symbol: d.symbol,
            price: d.price,
            orderTicket: d.orderTicket,
            comment: d.comment,
            entry: d.entry,
            commission: d.commission,
            swap: d.swap,
            profit: d.profit,
          })
          .onConflictDoNothing();
      }

      await tx
        .insert(schema.accountSnapshots)
        .values({
          id: `snap_${acctId}_${parsed.header.reportTimestampRaw.replace(/\W+/g, '_')}`,
          importId,
          accountId: acctId,
          accountNumber: acctNum,
          reportTimestampRaw: parsed.header.reportTimestampRaw,
          reportDate: parsed.header.reportDate,
          currency: parsed.header.currency,
          previousLedgerBalance: parsed.summary.previousLedgerBalance,
          previousEquity: parsed.summary.previousEquity,
          balance: parsed.summary.balance,
          equity: parsed.summary.equity,
          floatingPL: parsed.summary.floatingPL,
          closedTradePL: parsed.summary.closedTradePL,
          depositsWithdrawals: parsed.summary.depositsWithdrawals,
          creditFacility: parsed.summary.creditFacility,
          roundCommission: parsed.summary.roundCommission,
          instantCommission: parsed.summary.instantCommission,
          additionalOperations: parsed.summary.additionalOperations,
          total: parsed.summary.total,
          marginRequirements: parsed.summary.marginRequirements,
          availableMargin: parsed.summary.availableMargin,
        })
        .onConflictDoNothing();
    });

    const finalStatus = parsed.validationStatus === 'partial' ? 'partial' : 'imported';
    const msg = `Đã lưu báo cáo ${parsed.header.reportTimestampRaw}: ${parsed.orders.length} Orders, ${parsed.deals.length} Deals.`;
    await recordSyncLog({
      source: meta.source,
      gmailMessageId: meta.gmailMessageId ?? null,
      sender: meta.sender ?? null,
      subject: meta.subject ?? null,
      emailDateHeader: meta.emailDateHeader ?? null,
      reportTimestampRaw: parsed.header.reportTimestampRaw,
      accountNumber: acctNum,
      ordersCount: parsed.orders.length,
      dealsCount: parsed.deals.length,
      status: finalStatus,
      message: msg,
    });
    return { status: finalStatus, message: msg, importId };
  }

  // Memory fallback
  if (
    (meta.gmailMessageId && mem.imports.some((im) => im.gmailMessageId === meta.gmailMessageId)) ||
    mem.imports.some((im) => im.accountId === acctId && im.checksum === parsed.checksum)
  ) {
    return {
      status: 'skipped_duplicate',
      message: `Báo cáo ngày ${parsed.header.reportTimestampRaw} đã tồn tại — bỏ qua để tránh trùng lặp.`,
    };
  }

  if (!mem.accounts.some((a) => a.id === acctId)) {
    mem.accounts.push({
      id: acctId,
      broker: 'Vantage Markets',
      label: `Vantage ${acctNum}`,
      accountNumber: acctNum,
      currency: parsed.header.currency,
      serverTimezone: 'Unknown',
      displayTimezone: 'Asia/Ho_Chi_Minh',
      createdAt: new Date().toISOString(),
    });
  }

  mem.imports.push({
    id: importId,
    accountId: acctId,
    accountNumber: acctNum,
    sourceType: parsed.sourceType,
    gmailMessageId: meta.gmailMessageId ?? null,
    emailDateHeader: meta.emailDateHeader ?? null,
    reportTimestampRaw: parsed.header.reportTimestampRaw,
    reportDate: parsed.header.reportDate,
    currency: parsed.header.currency,
    parserVersion: parsed.parserVersion,
    ordersCount: parsed.orders.length,
    dealsCount: parsed.deals.length,
    status: parsed.validationStatus,
    warnings: parsed.warnings,
    checksum: parsed.checksum,
    createdAt: new Date().toISOString(),
  });

  for (const o of parsed.orders) {
    if (!mem.orders.some((ex) => ex.accountId === acctId && ex.ticket === o.ticket)) {
      mem.orders.push({ ...o, accountId: acctId, accountNumber: acctNum, importId });
    }
  }

  for (const d of parsed.deals) {
    if (!mem.deals.some((ex) => ex.accountId === acctId && ex.ticket === d.ticket)) {
      mem.deals.push({ ...d, accountId: acctId, accountNumber: acctNum, importId });
    }
  }

  if (!mem.snapshots.some((s) => s.accountId === acctId && s.reportTimestampRaw === parsed.header.reportTimestampRaw)) {
    mem.snapshots.push({
      id: `snap_${acctId}_${parsed.header.reportTimestampRaw.replace(/\W+/g, '_')}`,
      accountId: acctId,
      accountNumber: acctNum,
      reportTimestampRaw: parsed.header.reportTimestampRaw,
      reportDate: parsed.header.reportDate,
      currency: parsed.header.currency,
      previousLedgerBalance: parsed.summary.previousLedgerBalance,
      previousEquity: parsed.summary.previousEquity,
      balance: parsed.summary.balance,
      equity: parsed.summary.equity,
      floatingPL: parsed.summary.floatingPL,
      closedTradePL: parsed.summary.closedTradePL,
      depositsWithdrawals: parsed.summary.depositsWithdrawals,
      creditFacility: parsed.summary.creditFacility,
      roundCommission: parsed.summary.roundCommission,
      instantCommission: parsed.summary.instantCommission,
      additionalOperations: parsed.summary.additionalOperations,
      total: parsed.summary.total,
      marginRequirements: parsed.summary.marginRequirements,
      availableMargin: parsed.summary.availableMargin,
    });
  }

  const finalStatus = parsed.validationStatus === 'partial' ? 'partial' : 'imported';
  const msg = `Đã lưu báo cáo ${parsed.header.reportTimestampRaw}: ${parsed.orders.length} Orders, ${parsed.deals.length} Deals.`;
  await recordSyncLog({
    source: meta.source,
    gmailMessageId: meta.gmailMessageId ?? null,
    sender: meta.sender ?? null,
    subject: meta.subject ?? null,
    emailDateHeader: meta.emailDateHeader ?? null,
    reportTimestampRaw: parsed.header.reportTimestampRaw,
    accountNumber: acctNum,
    ordersCount: parsed.orders.length,
    dealsCount: parsed.deals.length,
    status: finalStatus,
    message: msg,
  });
  return { status: finalStatus, message: msg, importId };
}

export async function recordSyncLog(entry: Omit<SyncLogRecord, 'id' | 'createdAt'>): Promise<void> {
  const id = `log_${crypto.randomUUID()}`;
  if (dbReady && db) {
    await db.insert(schema.syncLogs).values({
      id,
      ...entry,
    });
    return;
  }
  mem.syncLogs.push({
    id,
    ...entry,
    createdAt: new Date().toISOString(),
  });
}

export async function upsertJournalEntry(
  tradeId: string,
  input: Omit<JournalEntry, 'id' | 'tradeId' | 'updatedAt'>,
): Promise<JournalEntry> {
  const now = new Date();
  if (dbReady && db) {
    const existing = await db
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.tradeId, tradeId));
    if (existing.length > 0) {
      const id = existing[0].id;
      await db
        .update(schema.journalEntries)
        .set({ ...input, updatedAt: now })
        .where(eq(schema.journalEntries.id, id));
      return { id, tradeId, ...input, updatedAt: now.toISOString() };
    }
    const id = `jrn_${crypto.randomUUID()}`;
    await db.insert(schema.journalEntries).values({
      id,
      tradeId,
      ...input,
      updatedAt: now,
    });
    return { id, tradeId, ...input, updatedAt: now.toISOString() };
  }

  const existing = mem.journals.get(tradeId);
  const entry: JournalEntry = {
    id: existing?.id ?? `jrn_${crypto.randomUUID()}`,
    tradeId,
    ...input,
    updatedAt: now.toISOString(),
  };
  mem.journals.set(tradeId, entry);
  return entry;
}

export async function createPriceObservation(
  input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PriceObservation> {
  const id = `obs_${crypto.randomUUID()}`;
  const now = new Date();
  if (dbReady && db) {
    await db.insert(schema.priceObservations).values({
      id,
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    mem.observations.push({
      id,
      ...input,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  return {
    id,
    ...input,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function updatePriceObservation(
  id: string,
  input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PriceObservation | null> {
  const now = new Date();
  if (dbReady && db) {
    const rows = await db
      .select()
      .from(schema.priceObservations)
      .where(eq(schema.priceObservations.id, id));
    if (rows.length === 0) return null;
    await db
      .update(schema.priceObservations)
      .set({ ...input, updatedAt: now })
      .where(eq(schema.priceObservations.id, id));
    return {
      id,
      ...input,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: now.toISOString(),
    };
  }
  const idx = mem.observations.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  const updated: PriceObservation = {
    ...mem.observations[idx],
    ...input,
    updatedAt: now.toISOString(),
  };
  mem.observations[idx] = updated;
  return updated;
}

export async function deletePriceObservation(id: string): Promise<boolean> {
  if (dbReady && db) {
    const rows = await db
      .delete(schema.priceObservations)
      .where(eq(schema.priceObservations.id, id))
      .returning();
    return rows.length > 0;
  }
  const before = mem.observations.length;
  mem.observations = mem.observations.filter((o) => o.id !== id);
  return mem.observations.length < before;
}

export async function resolveReviewItem(
  reviewItemId: string,
  status: 'resolved' | 'dismissed',
  resolutionNote: string,
  dealTicket: string | null,
  tradeId: string | null,
): Promise<void> {
  const now = new Date();
  if (dbReady && db) {
    const existing = await db
      .select()
      .from(schema.reviewOverrides)
      .where(eq(schema.reviewOverrides.reviewItemId, reviewItemId));
    if (existing.length > 0) {
      await db
        .update(schema.reviewOverrides)
        .set({ status, resolutionNote, dealTicket, tradeId, resolvedAt: now })
        .where(eq(schema.reviewOverrides.id, existing[0].id));
    } else {
      await db.insert(schema.reviewOverrides).values({
        id: `ov_${crypto.randomUUID()}`,
        reviewItemId,
        dealTicket,
        tradeId,
        status,
        resolutionNote,
        resolvedAt: now,
      });
    }
    return;
  }
  mem.reviewOverrides.set(reviewItemId, {
    status,
    note: resolutionNote,
    dealTicket,
    tradeId,
    resolvedAt: now.toISOString(),
  });
}

export async function updateTradingAccount(
  accountId: string,
  updates: { label: string; serverTimezone: string; displayTimezone: string },
): Promise<void> {
  if (dbReady && db) {
    await db
      .update(schema.tradingAccounts)
      .set(updates)
      .where(eq(schema.tradingAccounts.id, accountId));
    return;
  }
  const acct = mem.accounts.find((a) => a.id === accountId);
  if (acct) {
    acct.label = updates.label;
    acct.serverTimezone = updates.serverTimezone;
    acct.displayTimezone = updates.displayTimezone;
  }
}
