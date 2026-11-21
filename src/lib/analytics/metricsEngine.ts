import Decimal from 'decimal.js';
import type {
  AccountSnapshotRecord,
  MetricsSummary,
  TradeRecord,
  TradingAccountRecord,
} from '../../shared/types.ts';
import { brokerRawToVietnamRaw, serverUtcOffsetHours, vietnamHourFromBrokerRaw } from '../timezone.ts';

function extractTradeDate(tsRaw: string): string {
  const m = tsRaw.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : tsRaw.slice(0, 10);
}

function getIsoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Giờ (0-23) theo giờ Việt Nam của mốc giờ máy chủ sàn, quy đổi theo cài đặt múi giờ của tài khoản
// (mặc định tự nhận UTC+2/UTC+3 của MetaTrader; xem src/lib/timezone.ts).
function resolveVnSessionFromRaw(
  tsRaw: string,
  serverTz: string,
): { session: string; available: boolean } {
  const vnHour = vietnamHourFromBrokerRaw(tsRaw, serverTz);
  if (vnHour === null) return { session: 'Không rõ giờ', available: false };
  if (vnHour >= 6 && vnHour < 14) return { session: 'Phiên Á (06:00–14:00)', available: true };
  if (vnHour >= 14 && vnHour < 19) return { session: 'Phiên Âu (14:00–19:00)', available: true };
  if (vnHour >= 19 || vnHour < 3) return { session: 'Phiên Mỹ (19:00–03:00)', available: true };
  return { session: 'Ngoài phiên chính (03:00–06:00)', available: true };
}

function getHoldingBucket(minutes: number | null): string {
  if (minutes === null) return 'Không rõ';
  if (minutes < 15) return '< 15 phút (Scalp)';
  if (minutes < 60) return '15 – 60 phút';
  if (minutes < 240) return '1 – 4 giờ';
  return '> 4 giờ (Swing)';
}

/**
 * Tính toán toàn bộ chỉ số hiệu suất bằng Decimal (không dùng float JavaScript).
 * Chỉ tính Win Rate, Profit Factor, Expectancy trên các Trade đã ghép hoàn chỉnh (matched/manual).
 * Dùng chung ở cả Backend API và Client Filtering để số liệu không bao giờ lệch giữa các màn hình.
 */
