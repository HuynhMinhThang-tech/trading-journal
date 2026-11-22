import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Cột BYTEA (nội dung ảnh): node-postgres trả về / nhận Buffer.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const tradingAccounts = pgTable(
  'trading_accounts',
  {
    id: text('id').primaryKey(),
    broker: text('broker').notNull().default('Vantage Markets'),
    label: text('label').notNull(),
    accountNumber: text('account_number').notNull(),
    currency: text('currency').notNull().default('USD'),
    serverTimezone: text('server_timezone').notNull().default('Unknown'),
    displayTimezone: text('display_timezone').notNull().default('Asia/Ho_Chi_Minh'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idx_accounts_number').on(t.accountNumber)],
);

export const statementImports = pgTable(
  'statement_imports',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => tradingAccounts.id),
    accountNumber: text('account_number').notNull(),
    sourceType: text('source_type').notNull(),
    gmailMessageId: text('gmail_message_id'),
    emailDateHeader: text('email_date_header'),
    reportTimestampRaw: text('report_timestamp_raw').notNull(),
    reportDate: text('report_date').notNull(),
    currency: text('currency').notNull(),
    parserVersion: text('parser_version').notNull(),
    ordersCount: integer('orders_count').notNull().default(0),
    dealsCount: integer('deals_count').notNull().default(0),
    status: text('status').notNull(),
    warnings: jsonb('warnings').notNull().default([]),
    checksum: text('checksum').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('idx_imports_gmail_msg').on(t.gmailMessageId),
    uniqueIndex('idx_imports_checksum').on(t.accountId, t.checksum),
  ],
);

export const ordersTable = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    importId: text('import_id')
      .notNull()
      .references(() => statementImports.id),
    accountId: text('account_id')
      .notNull()
      .references(() => tradingAccounts.id),
    accountNumber: text('account_number').notNull(),
    openTimeRaw: text('open_time_raw').notNull(),
    ticket: text('ticket').notNull(),
    type: text('type').notNull(),
    sizeRaw: text('size_raw').notNull(),
    sizeRequested: numeric('size_requested', { precision: 24, scale: 10 }),
    sizeFilled: numeric('size_filled', { precision: 24, scale: 10 }),
    symbol: text('symbol').notNull(),
    priceRaw: text('price_raw').notNull(),
    stopLoss: numeric('stop_loss', { precision: 24, scale: 10 }),
    takeProfit: numeric('take_profit', { precision: 24, scale: 10 }),
    executionTimeRaw: text('execution_time_raw').notNull(),
    state: text('state').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idx_orders_account_ticket').on(t.accountId, t.ticket)],
);

