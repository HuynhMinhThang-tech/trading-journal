import Decimal from 'decimal.js';
import type {
  DealRecord,
  JournalEntry,
  ReviewItem,
  TradeDealAllocation,
  TradeRecord,
} from '../../shared/types.ts';

export const MATCHING_VERSION = 'fifo-inferred-v1.0';

function parseRawTimeToDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffMinutes(startRaw: string, endRaw: string | null): number | null {
  if (!endRaw) return null;
  const d1 = parseRawTimeToDate(startRaw);
  const d2 = parseRawTimeToDate(endRaw);
  if (!d1 || !d2) return null;
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 60000));
}

export interface DealWithAccount extends DealRecord {
  accountId: string;
  accountNumber: string;
}

export interface ManualOverrideRule {
  dealTicket: string;
  targetTradeId: string;
}

interface OpenLot {
  deal: DealWithAccount;
  side: 'BUY' | 'SELL';
  remainingVolume: Decimal;
  totalVolume: Decimal;
  commission: Decimal;
  swap: Decimal;
}

export interface MatchResult {
  trades: TradeRecord[];
  reviewItems: ReviewItem[];
}

/**
 * Ghép các Deals nguồn gốc bất biến thành Trades suy luận (FIFO theo Account + Symbol + Chiều đối ứng).
 * Nếu có nhiều lot mở cùng symbol hoặc thiếu deal mở (unmatched), ghi nhận trạng thái rõ ràng và đẩy vào Hàng đợi rà soát.
 * Không ghi đè JournalEntry thủ công của người dùng.
 */
