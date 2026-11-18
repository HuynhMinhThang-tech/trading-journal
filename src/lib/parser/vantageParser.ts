import * as cheerio from 'cheerio';
import Decimal from 'decimal.js';
import type {
  AccountSummary,
  DealEntryType,
  DealRecord,
  OrderRecord,
  ParseWarning,
  ParsedStatement,
  PositionSnapshotRecord,
  StatementHeader,
  WorkingOrderRecord,
} from '../../shared/types.ts';

export const PARSER_VERSION = 'vantage-confirm-v1.0';

const TIMESTAMP_REGEX = /^\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/;

function cleanText(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function normalizeDecimalString(raw: string | undefined | null): string {
  if (!raw) return '0.00';
  const cleaned = cleanText(raw).replace(/\s+/g, '').replace(/,/g, '');
  if (!cleaned || cleaned === '-') return '0.00';
  try {
    return new Decimal(cleaned).toString();
  } catch {
    return 'NaN';
  }
}

function isValidNumeric(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const cleaned = cleanText(raw).replace(/\s+/g, '').replace(/,/g, '');
  if (!cleaned) return false;
  try {
    new Decimal(cleaned);
    return true;
  } catch {
    return false;
  }
}

function parseOptionalStopTarget(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = cleanText(raw).replace(/\s+/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  try {
    const val = new Decimal(cleaned);
    if (val.isZero()) return null;
    return val.toFixed();
  } catch {
    return null;
  }
}

function parseOrderSize(sizeRaw: string): { requested: string | null; filled: string | null } {
  const cleaned = cleanText(sizeRaw);
  const slashMatch = cleaned.match(/^([\d.,]+)\s*\/\s*([\d.,]+)$/);
  if (slashMatch) {
    return {
      requested: normalizeDecimalString(slashMatch[1]),
      filled: normalizeDecimalString(slashMatch[2]),
    };
  }
  if (isValidNumeric(cleaned)) {
    const val = normalizeDecimalString(cleaned);
    return { requested: val, filled: val };
  }
  return { requested: null, filled: null };
}

function normalizeEntryType(raw: string): DealEntryType | null {
  const val = cleanText(raw).toLowerCase();
  if (val === 'in' || val === 'out' || val === 'inout' || val === 'out_by') {
    return val;
  }
  if (val === 'out by' || val === 'out/by') return 'out_by';
  return null;
}

function extractReportDate(tsRaw: string): string {
  const m = cleanText(tsRaw).match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function emptySummary(): AccountSummary {
  return {
    closedTradePL: '0',
    depositsWithdrawals: '0',
    creditFacility: '0',
    roundCommission: '0',
    instantCommission: '0',
    additionalOperations: '0',
    total: '0',
    previousLedgerBalance: '0',
    previousEquity: '0',
    balance: '0',
    equity: '0',
    floatingPL: '0',
    marginRequirements: '0',
    availableMargin: '0',
  };
}

function assignSummaryField(summary: AccountSummary, labelRaw: string, valueRaw: string): boolean {
  const label = cleanText(labelRaw).replace(/:$/, '').toLowerCase();
  const value = normalizeDecimalString(valueRaw);
  if (value === 'NaN') return false;

  if (label.includes('closed trade p/l')) {
    summary.closedTradePL = value;
    return true;
  }
  if (label.includes('deposit/withdrawal')) {
    summary.depositsWithdrawals = value;
    return true;
  }
  if (label.includes('total credit facility') || label.includes('credit facility')) {
    summary.creditFacility = value;
    return true;
  }
  if (label.includes('round commission')) {
    summary.roundCommission = value;
    return true;
  }
  if (label.includes('instant commission')) {
    summary.instantCommission = value;
    return true;
  }
  if (label.includes('additional operations')) {
    summary.additionalOperations = value;
    return true;
  }
  if (label === 'total') {
    summary.total = value;
    return true;
  }
  if (label.includes('previous ledger balance')) {
    summary.previousLedgerBalance = value;
    return true;
  }
  if (label.includes('previous equity')) {
    summary.previousEquity = value;
    return true;
  }
  if (label === 'balance') {
    summary.balance = value;
    return true;
  }
  if (label === 'equity') {
    summary.equity = value;
    return true;
  }
  if (label.includes('floating p/l')) {
    summary.floatingPL = value;
    return true;
  }
  if (label.includes('margin requirements')) {
    summary.marginRequirements = value;
    return true;
  }
  if (label.includes('available margin')) {
    summary.availableMargin = value;
    return true;
  }
  return false;
}

function computeSimpleChecksum(statement: Omit<ParsedStatement, 'checksum' | 'validationStatus' | 'warnings'>): string {
  const payload = JSON.stringify({
    header: statement.header,
    orders: statement.orders.map((o) => o.ticket),
    deals: statement.deals.map((d) => `${d.ticket}:${d.profit}`),
    summary: statement.summary,
  });
  // FNV-1a + DJB2 hybrid deterministic 64-bit hex string (works identically in browser & Node)
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = (Math.imul(h2, 33) ^ ch) >>> 0;
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function validateAndFinalize(
  sourceType: ParsedStatement['sourceType'],
  header: StatementHeader,
  orders: OrderRecord[],
  deals: DealRecord[],
  positions: PositionSnapshotRecord[],
  workingOrders: WorkingOrderRecord[],
  summary: AccountSummary,
  warnings: ParseWarning[],
): ParsedStatement {
  if (!header.accountNumber) {
    warnings.push({
      code: 'MISSING_ACCOUNT_NUMBER',
      message: 'Không tìm thấy số tài khoản (A/C No) trong báo cáo.',
      section: 'Header',
    });
  }
  if (!header.currency) {
    warnings.push({
      code: 'MISSING_CURRENCY',
      message: 'Không tìm thấy đơn vị tiền tệ (Currency) trong báo cáo.',
      section: 'Header',
    });
  }
  if (!header.reportDate) {
    warnings.push({
      code: 'MISSING_REPORT_DATE',
      message: 'Không xác định được ngày báo cáo từ dòng tiêu đề.',
      section: 'Header',
    });
  }

  // Reconcile Deals sum vs Closed Trade P/L (deals.profit + commission + swap vs closedTradePL or profit sum)
  try {
    const sumDealsProfit = deals.reduce((acc, d) => acc.plus(new Decimal(d.profit)), new Decimal(0));
    const sumCommission = deals.reduce((acc, d) => acc.plus(new Decimal(d.commission)), new Decimal(0));
    const sumSwap = deals.reduce((acc, d) => acc.plus(new Decimal(d.swap)), new Decimal(0));
    const sumDealsNet = sumDealsProfit.plus(sumCommission).plus(sumSwap);
    const summaryClosed = new Decimal(summary.closedTradePL);

    if (deals.length > 0 && !sumDealsProfit.equals(summaryClosed) && !sumDealsNet.equals(summaryClosed)) {
      warnings.push({
        code: 'CLOSED_PL_MISMATCH',
        message: `Tổng P/L từ Deals (${sumDealsProfit.toFixed(2)}) khác với Closed Trade P/L trong Summary (${summaryClosed.toFixed(2)}).`,
        section: 'A/C Summary',
      });
    }

    const prevBal = new Decimal(summary.previousLedgerBalance);
    const totalLine = new Decimal(summary.total);
    const newBal = new Decimal(summary.balance);
    const expectedBal = prevBal.plus(totalLine);
    if (!expectedBal.sub(newBal).abs().lte(new Decimal('0.02')) && (deals.length > 0 || !totalLine.isZero())) {
      warnings.push({
        code: 'BALANCE_RECONCILE_MISMATCH',
        message: `Số dư mới (${newBal.toFixed(2)}) lệch với Previous Balance + Total (${expectedBal.toFixed(2)}).`,
        section: 'A/C Summary',
      });
    }
  } catch {
    warnings.push({
      code: 'NUMERIC_VALIDATION_ERROR',
      message: 'Không thể đối chiếu số học của A/C Summary.',
      section: 'A/C Summary',
    });
  }

  let validationStatus: ParsedStatement['validationStatus'] = 'valid';
  const hasCritical = warnings.some((w) =>
    ['MISSING_ACCOUNT_NUMBER', 'MISSING_REPORT_DATE', 'NO_SECTIONS_FOUND'].includes(w.code),
  );
  if (hasCritical) {
    validationStatus = 'invalid';
  } else if (warnings.length > 0) {
    validationStatus = 'partial';
  }

  const base = {
    parserVersion: PARSER_VERSION,
    sourceType,
    header,
    orders,
    deals,
    positions,
    workingOrders,
    summary,
  };

  return {
    ...base,
    validationStatus,
    warnings,
    checksum: computeSimpleChecksum(base),
  };
}

/**
 * Bộ phân tích văn bản dạng bảng / dán trực tiếp từ email Vantage Daily Confirmation
 */
export function parseVantagePlainText(rawText: string, sourceType: ParsedStatement['sourceType'] = 'text'): ParsedStatement {
  const warnings: ParseWarning[] = [];
  const header: StatementHeader = {
    accountNumber: '',
    accountName: '',
    currency: '',
    reportTimestampRaw: '',
    reportDate: '',
  };
  const orders: OrderRecord[] = [];
  const deals: DealRecord[] = [];
  const positions: PositionSnapshotRecord[] = [];
  const workingOrders: WorkingOrderRecord[] = [];
  const summary = emptySummary();

  const lines = rawText.replace(/\r/g, '').split('\n');
  type Section = 'none' | 'orders' | 'deals' | 'positions' | 'working_orders' | 'summary';
  let currentSection: Section = 'none';
  let foundAnySection = false;

  const splitCols = (line: string): string[] => {
    if (line.includes('\t')) {
      return line.split('\t').map((c) => cleanText(c));
    }
    // Fallback if tabs were converted to 2+ spaces on copy-paste
    return line.trim().split(/\s{2,}/).map((c) => cleanText(c));
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = cleanText(rawLine);
    if (!trimmed) continue;

    // Header line detection: A/C No: 26818392  Name: ... Currency: USD  2026.10.22 23:59
    if (/a\/c\s*no\s*:/i.test(trimmed)) {
      const acMatch = trimmed.match(/a\/c\s*no\s*:\s*([A-Za-z0-9_-]+)/i);
      const nameMatch = trimmed.match(/name\s*:\s*(.+?)(?=\s+currency\s*:|\t|$)/i);
      const currMatch = trimmed.match(/currency\s*:\s*([A-Z]{3,5})/i);
      const tsMatch = trimmed.match(/(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/);
      if (acMatch) header.accountNumber = cleanText(acMatch[1]);
      if (nameMatch) header.accountName = cleanText(nameMatch[1]);
      if (currMatch) header.currency = cleanText(currMatch[1]).toUpperCase();
      if (tsMatch) {
        header.reportTimestampRaw = cleanText(tsMatch[1]);
        header.reportDate = extractReportDate(header.reportTimestampRaw);
      }
      continue;
    }

    // Section switches
    if (/^orders\s*:$/i.test(trimmed)) {
      currentSection = 'orders';
      foundAnySection = true;
      continue;
    }
    if (/^deals\s*:$/i.test(trimmed)) {
      currentSection = 'deals';
      foundAnySection = true;
      continue;
    }
    if (/^positions\s*:$/i.test(trimmed)) {
      currentSection = 'positions';
      foundAnySection = true;
      continue;
    }
    if (/^working orders\s*:$/i.test(trimmed)) {
      currentSection = 'working_orders';
      foundAnySection = true;
      continue;
    }
    if (/^a\/c summary\s*:$/i.test(trimmed)) {
      currentSection = 'summary';
      foundAnySection = true;
      continue;
    }

    if (/^no transactions$/i.test(trimmed)) continue;
    if (/^open time\b/i.test(trimmed) && /\bticket\b/i.test(trimmed)) continue;

    const cols = splitCols(rawLine);

    if (currentSection === 'orders') {
      if (TIMESTAMP_REGEX.test(cols[0] ?? '') && /^\d+$/.test(cols[1] ?? '')) {
        const sizeRaw = cols[3] ?? '';
        const parsedSize = parseOrderSize(sizeRaw);
        orders.push({
          openTimeRaw: cols[0],
          ticket: cols[1],
          type: (cols[2] ?? '').toLowerCase(),
          sizeRaw,
          sizeRequested: parsedSize.requested,
          sizeFilled: parsedSize.filled,
          symbol: cols[4] ?? '',
          priceRaw: cols[5] ?? '',
          stopLoss: parseOptionalStopTarget(cols[6]),
          takeProfit: parseOptionalStopTarget(cols[7]),
          executionTimeRaw: cols[8] ?? '',
          state: (cols[9] ?? '').toLowerCase(),
          comment: cols[10] ?? '',
        });
      }
      continue;
    }

    if (currentSection === 'deals') {
      if (TIMESTAMP_REGEX.test(cols[0] ?? '') && /^\d+$/.test(cols[1] ?? '')) {
        // Expect 12 columns: Open Time, Ticket, Type, Size, Item, Price, Order, Comment, Entry, Commission, Swap, Profit
        // Note: if tabs were collapsed in copy-paste without comment, handle 11 cols gracefully
        let comment = '';
        let entryRaw = '';
        let commRaw = '';
        let swapRaw = '';
        let profitRaw = '';

        if (cols.length >= 12) {
          comment = cols[7] ?? '';
          entryRaw = cols[8] ?? '';
          commRaw = cols[9] ?? '0';
          swapRaw = cols[10] ?? '0';
          profitRaw = cols[11] ?? '0';
        } else if (cols.length === 11) {
          // Missing empty comment column when spaces were used
          comment = '';
          entryRaw = cols[7] ?? '';
          commRaw = cols[8] ?? '0';
          swapRaw = cols[9] ?? '0';
          profitRaw = cols[10] ?? '0';
        } else {
          warnings.push({
            code: 'DEAL_COLUMN_MISMATCH',
            message: `Dòng Deal ticket ${cols[1]} có số cột bất thường (${cols.length} cột).`,
            section: 'Deals',
            detail: trimmed,
          });
          continue;
        }

        const entry = normalizeEntryType(entryRaw);
        if (!entry) {
          warnings.push({
            code: 'INVALID_DEAL_ENTRY',
            message: `Không nhận diện được giá trị Entry "${entryRaw}" ở Deal ticket ${cols[1]}.`,
            section: 'Deals',
          });
          continue;
        }

        deals.push({
          timeRaw: cols[0],
          ticket: cols[1],
          type: (cols[2] ?? '').toLowerCase(),
          volume: normalizeDecimalString(cols[3]),
          symbol: cols[4] ?? '',
          price: normalizeDecimalString(cols[5]),
          orderTicket: cols[6] ?? '',
          comment,
          entry,
          commission: normalizeDecimalString(commRaw),
          swap: normalizeDecimalString(swapRaw),
          profit: normalizeDecimalString(profitRaw),
        });
      }
      continue;
    }

    if (currentSection === 'positions') {
      if (TIMESTAMP_REGEX.test(cols[0] ?? '') && /^\d+$/.test(cols[1] ?? '')) {
        positions.push({
          openTimeRaw: cols[0],
          ticket: cols[1],
          type: (cols[2] ?? '').toLowerCase(),
          size: normalizeDecimalString(cols[3]),
          symbol: cols[4] ?? '',
          price: normalizeDecimalString(cols[5]),
          stopLoss: parseOptionalStopTarget(cols[6]),
          takeProfit: parseOptionalStopTarget(cols[7]),
          marketPrice: normalizeDecimalString(cols[8]),
          swap: normalizeDecimalString(cols[9]),
          profit: normalizeDecimalString(cols[10]),
        });
      }
      continue;
    }

    if (currentSection === 'working_orders') {
      if (TIMESTAMP_REGEX.test(cols[0] ?? '') && /^\d+$/.test(cols[1] ?? '')) {
        workingOrders.push({
          openTimeRaw: cols[0],
          ticket: cols[1],
          type: (cols[2] ?? '').toLowerCase(),
          sizeRaw: cols[3] ?? '',
          symbol: cols[4] ?? '',
          price: normalizeDecimalString(cols[5]),
          stopLoss: parseOptionalStopTarget(cols[6]),
          takeProfit: parseOptionalStopTarget(cols[7]),
          marketPrice: normalizeDecimalString(cols[8]),
          comment: cols[9] ?? '',
        });
      }
      continue;
    }

    if (currentSection === 'summary') {
      // A/C Summary lines typically have 2 key-value pairs per row:
      // Closed Trade P/L: \t 3.66 \t \t Previous Ledger Balance: \t 22.49
      const nonEmpty = cols.filter((c) => c.length > 0);
      for (let c = 0; c < nonEmpty.length - 1; c++) {
        if (nonEmpty[c].endsWith(':') && isValidNumeric(nonEmpty[c + 1])) {
          assignSummaryField(summary, nonEmpty[c], nonEmpty[c + 1]);
          c++;
        }
      }
    }
  }

  if (!foundAnySection) {
    warnings.push({
      code: 'NO_SECTIONS_FOUND',
      message: 'Không nhận diện được các phần Orders / Deals / A/C Summary trong nội dung báo cáo.',
      section: 'Document',
    });
  }

  return validateAndFinalize(sourceType, header, orders, deals, positions, workingOrders, summary, warnings);
}

/**
 * Bộ phân tích HTML chuẩn MetaQuotes từ email Daily Confirmation
 */
export function parseVantageHtml(html: string, sourceType: ParsedStatement['sourceType'] = 'html'): ParsedStatement {
  const $ = cheerio.load(html);
  const warnings: ParseWarning[] = [];
  const header: StatementHeader = {
    accountNumber: '',
    accountName: '',
    currency: '',
    reportTimestampRaw: '',
    reportDate: '',
  };
  const orders: OrderRecord[] = [];
  const deals: DealRecord[] = [];
  const positions: PositionSnapshotRecord[] = [];
  const workingOrders: WorkingOrderRecord[] = [];
  const summary = emptySummary();

  type Section = 'none' | 'orders' | 'deals' | 'positions' | 'working_orders' | 'summary';
  let currentSection: Section = 'none';
  let foundAnySection = false;

  $('tr').each((_, tr) => {
    const cells = $(tr)
      .find('td, th')
      .map((__, cell) => cleanText($(cell).text()))
      .get();

    if (cells.length === 0) return;
    const joined = cells.filter(Boolean).join(' ').trim();
    if (!joined) return;

    // Header row check
    if (/a\/c\s*no\s*:/i.test(joined)) {
      const acMatch = joined.match(/a\/c\s*no\s*:\s*([A-Za-z0-9_-]+)/i);
      const nameMatch = joined.match(/name\s*:\s*(.+?)(?=\s+currency\s*:|$)/i);
      const currMatch = joined.match(/currency\s*:\s*([A-Z]{3,5})/i);
      const tsMatch = joined.match(/(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/);
      if (acMatch) header.accountNumber = cleanText(acMatch[1]);
      if (nameMatch) header.accountName = cleanText(nameMatch[1]);
      if (currMatch) header.currency = cleanText(currMatch[1]).toUpperCase();
      if (tsMatch) {
        header.reportTimestampRaw = cleanText(tsMatch[1]);
        header.reportDate = extractReportDate(header.reportTimestampRaw);
      }
      return;
    }

    // Section markers
    if (cells.some((c) => /^orders\s*:$/i.test(c))) {
      currentSection = 'orders';
      foundAnySection = true;
      return;
    }
    if (cells.some((c) => /^deals\s*:$/i.test(c))) {
      currentSection = 'deals';
      foundAnySection = true;
      return;
    }
    if (cells.some((c) => /^positions\s*:$/i.test(c))) {
      currentSection = 'positions';
      foundAnySection = true;
      return;
    }
    if (cells.some((c) => /^working orders\s*:$/i.test(c))) {
      currentSection = 'working_orders';
      foundAnySection = true;
      return;
    }
    if (cells.some((c) => /^a\/c summary\s*:$/i.test(c))) {
      currentSection = 'summary';
      foundAnySection = true;
      return;
    }

    if (/^no transactions$/i.test(joined)) return;
    if (/^open time\b/i.test(cells[0] ?? '') && cells.some((c) => /^ticket$/i.test(c))) return;

    if (currentSection === 'orders') {
      if (TIMESTAMP_REGEX.test(cells[0] ?? '') && /^\d+$/.test(cells[1] ?? '')) {
        const sizeRaw = cells[3] ?? '';
        const parsedSize = parseOrderSize(sizeRaw);
        orders.push({
          openTimeRaw: cells[0],
          ticket: cells[1],
          type: (cells[2] ?? '').toLowerCase(),
          sizeRaw,
          sizeRequested: parsedSize.requested,
          sizeFilled: parsedSize.filled,
          symbol: cells[4] ?? '',
          priceRaw: cells[5] ?? '',
          stopLoss: parseOptionalStopTarget(cells[6]),
          takeProfit: parseOptionalStopTarget(cells[7]),
          executionTimeRaw: cells[8] ?? '',
          state: (cells[9] ?? '').toLowerCase(),
          comment: cells[10] ?? '',
        });
      }
      return;
    }

    if (currentSection === 'deals') {
      if (TIMESTAMP_REGEX.test(cells[0] ?? '') && /^\d+$/.test(cells[1] ?? '')) {
        if (cells.length < 12) {
          warnings.push({
            code: 'DEAL_COLUMN_MISMATCH',
            message: `Dòng Deal HTML ticket ${cells[1]} thiếu cột (${cells.length}/12).`,
            section: 'Deals',
          });
          return;
        }
        const entry = normalizeEntryType(cells[8] ?? '');
        if (!entry) {
          warnings.push({
            code: 'INVALID_DEAL_ENTRY',
            message: `Giá trị Entry không hợp lệ "${cells[8]}" ở ticket ${cells[1]}.`,
            section: 'Deals',
          });
          return;
        }
        deals.push({
          timeRaw: cells[0],
          ticket: cells[1],
          type: (cells[2] ?? '').toLowerCase(),
          volume: normalizeDecimalString(cells[3]),
          symbol: cells[4] ?? '',
          price: normalizeDecimalString(cells[5]),
          orderTicket: cells[6] ?? '',
          comment: cells[7] ?? '',
          entry,
          commission: normalizeDecimalString(cells[9]),
          swap: normalizeDecimalString(cells[10]),
          profit: normalizeDecimalString(cells[11]),
        });
      }
      return;
    }

    if (currentSection === 'positions') {
      if (TIMESTAMP_REGEX.test(cells[0] ?? '') && /^\d+$/.test(cells[1] ?? '')) {
        positions.push({
          openTimeRaw: cells[0],
          ticket: cells[1],
          type: (cells[2] ?? '').toLowerCase(),
          size: normalizeDecimalString(cells[3]),
          symbol: cells[4] ?? '',
          price: normalizeDecimalString(cells[5]),
          stopLoss: parseOptionalStopTarget(cells[6]),
          takeProfit: parseOptionalStopTarget(cells[7]),
          marketPrice: normalizeDecimalString(cells[8]),
          swap: normalizeDecimalString(cells[9]),
          profit: normalizeDecimalString(cells[10]),
        });
      }
      return;
    }

    if (currentSection === 'working_orders') {
      if (TIMESTAMP_REGEX.test(cells[0] ?? '') && /^\d+$/.test(cells[1] ?? '')) {
        workingOrders.push({
          openTimeRaw: cells[0],
          ticket: cells[1],
          type: (cells[2] ?? '').toLowerCase(),
          sizeRaw: cells[3] ?? '',
          symbol: cells[4] ?? '',
          price: normalizeDecimalString(cells[5]),
          stopLoss: parseOptionalStopTarget(cells[6]),
          takeProfit: parseOptionalStopTarget(cells[7]),
          marketPrice: normalizeDecimalString(cells[8]),
          comment: cells[9] ?? '',
        });
      }
      return;
    }

    if (currentSection === 'summary') {
      const nonEmpty = cells.filter((c) => c.length > 0);
      for (let c = 0; c < nonEmpty.length - 1; c++) {
        if (nonEmpty[c].endsWith(':') && isValidNumeric(nonEmpty[c + 1])) {
          assignSummaryField(summary, nonEmpty[c], nonEmpty[c + 1]);
          c++;
        }
      }
    }
  });

  if (!foundAnySection) {
    // Try plain-text fallback if HTML didn't contain MetaQuotes table structure
    const fallbackText = $.root().text();
    if (/a\/c\s*no\s*:/i.test(fallbackText) && /orders\s*:/i.test(fallbackText)) {
      return parseVantagePlainText(fallbackText, sourceType);
    }
    warnings.push({
      code: 'NO_SECTIONS_FOUND',
      message: 'Không tìm thấy cấu trúc bảng báo cáo Vantage trong nội dung HTML.',
      section: 'Document',
    });
  }

  return validateAndFinalize(sourceType, header, orders, deals, positions, workingOrders, summary, warnings);
}

function decodeQuotedPrintable(input: string): string {
  const unwrapped = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < unwrapped.length; i++) {
    if (unwrapped[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(unwrapped.slice(i + 1, i + 3))) {
      bytes.push(parseInt(unwrapped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(unwrapped.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeBase64(input: string): string {
  const cleaned = input.replace(/\s+/g, '');
  return Buffer.from(cleaned, 'base64').toString('utf8');
}

export function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractMimeParts(rawMime: string): {
  headers: Record<string, string>;
  htmlBody: string | null;
  textBody: string | null;
} {
  const normalized = rawMime.replace(/\r\n/g, '\n');
  const splitIdx = normalized.indexOf('\n\n');
  const headerBlock = splitIdx >= 0 ? normalized.slice(0, splitIdx) : normalized;
  const bodyBlock = splitIdx >= 0 ? normalized.slice(splitIdx + 2) : '';

  // Unfold headers
  const unfolded = headerBlock.replace(/\n[ \t]+/g, ' ');
  const headers: Record<string, string> = {};
  for (const line of unfolded.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      headers[key] = val;
    }
  }

  const contentType = headers['content-type'] ?? 'text/plain';
  const transferEncoding = (headers['content-transfer-encoding'] ?? '').toLowerCase();
  const contentDisposition = (headers['content-disposition'] ?? '').toLowerCase();

  if (contentDisposition.startsWith('attachment')) {
    return { headers, htmlBody: null, textBody: null };
  }

  const boundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = bodyBlock.split(`--${boundary}`);
    let htmlBody: string | null = null;
    let textBody: string | null = null;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === '--') continue;
      const sub = extractMimeParts(trimmed);
      if (sub.htmlBody && !htmlBody) htmlBody = sub.htmlBody;
      if (sub.textBody && !textBody) textBody = sub.textBody;
    }
    return { headers, htmlBody, textBody };
  }

  let decoded = bodyBlock;
  if (transferEncoding.includes('base64')) {
    decoded = decodeBase64(bodyBlock);
  } else if (transferEncoding.includes('quoted-printable')) {
    decoded = decodeQuotedPrintable(bodyBlock);
  }

  if (contentType.toLowerCase().includes('text/html')) {
    return { headers, htmlBody: decoded, textBody: null };
  }
  return { headers, htmlBody: null, textBody: decoded };
}

/**
 * Bộ phân tích file .eml MIME đầy đủ (multipart/alternative -> ưu tiên text/html, fallback text/plain)
 */
export function parseVantageEml(rawEml: string): {
  emailMeta: { from: string; subject: string; date: string };
  statement: ParsedStatement;
} {
  const { headers, htmlBody, textBody } = extractMimeParts(rawEml);
  const emailMeta = {
    from: headers['from'] ?? '',
    subject: headers['subject'] ?? '',
    date: headers['date'] ?? '',
  };

  if (htmlBody) {
    return { emailMeta, statement: parseVantageHtml(htmlBody, 'eml') };
  }
  if (textBody) {
    return { emailMeta, statement: parseVantagePlainText(textBody, 'eml') };
  }

  return {
    emailMeta,
    statement: parseVantagePlainText(rawEml, 'eml'),
  };
}

/**
 * Tự động nhận diện đầu vào (HTML / .eml / Text dán tay)
 */
export function parseVantageAnyInput(rawInput: string): ParsedStatement {
  const trimmed = rawInput.trim();
  if (/^(delivered-to|received|return-path|from|mime-version):/im.test(trimmed) && /content-type:/im.test(trimmed)) {
    return parseVantageEml(rawInput).statement;
  }
  if (/<html|<table|<tr|<td/i.test(trimmed)) {
    return parseVantageHtml(rawInput, 'html');
  }
  return parseVantagePlainText(rawInput, 'text');
}

export interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
}

export function extractBodiesFromGmailPayload(payload?: GmailPayloadPart): {
  htmlBody: string | null;
  textBody: string | null;
} {
  if (!payload) return { htmlBody: null, textBody: null };
  let htmlBody: string | null = null;
  let textBody: string | null = null;

  const walk = (part: GmailPayloadPart) => {
    if (part.filename && part.filename.length > 0) return; // skip attachments
    const mime = (part.mimeType ?? '').toLowerCase();
    if (mime === 'text/html' && part.body?.data && !htmlBody) {
      htmlBody = decodeBase64Url(part.body.data);
    } else if (mime === 'text/plain' && part.body?.data && !textBody) {
      textBody = decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  };

  walk(payload);
  return { htmlBody, textBody };
}