export const dealsTable = pgTable(
  'deals',
  {
    id: text('id').primaryKey(),
    importId: text('import_id')
      .notNull()
      .references(() => statementImports.id),
    accountId: text('account_id')
      .notNull()
      .references(() => tradingAccounts.id),
    accountNumber: text('account_number').notNull(),
    timeRaw: text('time_raw').notNull(),
    ticket: text('ticket').notNull(),
    type: text('type').notNull(),
    volume: numeric('volume', { precision: 24, scale: 10 }).notNull(),
    symbol: text('symbol').notNull(),
    price: numeric('price', { precision: 24, scale: 10 }).notNull(),
    orderTicket: text('order_ticket').notNull(),
    comment: text('comment').notNull().default(''),
    entry: text('entry').notNull(),
    commission: numeric('commission', { precision: 20, scale: 8 }).notNull().default('0'),
    swap: numeric('swap', { precision: 20, scale: 8 }).notNull().default('0'),
    profit: numeric('profit', { precision: 20, scale: 8 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idx_deals_account_ticket').on(t.accountId, t.ticket)],
);

export const accountSnapshots = pgTable(
  'account_snapshots',
  {
    id: text('id').primaryKey(),
    importId: text('import_id')
      .notNull()
      .references(() => statementImports.id),
    accountId: text('account_id')
      .notNull()
      .references(() => tradingAccounts.id),
    accountNumber: text('account_number').notNull(),
    reportTimestampRaw: text('report_timestamp_raw').notNull(),
    reportDate: text('report_date').notNull(),
    currency: text('currency').notNull(),
    previousLedgerBalance: numeric('previous_ledger_balance', { precision: 20, scale: 8 }).notNull(),
    previousEquity: numeric('previous_equity', { precision: 20, scale: 8 }).notNull(),
    balance: numeric('balance', { precision: 20, scale: 8 }).notNull(),
    equity: numeric('equity', { precision: 20, scale: 8 }).notNull(),
    floatingPL: numeric('floating_pl', { precision: 20, scale: 8 }).notNull(),
    closedTradePL: numeric('closed_trade_pl', { precision: 20, scale: 8 }).notNull(),
    depositsWithdrawals: numeric('deposits_withdrawals', { precision: 20, scale: 8 }).notNull(),
    creditFacility: numeric('credit_facility', { precision: 20, scale: 8 }).notNull(),
    roundCommission: numeric('round_commission', { precision: 20, scale: 8 }).notNull(),
    instantCommission: numeric('instant_commission', { precision: 20, scale: 8 }).notNull(),
    additionalOperations: numeric('additional_operations', { precision: 20, scale: 8 }).notNull(),
    total: numeric('total', { precision: 20, scale: 8 }).notNull(),
    marginRequirements: numeric('margin_requirements', { precision: 20, scale: 8 }).notNull(),
    availableMargin: numeric('available_margin', { precision: 20, scale: 8 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('idx_snapshots_account_ts').on(t.accountId, t.reportTimestampRaw)],
);

export const journalEntries = pgTable('journal_entries', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').notNull(),
  strategy: text('strategy').notNull().default(''),
  marketCondition: text('market_condition').notNull().default(''),
  thesis: text('thesis').notNull().default(''),
  plannedEntry: text('planned_entry').notNull().default(''),
  plannedSL: text('planned_sl').notNull().default(''),
  plannedTP: text('planned_tp').notNull().default(''),
  exitReason: text('exit_reason').notNull().default(''),
  emotionBefore: text('emotion_before').notNull().default(''),
  emotionDuring: text('emotion_during').notNull().default(''),
  emotionAfter: text('emotion_after').notNull().default(''),
  ruleAdherence: text('rule_adherence').notNull().default('tuan_thu'),
  mistakeTags: jsonb('mistake_tags').notNull().default([]),
  lessonLearned: text('lesson_learned').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const priceObservations = pgTable('price_observations', {
  id: text('id').primaryKey(),
  symbol: text('symbol').notNull(),
  observedDate: text('observed_date').notNull(),
  observedTime: text('observed_time').notNull(),
  timeframe: text('timeframe').notNull(),
  session: text('session').notNull(),
  priceAction: text('price_action').notNull(),
  candlePattern: text('candle_pattern').notNull(),
  marketContext: text('market_context').notNull().default(''),
  confidence: integer('confidence').notNull().default(3),
  habitTag: text('habit_tag').notNull().default(''),
  outcomeNote: text('outcome_note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reviewOverrides = pgTable('review_overrides', {
  id: text('id').primaryKey(),
  reviewItemId: text('review_item_id').notNull(),
  dealTicket: text('deal_ticket'),
  tradeId: text('trade_id'),
  status: text('status').notNull(),
  resolutionNote: text('resolution_note').notNull().default(''),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).defaultNow().notNull(),
});

export const syncLogs = pgTable('sync_logs', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  gmailMessageId: text('gmail_message_id'),
  sender: text('sender'),
  subject: text('subject'),
  emailDateHeader: text('email_date_header'),
  reportTimestampRaw: text('report_timestamp_raw'),
  accountNumber: text('account_number'),
  ordersCount: integer('orders_count').notNull().default(0),
  dealsCount: integer('deals_count').notNull().default(0),
  status: text('status').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Ảnh đính kèm cho lệnh (owner_type = 'trade') và quan sát giá (owner_type = 'observation').
export const imageAttachments = pgTable(
  'image_attachments',
  {
    id: text('id').primaryKey(),
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_image_attachments_owner').on(t.ownerType, t.ownerId)],
);