export function matchDealsToTrades(
  dealsInput: DealWithAccount[],
  existingJournalsByTradeId: Map<string, JournalEntry>,
  manualOverrides: Map<string, string> = new Map(),
): MatchResult {
  const sorted = [...dealsInput].sort((a, b) => {
    const tCmp = a.timeRaw.localeCompare(b.timeRaw);
    if (tCmp !== 0) return tCmp;
    return Number(a.ticket) - Number(b.ticket);
  });

  const openLotsByKey = new Map<string, OpenLot[]>();
  const trades: TradeRecord[] = [];
  const reviewItems: ReviewItem[] = [];
  const tradeIndexById = new Map<string, number>();

  const makeKey = (accountId: string, symbol: string) => `${accountId}::${symbol.toUpperCase()}`;

  for (const deal of sorted) {
    const key = makeKey(deal.accountId, deal.symbol);
    const dealVol = new Decimal(deal.volume || '0');
    const dealComm = new Decimal(deal.commission || '0');
    const dealSwap = new Decimal(deal.swap || '0');
    const dealProfit = new Decimal(deal.profit || '0');
    const sideNorm: 'BUY' | 'SELL' = deal.type.toLowerCase() === 'buy' ? 'BUY' : 'SELL';

    if (deal.entry === 'in') {
      const lots = openLotsByKey.get(key) ?? [];
      lots.push({
        deal,
        side: sideNorm,
        remainingVolume: dealVol,
        totalVolume: dealVol,
        commission: dealComm,
        swap: dealSwap,
      });
      openLotsByKey.set(key, lots);
      continue;
    }

    if (deal.entry === 'out' || deal.entry === 'out_by' || deal.entry === 'inout') {
      const lots = openLotsByKey.get(key) ?? [];
      const expectedOpenSide: 'BUY' | 'SELL' = sideNorm === 'BUY' ? 'SELL' : 'BUY';
      const matchingLots = lots.filter((l) => l.side === expectedOpenSide && l.remainingVolume.gt(0));

      if (matchingLots.length === 0) {
        // Unmatched exit deal (ví dụ: lệnh mở nằm ở ngày trước chưa được import)
        const unmatchedId = `trd_${deal.accountId}_${deal.ticket}`;
        const existingJournal = existingJournalsByTradeId.get(unmatchedId) ?? null;
        const netPL = dealProfit.plus(dealComm).plus(dealSwap);
        trades.push({
          id: unmatchedId,
          accountId: deal.accountId,
          accountNumber: deal.accountNumber,
          symbol: deal.symbol,
          side: expectedOpenSide,
          openTimeRaw: deal.timeRaw,
          closeTimeRaw: deal.timeRaw,
          volume: dealVol.toString(),
          entryPrice: deal.price,
          exitPrice: deal.price,
          grossPL: dealProfit.toFixed(2),
          commission: dealComm.toFixed(2),
          swap: dealSwap.toFixed(2),
          netPL: netPL.toFixed(2),
          holdingMinutes: null,
          matchingStatus: 'unmatched',
          matchingMethod: 'fifo-inferred',
          matchingVersion: MATCHING_VERSION,
          allocations: [
            {
              dealTicket: deal.ticket,
              role: 'exit',
              allocatedVolume: dealVol.toString(),
              allocatedProfit: dealProfit.toFixed(2),
              allocatedCommission: dealComm.toFixed(2),
              allocatedSwap: dealSwap.toFixed(2),
              timeRaw: deal.timeRaw,
              price: deal.price,
              type: deal.type,
              orderTicket: deal.orderTicket,
              comment: deal.comment,
            },
          ],
          journal: existingJournal,
        });

        reviewItems.push({
          id: `rev_unmatched_${deal.accountId}_${deal.ticket}`,
          type: 'unmatched_deal',
          status: 'pending',
          symbol: deal.symbol,
          dealTicket: deal.ticket,
          tradeId: unmatchedId,
          title: `Deal đóng lệnh #${deal.ticket} (${deal.symbol}) thiếu lệnh mở tương ứng`,
          description: `Không tìm thấy Deal IN cho mã ${deal.symbol} chiều ${expectedOpenSide}. Có thể email ngày mở lệnh chưa được nhập vào hệ thống.`,
          resolutionNote: null,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        });
        continue;
      }

      // Check ambiguity: multiple distinct open lots on the same symbol & side simultaneously
      const isAmbiguous = matchingLots.length > 1 && !manualOverrides.has(deal.ticket);
      let volumeToClose = dealVol;

      const allocations: TradeDealAllocation[] = [];
      let weightedEntryNum = new Decimal(0);
      let closedVolAccum = new Decimal(0);
      let entryCommAccum = new Decimal(0);
      let entrySwapAccum = new Decimal(0);
      let firstOpenTime = matchingLots[0].deal.timeRaw;
      const openTickets: string[] = [];

      for (const lot of matchingLots) {
        if (volumeToClose.lte(0)) break;
        const take = Decimal.min(volumeToClose, lot.remainingVolume);
        const ratio = lot.totalVolume.gt(0) ? take.div(lot.totalVolume) : new Decimal(1);
        const allocEntryComm = lot.commission.mul(ratio);
        const allocEntrySwap = lot.swap.mul(ratio);

        weightedEntryNum = weightedEntryNum.plus(new Decimal(lot.deal.price).mul(take));
        closedVolAccum = closedVolAccum.plus(take);
        entryCommAccum = entryCommAccum.plus(allocEntryComm);
        entrySwapAccum = entrySwapAccum.plus(allocEntrySwap);
        openTickets.push(lot.deal.ticket);

        allocations.push({
          dealTicket: lot.deal.ticket,
          role: 'entry',
          allocatedVolume: take.toString(),
          allocatedProfit: '0.00',
          allocatedCommission: allocEntryComm.toFixed(2),
          allocatedSwap: allocEntrySwap.toFixed(2),
          timeRaw: lot.deal.timeRaw,
          price: lot.deal.price,
          type: lot.deal.type,
          orderTicket: lot.deal.orderTicket,
          comment: lot.deal.comment,
        });

        lot.remainingVolume = lot.remainingVolume.sub(take);
        volumeToClose = volumeToClose.sub(take);
      }

      // Check if exit deal still has leftover volume beyond available open lots
      const unallocatedRemainder = volumeToClose.gt(0) ? volumeToClose : new Decimal(0);
      const exitRatio = dealVol.gt(0) ? closedVolAccum.div(dealVol) : new Decimal(1);
      const allocExitProfit = dealProfit.mul(exitRatio);
      const allocExitComm = dealComm.mul(exitRatio);
      const allocExitSwap = dealSwap.mul(exitRatio);

      allocations.push({
        dealTicket: deal.ticket,
        role: 'exit',
        allocatedVolume: closedVolAccum.toString(),
        allocatedProfit: allocExitProfit.toFixed(2),
        allocatedCommission: allocExitComm.toFixed(2),
        allocatedSwap: allocExitSwap.toFixed(2),
        timeRaw: deal.timeRaw,
        price: deal.price,
        type: deal.type,
        orderTicket: deal.orderTicket,
        comment: deal.comment,
      });

      const totalComm = entryCommAccum.plus(allocExitComm);
      const totalSwap = entrySwapAccum.plus(allocExitSwap);
      const netPL = allocExitProfit.plus(totalComm).plus(totalSwap);
      const avgEntryPrice = closedVolAccum.gt(0) ? weightedEntryNum.div(closedVolAccum) : new Decimal(0);

      const tradeId = `trd_${deal.accountId}_${openTickets[0]}_${deal.ticket}`;
      const existingJournal = existingJournalsByTradeId.get(tradeId) ?? null;

      const status: TradeRecord['matchingStatus'] = unallocatedRemainder.gt(0)
        ? 'partial'
        : isAmbiguous
          ? 'ambiguous'
          : 'matched';

      const method: TradeRecord['matchingMethod'] = manualOverrides.has(deal.ticket)
        ? 'manual-override'
        : 'fifo-inferred';

      const record: TradeRecord = {
        id: tradeId,
        accountId: deal.accountId,
        accountNumber: deal.accountNumber,
        symbol: deal.symbol,
        side: expectedOpenSide,
        openTimeRaw: firstOpenTime,
        closeTimeRaw: deal.timeRaw,
        volume: closedVolAccum.toString(),
        entryPrice: avgEntryPrice.toDecimalPlaces(5).toString(),
        exitPrice: deal.price,
        grossPL: allocExitProfit.toFixed(2),
        commission: totalComm.toFixed(2),
        swap: totalSwap.toFixed(2),
        netPL: netPL.toFixed(2),
        holdingMinutes: diffMinutes(firstOpenTime, deal.timeRaw),
        matchingStatus: status,
        matchingMethod: method,
        matchingVersion: MATCHING_VERSION,
        allocations,
        journal: existingJournal,
      };

      tradeIndexById.set(tradeId, trades.length);
      trades.push(record);

      if (isAmbiguous) {
        reviewItems.push({
          id: `rev_ambig_${deal.accountId}_${deal.ticket}`,
          type: 'ambiguous_match',
          status: 'pending',
          symbol: deal.symbol,
          dealTicket: deal.ticket,
          tradeId,
          title: `Nhiều vị thế ${deal.symbol} mở đồng thời khi khớp Deal #${deal.ticket}`,
          description: `Báo cáo email không có Position ID nên hệ thống tạm ghép theo FIFO (${openTickets.join(', ')} → ${deal.ticket}). Vui lòng kiểm tra và xác nhận lại cặp lệnh.`,
          resolutionNote: null,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        });
      }

      if (deal.entry === 'inout' && unallocatedRemainder.gt(0)) {
        // Reversal creates new open lot for the remainder
        lots.push({
          deal,
          side: sideNorm,
          remainingVolume: unallocatedRemainder,
          totalVolume: dealVol,
          commission: dealComm.mul(unallocatedRemainder.div(dealVol)),
          swap: dealSwap.mul(unallocatedRemainder.div(dealVol)),
        });
        openLotsByKey.set(key, lots);
      }
    }
  }

  // Remaining unclosed open lots -> open/partial trades (do NOT count into Win Rate!)
  for (const [, lots] of openLotsByKey.entries()) {
    for (const lot of lots) {
      if (lot.remainingVolume.lte(0)) continue;
      const openId = `trd_open_${lot.deal.accountId}_${lot.deal.ticket}`;
      const isPartialLeftover = !lot.remainingVolume.equals(lot.totalVolume);
      const ratio = lot.totalVolume.gt(0) ? lot.remainingVolume.div(lot.totalVolume) : new Decimal(1);
      const remComm = lot.commission.mul(ratio);
      const remSwap = lot.swap.mul(ratio);

      trades.push({
        id: openId,
        accountId: lot.deal.accountId,
        accountNumber: lot.deal.accountNumber,
        symbol: lot.deal.symbol,
        side: lot.side,
        openTimeRaw: lot.deal.timeRaw,
        closeTimeRaw: null,
        volume: lot.remainingVolume.toString(),
        entryPrice: lot.deal.price,
        exitPrice: null,
        grossPL: '0.00',
        commission: remComm.toFixed(2),
        swap: remSwap.toFixed(2),
        netPL: remComm.plus(remSwap).toFixed(2),
        holdingMinutes: null,
        matchingStatus: isPartialLeftover ? 'partial' : 'unmatched',
        matchingMethod: 'fifo-inferred',
        matchingVersion: MATCHING_VERSION,
        allocations: [
          {
            dealTicket: lot.deal.ticket,
            role: 'entry',
            allocatedVolume: lot.remainingVolume.toString(),
            allocatedProfit: '0.00',
            allocatedCommission: remComm.toFixed(2),
            allocatedSwap: remSwap.toFixed(2),
            timeRaw: lot.deal.timeRaw,
            price: lot.deal.price,
            type: lot.deal.type,
            orderTicket: lot.deal.orderTicket,
            comment: lot.deal.comment,
          },
        ],
        journal: existingJournalsByTradeId.get(openId) ?? null,
      });
    }
  }

  trades.sort((a, b) => b.openTimeRaw.localeCompare(a.openTimeRaw));

  return { trades, reviewItems };
}
