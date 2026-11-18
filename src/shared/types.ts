export type ThemeMode = 'light' | 'dark';

export interface StatementHeader {
  accountNumber: string;
  accountName: string;
  currency: string;
  reportTimestampRaw: string;
  reportDate: string; // YYYY-MM-DD
}

export interface OrderRecord {
  openTimeRaw: string;
  ticket: string;
  type: string;
  sizeRaw: string;
  sizeRequested: string | null;
  sizeFilled: string | null;
  symbol: string;
  priceRaw: string;
  stopLoss: string | null; // null if 0.00 or unset
  takeProfit: string | null; // null if 0.00 or unset
  executionTimeRaw: string;
  state: string;
  comment: string;
}

export type DealEntryType = 'in' | 'out' | 'inout' | 'out_by';

export interface DealRecord {
  timeRaw: string;
  ticket: string;
  type: 'buy' | 'sell' | string;
  volume: string;
  symbol: string;
  price: string;
  orderTicket: string;
  comment: string;
  entry: DealEntryType;
  commission: string;
  swap: string;
  profit: string;
}

export interface PositionSnapshotRecord {
  openTimeRaw: string;
  ticket: string;
  type: string;
  size: string;
  symbol: string;
  price: string;
  stopLoss: string | null;
  takeProfit: string | null;
  marketPrice: string;
  swap: string;
  profit: string;
}

export interface WorkingOrderRecord {
  openTimeRaw: string;
  ticket: string;
  type: string;
  sizeRaw: string;
  symbol: string;
  price: string;
  stopLoss: string | null;
  takeProfit: string | null;
  marketPrice: string;
  comment: string;
}

export interface AccountSummary {
  closedTradePL: string;
  depositsWithdrawals: string;
  creditFacility: string;
  roundCommission: string;
  instantCommission: string;
  additionalOperations: string;
  total: string;
  previousLedgerBalance: string;
  previousEquity: string;
  balance: string;
  equity: string;
  floatingPL: string;
  marginRequirements: string;
  availableMargin: string;
}

export interface ParseWarning {
  code: string;
  message: string;
  section: string;
  detail?: string;
}

export interface ParsedStatement {
  parserVersion: string;
  sourceType: 'text' | 'html' | 'eml' | 'gmail';
  header: StatementHeader;
  orders: OrderRecord[];
  deals: DealRecord[];
  positions: PositionSnapshotRecord[];
  workingOrders: WorkingOrderRecord[];
  summary: AccountSummary;
  validationStatus: 'valid' | 'partial' | 'invalid';
  warnings: ParseWarning[];
  checksum: string;
}

export type TradeMatchingStatus = 'matched' | 'partial' | 'unmatched' | 'ambiguous';
export type TradeMatchingMethod = 'fifo-inferred' | 'manual-override';

export interface TradeDealAllocation {
  dealTicket: string;
  role: 'entry' | 'exit';
  allocatedVolume: string;
  allocatedProfit: string;
  allocatedCommission: string;
  allocatedSwap: string;
  timeRaw: string;
  price: string;
  type: string;
  orderTicket: string;
  comment: string;
}

export type RuleAdherence = 'tuan_thu' | 'vi_pham_nhe' | 'vi_pham';

export interface JournalEntry {
  id: string;
  tradeId: string;
  strategy: string;
  marketCondition: string;
  thesis: string;
  plannedEntry: string;
  plannedSL: string;
  plannedTP: string;
  exitReason: string;
  emotionBefore: string;
  emotionDuring: string;
  emotionAfter: string;
  ruleAdherence: RuleAdherence;
  mistakeTags: string[];
  lessonLearned: string;
  updatedAt: string;
}

export interface TradeRecord {
  id: string;
  accountId: string;
  accountNumber: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  openTimeRaw: string;
  closeTimeRaw: string | null;
  volume: string;
  entryPrice: string;
  exitPrice: string | null;
  grossPL: string;
  commission: string;
  swap: string;
  netPL: string;
  holdingMinutes: number | null;
  matchingStatus: TradeMatchingStatus;
  matchingMethod: TradeMatchingMethod;
  matchingVersion: string;
  allocations: TradeDealAllocation[];
  journal: JournalEntry | null;
}

export interface AccountSnapshotRecord {
  id: string;
  accountId: string;
  accountNumber: string;
  reportTimestampRaw: string;
  reportDate: string;
  currency: string;
  previousLedgerBalance: string;
  previousEquity: string;
  balance: string;
  equity: string;
  floatingPL: string;
  closedTradePL: string;
  depositsWithdrawals: string;
  creditFacility: string;
  roundCommission: string;
  instantCommission: string;
  additionalOperations: string;
  total: string;
  marginRequirements: string;
  availableMargin: string;
}