export function calculateMetrics(
  trades: TradeRecord[],
  snapshots: AccountSnapshotRecord[],
  unmatchedDealsCount = 0,
  accounts: TradingAccountRecord[] = [],
): MetricsSummary {
  const resolvedClosed = trades.filter(
    (t) =>
      t.closeTimeRaw !== null &&
      (t.matchingStatus === 'matched' || t.matchingMethod === 'manual-override'),
  );
  const openOrPartialTrades = trades.filter(
    (t) => t.closeTimeRaw === null || t.matchingStatus === 'partial',
  ).length;
  const ambiguousTrades = trades.filter((t) => t.matchingStatus === 'ambiguous').length;

  const accountTzById = new Map(accounts.map((a) => [a.id, a.serverTimezone]));
  const hasKnownServerTz = accounts.some((a) => serverUtcOffsetHours(a.serverTimezone, 0) !== null);

  let netPL = new Decimal(0);
  let grossProfit = new Decimal(0);
  let grossLoss = new Decimal(0);
  let totalCommission = new Decimal(0);
  let totalSwap = new Decimal(0);

  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;

  let totalWinAmount = new Decimal(0);
  let totalLossAmount = new Decimal(0);
  let totalHolding = 0;
  let holdingCount = 0;
  let winHoldingSum = 0;
  let winHoldingCount = 0;
  let lossHoldingSum = 0;
  let lossHoldingCount = 0;

  const chrono = [...resolvedClosed].sort((a, b) =>
    (a.closeTimeRaw ?? a.openTimeRaw).localeCompare(b.closeTimeRaw ?? b.openTimeRaw),
  );

  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  const bySymbolMap = new Map<
    string,
    { trades: number; wins: number; losses: number; netPL: Decimal }
  >();
  const bySideMap = new Map<'BUY' | 'SELL', { trades: number; wins: number; netPL: Decimal }>([
    ['BUY', { trades: 0, wins: 0, netPL: new Decimal(0) }],
    ['SELL', { trades: 0, wins: 0, netPL: new Decimal(0) }],
  ]);
  const byDayMap = new Map<string, { trades: number; wins: number; netPL: Decimal }>();
  const byWeekMap = new Map<string, { trades: number; wins: number; netPL: Decimal }>();
  const byMonthMap = new Map<string, { trades: number; wins: number; netPL: Decimal }>();
  const bySessionMap = new Map<string, { trades: number; wins: number; netPL: Decimal }>();
  const byStrategyMap = new Map<string, { trades: number; wins: number; netPL: Decimal }>();
  const byMistakeMap = new Map<string, { trades: number; netPL: Decimal }>();
  const holdingBucketMap = new Map<string, { trades: number; wins: number; netPL: Decimal }>();

  const distBuckets: Array<{ label: string; min: number; max: number; isWin: boolean }> = [
    { label: '< -$20', min: -Infinity, max: -20, isWin: false },
    { label: '-$20 .. -$5', min: -20, max: -5, isWin: false },
    { label: '-$5 .. $0', min: -5, max: 0, isWin: false },
    { label: '$0 .. +$5', min: 0, max: 5, isWin: true },
    { label: '+$5 .. +$20', min: 5, max: 20, isWin: true },
    { label: '> +$20', min: 20, max: Infinity, isWin: true },
  ];
  const distCounts = distBuckets.map((b) => ({ bucket: b.label, count: 0, isWin: b.isWin }));

  for (const t of chrono) {
    const net = new Decimal(t.netPL);
    const comm = new Decimal(t.commission);
    const swp = new Decimal(t.swap);
    const netFloat = net.toNumber();

    netPL = netPL.plus(net);
    totalCommission = totalCommission.plus(comm);
    totalSwap = totalSwap.plus(swp);

    if (net.gt(0)) {
      winningTrades++;
      grossProfit = grossProfit.plus(net);
      totalWinAmount = totalWinAmount.plus(net);
      curWinStreak++;
      curLossStreak = 0;
      if (curWinStreak > maxConsecutiveWins) maxConsecutiveWins = curWinStreak;
      if (t.holdingMinutes !== null) {
        winHoldingSum += t.holdingMinutes;
        winHoldingCount++;
      }
    } else if (net.lt(0)) {
      losingTrades++;
      const absLoss = net.abs();
      grossLoss = grossLoss.plus(absLoss);
      totalLossAmount = totalLossAmount.plus(absLoss);
      curLossStreak++;
      curWinStreak = 0;
      if (curLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = curLossStreak;
      if (t.holdingMinutes !== null) {
        lossHoldingSum += t.holdingMinutes;
        lossHoldingCount++;
      }
    } else {
      breakevenTrades++;
      curWinStreak = 0;
      curLossStreak = 0;
    }

    if (t.holdingMinutes !== null) {
      totalHolding += t.holdingMinutes;
      holdingCount++;
    }

    // Distribution bucket
    for (let idx = 0; idx < distBuckets.length; idx++) {
      const b = distBuckets[idx];
      if (netFloat === 0 && b.label === '$0 .. +$5') {
        distCounts[idx].count++;
        break;
      }
      if (netFloat > b.min && netFloat <= b.max) {
        distCounts[idx].count++;
        break;
      }
      if (b.min === -Infinity && netFloat <= b.max) {
        distCounts[idx].count++;
        break;
      }
    }

    // Symbol breakdown
    const symEntry = bySymbolMap.get(t.symbol) ?? {
      trades: 0,
      wins: 0,
      losses: 0,
      netPL: new Decimal(0),
    };
    symEntry.trades++;
    if (net.gt(0)) symEntry.wins++;
    if (net.lt(0)) symEntry.losses++;
    symEntry.netPL = symEntry.netPL.plus(net);
    bySymbolMap.set(t.symbol, symEntry);

    // Side breakdown
    const sideEntry = bySideMap.get(t.side)!;
    sideEntry.trades++;
    if (net.gt(0)) sideEntry.wins++;
    sideEntry.netPL = sideEntry.netPL.plus(net);

    // Day / Week / Month breakdowns
    // Ngày được tính theo giờ Việt Nam (quy đổi từ giờ máy chủ sàn của tài khoản).
    const dayTz = accountTzById.get(t.accountId);
    const dayKey = extractTradeDate(brokerRawToVietnamRaw(t.closeTimeRaw ?? t.openTimeRaw, dayTz));
    const dayEntry = byDayMap.get(dayKey) ?? { trades: 0, wins: 0, netPL: new Decimal(0) };
    dayEntry.trades++;
    if (net.gt(0)) dayEntry.wins++;
    dayEntry.netPL = dayEntry.netPL.plus(net);
    byDayMap.set(dayKey, dayEntry);

    const weekKey = getIsoWeekKey(dayKey);
    const weekEntry = byWeekMap.get(weekKey) ?? { trades: 0, wins: 0, netPL: new Decimal(0) };
    weekEntry.trades++;
    if (net.gt(0)) weekEntry.wins++;
    weekEntry.netPL = weekEntry.netPL.plus(net);
    byWeekMap.set(weekKey, weekEntry);

    const monthKey = dayKey.slice(0, 7);
    const monthEntry = byMonthMap.get(monthKey) ?? { trades: 0, wins: 0, netPL: new Decimal(0) };
    monthEntry.trades++;
    if (net.gt(0)) monthEntry.wins++;
    monthEntry.netPL = monthEntry.netPL.plus(net);
    byMonthMap.set(monthKey, monthEntry);

    // Session breakdown (only when serverTimezone is known)
    const serverTz = dayTz ?? 'Unknown';
    const sess = resolveVnSessionFromRaw(t.openTimeRaw, serverTz);
    if (sess.available) {
      const sEntry = bySessionMap.get(sess.session) ?? { trades: 0, wins: 0, netPL: new Decimal(0) };
      sEntry.trades++;
      if (net.gt(0)) sEntry.wins++;
      sEntry.netPL = sEntry.netPL.plus(net);
      bySessionMap.set(sess.session, sEntry);
    }

    // Strategy breakdown
    const stratName = t.journal?.strategy?.trim() || 'Chưa gắn chiến lược';
    const stratEntry = byStrategyMap.get(stratName) ?? {
      trades: 0,
      wins: 0,
      netPL: new Decimal(0),
    };
    stratEntry.trades++;
    if (net.gt(0)) stratEntry.wins++;
    stratEntry.netPL = stratEntry.netPL.plus(net);
    byStrategyMap.set(stratName, stratEntry);

    // Mistake tags breakdown
    for (const tag of t.journal?.mistakeTags ?? []) {
      const cleanTag = tag.trim();
      if (!cleanTag) continue;
      const mEntry = byMistakeMap.get(cleanTag) ?? { trades: 0, netPL: new Decimal(0) };
      mEntry.trades++;
      mEntry.netPL = mEntry.netPL.plus(net);
      byMistakeMap.set(cleanTag, mEntry);
    }

    // Holding time bucket
    const hb = getHoldingBucket(t.holdingMinutes);
    const hEntry = holdingBucketMap.get(hb) ?? { trades: 0, wins: 0, netPL: new Decimal(0) };
    hEntry.trades++;
    if (net.gt(0)) hEntry.wins++;
    hEntry.netPL = hEntry.netPL.plus(net);
    holdingBucketMap.set(hb, hEntry);
  }

  const closedTrades = resolvedClosed.length;
  const winRate = closedTrades > 0 ? Number(((winningTrades / closedTrades) * 100).toFixed(2)) : null;

  let profitFactor: number | null = null;
  let profitFactorInfinite = false;
  if (closedTrades > 0) {
    if (grossLoss.gt(0)) {
      profitFactor = Number(grossProfit.div(grossLoss).toFixed(2));
    } else if (grossProfit.gt(0)) {
      profitFactorInfinite = true;
    }
  }

  const expectancy = closedTrades > 0 ? netPL.div(closedTrades).toFixed(2) : null;
  const averageWin = winningTrades > 0 ? totalWinAmount.div(winningTrades).toFixed(2) : null;
  const averageLoss = losingTrades > 0 ? totalLossAmount.div(losingTrades).toFixed(2) : null;
  const avgHoldingMinutes = holdingCount > 0 ? Math.round(totalHolding / holdingCount) : null;
  const avgWinHoldingMinutes = winHoldingCount > 0 ? Math.round(winHoldingSum / winHoldingCount) : null;
  const avgLossHoldingMinutes = lossHoldingCount > 0 ? Math.round(lossHoldingSum / lossHoldingCount) : null;

  // Equity curve & Observed Daily Drawdown from snapshots
  const sortedSnapshots = [...snapshots].sort((a, b) =>
    a.reportTimestampRaw.localeCompare(b.reportTimestampRaw),
  );
  let peakEquity = new Decimal(0);
  let maxObservedDailyDD = new Decimal(0);
  let maxObservedDailyDDPct: number | null = null;

  const equityCurve: MetricsSummary['equityCurve'] = [];
  if (sortedSnapshots.length > 0) {
    const first = sortedSnapshots[0];
    const prevBal = new Decimal(first.previousLedgerBalance || '0');
    const prevEq = new Decimal(first.previousEquity || first.previousLedgerBalance || '0');
    if (prevEq.gt(peakEquity)) peakEquity = prevEq;
    if (sortedSnapshots.length === 1 || prevBal.gt(0)) {
      equityCurve.push({
        date: sortedSnapshots.length === 1 ? 'Số dư trước đó' : 'Đầu kỳ',
        reportTimestampRaw: first.reportTimestampRaw,
        balance: Number(prevBal.toFixed(2)),
        equity: Number(prevEq.toFixed(2)),
        closedTradePL: 0,
      });
    }
  }

  for (let i = 0; i < sortedSnapshots.length; i++) {
    const s = sortedSnapshots[i];
    const eq = new Decimal(s.equity || s.balance || '0');
    const bal = new Decimal(s.balance || '0');
    if (eq.gt(peakEquity)) peakEquity = eq;
    const dd = peakEquity.sub(eq);
    if (dd.gt(maxObservedDailyDD)) {
      maxObservedDailyDD = dd;
      if (peakEquity.gt(0)) {
        maxObservedDailyDDPct = Number(dd.div(peakEquity).mul(100).toFixed(2));
      }
    }
    equityCurve.push({
      date: sortedSnapshots.length === 1 ? 'Cuối kỳ sao kê' : s.reportDate,
      reportTimestampRaw: s.reportTimestampRaw,
      balance: Number(bal.toFixed(2)),
      equity: Number(eq.toFixed(2)),
      closedTradePL: Number(new Decimal(s.closedTradePL || '0').toFixed(2)),
    });
  }

  const toRows = (map: Map<string, { trades: number; wins: number; netPL: Decimal }>) =>
    Array.from(map.entries()).map(([k, d]) => ({
      key: k,
      trades: d.trades,
      wins: d.wins,
      winRate: d.trades > 0 ? Number(((d.wins / d.trades) * 100).toFixed(1)) : 0,
      netPL: d.netPL.toFixed(2),
    }));

  const bySymbol = Array.from(bySymbolMap.entries())
    .map(([symbol, data]) => ({
      symbol,
      trades: data.trades,
      wins: data.wins,
      losses: data.losses,
      winRate: data.trades > 0 ? Number(((data.wins / data.trades) * 100).toFixed(1)) : 0,
      netPL: data.netPL.toFixed(2),
    }))
    .sort((a, b) => Number(b.netPL) - Number(a.netPL));

  const bySide = Array.from(bySideMap.entries()).map(([side, data]) => ({
    side,
    trades: data.trades,
    wins: data.wins,
    winRate: data.trades > 0 ? Number(((data.wins / data.trades) * 100).toFixed(1)) : 0,
    netPL: data.netPL.toFixed(2),
  }));

  const byDay = Array.from(byDayMap.entries())
    .map(([date, data]) => ({
      date,
      trades: data.trades,
      wins: data.wins,
      netPL: data.netPL.toFixed(2),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byWeek = toRows(byWeekMap)
    .map((r) => ({ week: r.key, trades: r.trades, wins: r.wins, winRate: r.winRate, netPL: r.netPL }))
    .sort((a, b) => a.week.localeCompare(b.week));

  const byMonth = toRows(byMonthMap)
    .map((r) => ({ month: r.key, trades: r.trades, wins: r.wins, winRate: r.winRate, netPL: r.netPL }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const bySession = toRows(bySessionMap).map((r) => ({
    session: r.key,
    trades: r.trades,
    wins: r.wins,
    winRate: r.winRate,
    netPL: r.netPL,
  }));

  const byStrategy = toRows(byStrategyMap)
    .map((r) => ({ strategy: r.key, trades: r.trades, wins: r.wins, winRate: r.winRate, netPL: r.netPL }))
    .sort((a, b) => Number(b.netPL) - Number(a.netPL));

  const byMistakeTag = Array.from(byMistakeMap.entries())
    .map(([tag, d]) => ({ tag, trades: d.trades, netPL: d.netPL.toFixed(2) }))
    .sort((a, b) => Number(a.netPL) - Number(b.netPL));

  const holdingTimeBuckets = toRows(holdingBucketMap).map((r) => ({
    bucket: r.key,
    trades: r.trades,
    wins: r.wins,
    winRate: r.winRate,
    netPL: r.netPL,
  }));

  return {
    closedTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    openOrPartialTrades,
    ambiguousTrades,
    unmatchedDeals: unmatchedDealsCount,
    netPL: netPL.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    grossLoss: grossLoss.toFixed(2),
    totalCommission: totalCommission.toFixed(2),
    totalSwap: totalSwap.toFixed(2),
    winRate,
    profitFactor,
    profitFactorInfinite,
    expectancy,
    averageWin,
    averageLoss,
    avgHoldingMinutes,
    avgWinHoldingMinutes,
    avgLossHoldingMinutes,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    maxObservedDailyDrawdown: maxObservedDailyDD.toFixed(2),
    maxObservedDailyDrawdownPct: maxObservedDailyDDPct,
    rMultipleStatus: 'Chưa đủ dữ liệu (thiếu S/L ban đầu hoặc quy chuẩn hợp đồng)',
    maeMfeStatus: 'Chưa đủ dữ liệu (email cuối ngày không có dữ liệu giá theo phút)',
    sessionAnalysisAvailable: hasKnownServerTz,
    sessionWarning: hasKnownServerTz
      ? null
      : 'Chưa xác định múi giờ máy chủ sàn (Unknown). Hãy chọn múi giờ sàn trong Cài đặt (ví dụ UTC+2 hoặc UTC+3) để mở phân tích theo phiên Á/Âu/Mỹ chính xác.',
    bySymbol,
    bySide,
    byDay,
    byWeek,
    byMonth,
    bySession,
    byStrategy,
    byMistakeTag,
    winLossDistribution: distCounts,
    holdingTimeBuckets,
    equityCurve,
  };
}