export interface TradingAccountRecord {
  id: string;
  broker: string;
  label: string;
  accountNumber: string;
  currency: string;
  serverTimezone: string; // 'Unknown' | 'UTC+0' | 'UTC+2' | 'UTC+3' | 'UTC+7'
  displayTimezone: string; // 'Asia/Ho_Chi_Minh'
  createdAt: string;
}

export type TradingSessionName = 'Á' | 'Âu' | 'Mỹ' | 'Giao phiên Âu-Mỹ';
export type ObservationTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface PriceObservation {
  id: string;
  symbol: string;
  observedDate: string; // YYYY-MM-DD
  observedTime: string; // HH:mm
  timeframe: ObservationTimeframe;
  session: TradingSessionName;
  priceAction: string;
  candlePattern: string;
  marketContext: string;
  confidence: number; // 1..5
  habitTag: string;
  outcomeNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewItem {
  id: string;
  type: 'ambiguous_match' | 'unmatched_deal' | 'summary_mismatch' | 'parse_warning';
  status: 'pending' | 'resolved' | 'dismissed';
  symbol: string;
  dealTicket: string | null;
  tradeId: string | null;
  title: string;
  description: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SyncLogRecord {
  id: string;
  source: 'gmail' | 'eml' | 'paste';
  gmailMessageId: string | null;
  sender: string | null;
  subject: string | null;
  emailDateHeader: string | null;
  reportTimestampRaw: string | null;
  accountNumber: string | null;
  ordersCount: number;
  dealsCount: number;
  status: 'imported' | 'partial' | 'skipped_duplicate' | 'no_new_email' | 'rejected' | 'failed';
  message: string;
  createdAt: string;
}

export interface StatementImportRecord {
  id: string;
  accountId: string;
  accountNumber: string;
  sourceType: 'text' | 'html' | 'eml' | 'gmail';
  gmailMessageId: string | null;
  emailDateHeader: string | null;
  reportTimestampRaw: string;
  reportDate: string;
  currency: string;
  parserVersion: string;
  ordersCount: number;
  dealsCount: number;
  status: 'valid' | 'partial' | 'invalid';
  warnings: ParseWarning[];
  checksum: string;
  createdAt: string;
}

export interface MetricsSummary {
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openOrPartialTrades: number;
  ambiguousTrades: number;
  unmatchedDeals: number;
  netPL: string;
  grossProfit: string;
  grossLoss: string;
  totalCommission: string;
  totalSwap: string;
  winRate: number | null;
  profitFactor: number | null;
  profitFactorInfinite: boolean;
  expectancy: string | null;
  averageWin: string | null;
  averageLoss: string | null;
  avgHoldingMinutes: number | null;
  avgWinHoldingMinutes: number | null;
  avgLossHoldingMinutes: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  maxObservedDailyDrawdown: string;
  maxObservedDailyDrawdownPct: number | null;
  rMultipleStatus: string;
  maeMfeStatus: string;
  sessionAnalysisAvailable: boolean;
  sessionWarning: string | null;
  bySymbol: Array<{
    symbol: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPL: string;
  }>;
  bySide: Array<{
    side: 'BUY' | 'SELL';
    trades: number;
    wins: number;
    winRate: number;
    netPL: string;
  }>;
  byDay: Array<{
    date: string;
    trades: number;
    wins: number;
    netPL: string;
  }>;
  byWeek: Array<{
    week: string;
    trades: number;
    wins: number;
    winRate: number;
    netPL: string;
  }>;
  byMonth: Array<{
    month: string;
    trades: number;
    wins: number;
    winRate: number;
    netPL: string;
  }>;
  bySession: Array<{
    session: string;
    trades: number;
    wins: number;
    winRate: number;
    netPL: string;
  }>;
  byStrategy: Array<{
    strategy: string;
    trades: number;
    wins: number;
    winRate: number;
    netPL: string;
  }>;
  byMistakeTag: Array<{
    tag: string;
    trades: number;
    netPL: string;
  }>;
  winLossDistribution: Array<{
    bucket: string;
    count: number;
    isWin: boolean;
  }>;
  holdingTimeBuckets: Array<{
    bucket: string;
    trades: number;
    wins: number;
    winRate: number;
    netPL: string;
  }>;
  equityCurve: Array<{
    date: string;
    reportTimestampRaw: string;
    balance: number;
    equity: number;
    closedTradePL: number;
  }>;
}

export interface WorkspaceDataset {
  dbConnected: boolean;
  accounts: TradingAccountRecord[];
  imports: StatementImportRecord[];
  orders: Array<OrderRecord & { accountNumber: string; importId: string }>;
  deals: Array<DealRecord & { accountNumber: string; importId: string }>;
  trades: TradeRecord[];
  snapshots: AccountSnapshotRecord[];
  observations: PriceObservation[];
  reviewItems: ReviewItem[];
  syncLogs: SyncLogRecord[];
}
