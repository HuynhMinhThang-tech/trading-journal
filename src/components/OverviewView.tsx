import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  Mail,
  Scale,
  Target,
  Upload,
  Wallet,
} from 'lucide-react';
import { MonthCalendar, type CalendarTone } from './MonthCalendar.tsx';
import { useIsDark } from '../hooks/useIsDark.ts';
import {
  addDaysIso,
  formatIsoDisplay,
  formatIsoShort,
  isoFromRaw,
  todayIso,
} from '../lib/dateUtils.ts';
import { formatCompactMoney, formatUsd } from '../lib/format.ts';
import { chartColors, pnlBarClass, pnlTextClass } from '../lib/pnl.ts';
import type {
  AccountSnapshotRecord,
  MetricsSummary,
  TradeRecord,
  WorkspaceDataset,
} from '../shared/types.ts';

interface OverviewViewProps {
  dataset: WorkspaceDataset;
  trades: TradeRecord[];
  /** Mốc số dư đã lọc theo tài khoản (không lọc theo khoảng ngày). */
  balanceSnapshots: AccountSnapshotRecord[];
  metrics: MetricsSummary;
  onNavigate: (tab: string) => void;
  /** Mở Nhật ký giao dịch tại một ngày cụ thể (YYYY-MM-DD). */
  onOpenDiaryDay: (iso: string) => void;
}

const BALANCE_WINDOW_DAYS = 7;

interface BalancePoint {
  date: string;
  label: string;
  balance: number | null;
  /** true nếu ngày này có sao kê thật (không phải số dư giữ nguyên từ ngày trước). */
  real: boolean;
}

function groupByAccount(snapshots: AccountSnapshotRecord[]): AccountSnapshotRecord[][] {
  const map = new Map<string, AccountSnapshotRecord[]>();
  for (const s of snapshots) {
    const list = map.get(s.accountId) ?? [];
    list.push(s);
    map.set(s.accountId, list);
  }
  return Array.from(map.values()).map((list) =>
    [...list].sort((a, b) => a.reportTimestampRaw.localeCompare(b.reportTimestampRaw)),
  );
}

// 7 ngày gần nhất tính đến hôm nay; cửa sổ tự trượt dần theo thời gian.
// Ngày không có sao kê giữ nguyên số dư của sao kê gần nhất trước đó.
function buildBalanceWindow(snapshots: AccountSnapshotRecord[]): BalancePoint[] {
  const groups = groupByAccount(snapshots);
  const today = todayIso();
  return Array.from({ length: BALANCE_WINDOW_DAYS }, (_, i) => {
    const date = addDaysIso(today, i - (BALANCE_WINDOW_DAYS - 1));
    let total = 0;
    let known = false;
    let real = false;
    for (const list of groups) {
      let last: AccountSnapshotRecord | null = null;
      for (const s of list) {
        if (s.reportDate <= date) last = s;
        else break;
      }
      if (last) {
        const bal = Number(last.balance);
        if (Number.isFinite(bal)) {
          total += bal;
          known = true;
          if (last.reportDate === date) real = true;
        }
      }
    }
    return {
      date,
      label: formatIsoShort(date),
      balance: known ? Math.round(total * 100) / 100 : null,
      real,
    };
  });
}

function getCurrentBalance(snapshots: AccountSnapshotRecord[]): { value: number; date: string } | null {
  const groups = groupByAccount(snapshots);
  let total = 0;
  let latestDate = '';
  let found = false;
  for (const list of groups) {
    const last = list[list.length - 1];
    const bal = Number(last?.balance);
    if (last && Number.isFinite(bal)) {
      total += bal;
      found = true;
      if (last.reportDate > latestDate) latestDate = last.reportDate;
    }
  }
  return found ? { value: Math.round(total * 100) / 100, date: latestDate } : null;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  dataset,
  trades,
  balanceSnapshots,
  metrics,
  onNavigate,
  onOpenDiaryDay,
}) => {
  const isDark = useIsDark();
  const colors = chartColors(isDark);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const uniqueHabitCount = useMemo(() => {
    const tags = new Set(
      dataset.observations
        .map((o) => o.habitTag.trim().toLowerCase())
        .filter(Boolean),
    );
    return tags.size;
  }, [dataset.observations]);

  const maxAbsSymbolPL = useMemo(() => {
    if (metrics.bySymbol.length === 0) return 1;
    return Math.max(...metrics.bySymbol.map((s) => Math.abs(Number(s.netPL))), 1);
  }, [metrics.bySymbol]);

  const balanceWindow = useMemo(() => buildBalanceWindow(balanceSnapshots), [balanceSnapshots]);
  const hasBalanceData = balanceWindow.some((p) => p.balance !== null);
  const currentBalance = useMemo(() => getCurrentBalance(balanceSnapshots), [balanceSnapshots]);

  // Tổng lãi / lỗ theo từng ngày (ngày đóng lệnh) để vẽ lịch
  const dayStats = useMemo(() => {
    const map = new Map<string, { net: number; count: number }>();
    for (const t of trades) {
      const iso = isoFromRaw(t.closeTimeRaw ?? t.openTimeRaw);
      const entry = map.get(iso) ?? { net: 0, count: 0 };
      entry.net += Number(t.netPL) || 0;
      entry.count += 1;
      map.set(iso, entry);
    }
    for (const entry of map.values()) {
      entry.net = Math.round(entry.net * 100) / 100;
    }
    return map;
  }, [trades]);

  const monthSummary = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-`;
    let net = 0;
    let days = 0;
    for (const [iso, entry] of dayStats) {
      if (iso.startsWith(prefix)) {
        net += entry.net;
        days += 1;
      }
    }
    return { net: Math.round(net * 100) / 100, days };
  }, [dayStats, calYear, calMonth]);

  if (dataset.imports.length === 0) {
    return (
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-6 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#1C1B18] dark:text-[#F2EFE9] text-balance">
          Chưa có dữ liệu báo cáo cuối ngày
        </h2>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('sync_settings')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C96442] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B55535] transition-colors min-h-[44px]"
          >
            <Mail className="w-4 h-4" />
            <span>Nhập báo cáo</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('research')}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-4 py-2.5 text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] transition-colors min-h-[44px]"
          >
            <Upload className="w-4 h-4" />
            <span>Mở sổ Nghiên cứu hành động giá</span>
          </button>
        </div>
      </div>
    );
  }

  const netPlNum = Number(metrics.netPL);
  const closedPadded = String(metrics.closedTrades).padStart(2, '0');
  const axisTick = { fontSize: 11, fill: colors.axis };

  const renderBalanceDot = (props: {
    cx?: number;
    cy?: number;
    index?: number;
    payload?: BalancePoint;
  }) => {
    const { cx, cy, index, payload } = props;
    if (cx === undefined || cy === undefined || !payload?.real) {
      return <g key={`dot-${index}`} />;
    }
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={4}
        fill="#C96442"
        stroke={isDark ? '#22211E' : '#FFFFFF'}
        strokeWidth={2}
      />
    );
  };

  return (
    <div className="space-y-5">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* KPI 1: Số dư hiện tại */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">
              Số dư hiện tại
            </span>
            <Wallet className="w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] shrink-0" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold font-mono-num tracking-tight text-[#1C1B18] dark:text-[#F2EFE9]">
            {currentBalance ? formatUsd(currentBalance.value, false) : '—'}
          </p>
          <p className="mt-1.5 text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
            {currentBalance ? `Sao kê ${formatIsoDisplay(currentBalance.date)}` : 'Chưa có sao kê'}
          </p>
        </div>

        {/* KPI 2: Lãi / lỗ ròng đã chốt */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">
              Lãi / lỗ ròng đã chốt
            </span>
            <CircleDollarSign className="w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] shrink-0" />
          </div>
          <p
            className={`mt-2.5 text-2xl font-semibold font-mono-num tracking-tight ${
              pnlTextClass(netPlNum) || 'text-[#1C1B18] dark:text-[#F2EFE9]'
            }`}
          >
            {formatUsd(metrics.netPL)}
          </p>
          <p className="mt-1.5 text-xs text-[#6B6963] dark:text-[#A6A39B]">
            <span className="font-mono-num">{metrics.closedTrades}</span> giao dịch hoàn tất
          </p>
        </div>

        {/* KPI 3: Số giao dịch đã đóng */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">
              Số giao dịch đã đóng
            </span>
            <ArrowUpRight className="w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] shrink-0" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold font-mono-num tracking-tight text-[#1C1B18] dark:text-[#F2EFE9]">
            {closedPadded}
          </p>
          <p className="mt-1.5 text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
            {metrics.winningTrades} thắng · {metrics.losingTrades} thua
            {metrics.breakevenTrades > 0 ? ` · ${metrics.breakevenTrades} hòa` : ''}
          </p>
        </div>

        {/* KPI 4: Tỷ lệ thắng */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">
              Tỷ lệ thắng
            </span>
            <Target className="w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] shrink-0" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold font-mono-num tracking-tight text-[#1C1B18] dark:text-[#F2EFE9]">
            {metrics.winRate !== null ? `${metrics.winRate.toFixed(1)}%` : '—'}
          </p>
          <p className="mt-1.5 text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
            {metrics.winningTrades}/{metrics.closedTrades} lệnh thắng
          </p>
        </div>

        {/* KPI 5: Hệ số lợi nhuận */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">
              Hệ số lợi nhuận
            </span>
            <Scale className="w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] shrink-0" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold font-mono-num tracking-tight text-[#1C1B18] dark:text-[#F2EFE9]">
            {metrics.profitFactorInfinite
              ? '—'
              : metrics.profitFactor !== null
                ? metrics.profitFactor.toFixed(2)
                : '—'}
          </p>
          {!metrics.profitFactorInfinite && metrics.expectancy !== null && (
            <p className="mt-1.5 text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
              Kỳ vọng {formatUsd(metrics.expectancy)} / lệnh
            </p>
          )}
        </div>
      </div>

      {/* Row 2: Diễn biến số dư (7 ngày) + Hiệu suất theo sản phẩm & Nghiên cứu */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
              Diễn biến số dư tài khoản
            </h3>
            <span className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
              {BALANCE_WINDOW_DAYS} ngày gần nhất
            </span>
          </div>

          <div className="h-64 w-full">
            {hasBalanceData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceWindow} margin={{ top: 18, right: 24, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C96442" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#C96442" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,115,105,0.16)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    padding={{ left: 20, right: 20 }}
                  />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${v}`}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: colors.tooltipBg,
                      border: `1px solid ${colors.tooltipBorder}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#F2EFE9',
                    }}
                    labelStyle={{ color: '#F2EFE9' }}
                    formatter={(val: unknown) => [formatUsd(Number(val), false), 'Số dư']}
                    labelFormatter={(_label, payload) => {
                      const date = payload?.[0]?.payload?.date as string | undefined;
                      return date ? formatIsoDisplay(date) : '';
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#C96442"
                    strokeWidth={2.2}
                    fill="url(#balanceGradient)"
                    connectNulls
                    dot={renderBalanceDot}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#6B6963] dark:text-[#A6A39B]">
                Chưa có số dư trong {BALANCE_WINDOW_DAYS} ngày gần nhất.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Hiệu suất theo sản phẩm */}
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex-1">
            <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
              Hiệu suất theo sản phẩm
            </h3>

            <div className="mt-4 space-y-3.5">
              {metrics.bySymbol.map((item) => {
                const val = Number(item.netPL);
                const widthPct = Math.max(8, Math.round((Math.abs(val) / maxAbsSymbolPL) * 100));
                return (
                  <div key={item.symbol} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
                        {item.symbol}
                      </span>
                      <span className={`font-mono-num font-semibold ${pnlTextClass(val)}`}>
                        {formatUsd(item.netPL)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#F3F1EC] dark:bg-[#181715] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pnlBarClass(val)}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                      {item.trades} giao dịch · Win {item.winRate}%
                    </p>
                  </div>
                );
              })}
              {metrics.bySymbol.length === 0 && (
                <p className="text-xs text-[#6B6963] dark:text-[#A6A39B] py-2">
                  Chưa có giao dịch đã đóng.
                </p>
              )}
            </div>
          </div>

          {/* Nghiên cứu hành vi giá */}
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                Nghiên cứu hành vi giá
              </h3>

              <dl className="mt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70">
                  <dt className="text-[#6B6963] dark:text-[#A6A39B]">Số mẫu quan sát</dt>
                  <dd className="font-mono-num font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                    {dataset.observations.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-1">
                  <dt className="text-[#6B6963] dark:text-[#A6A39B]">Tổ hợp hành vi lặp lại</dt>
                  <dd className="font-mono-num font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                    {uniqueHabitCount}
                  </dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('research')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1C1B18] dark:bg-[#F2EFE9] text-white dark:text-[#1C1B18] px-4 py-2.5 text-xs font-medium hover:opacity-90 transition-opacity min-h-[40px] w-full sm:w-auto self-start whitespace-nowrap"
            >
              <span>Mở sổ nghiên cứu giá</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Lịch lãi / lỗ theo ngày */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9] mb-4">
          Lịch giao dịch
        </h3>
        <MonthCalendar
          year={calYear}
          month={calMonth}
          onMonthChange={(y, m) => {
            setCalYear(y);
            setCalMonth(m);
          }}
          summary={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[#6B6963] dark:text-[#A6A39B]">
                {monthSummary.days} ngày giao dịch
              </span>
              <span className={`font-semibold ${pnlTextClass(monthSummary.net)}`}>
                {formatUsd(monthSummary.net)}
              </span>
            </span>
          }
          getTone={(iso): CalendarTone | null => {
            const stat = dayStats.get(iso);
            if (!stat) return null;
            return stat.net > 0 ? 'win' : stat.net < 0 ? 'loss' : 'neutral';
          }}
          isClickable={(iso) => dayStats.has(iso)}
          onDayClick={onOpenDiaryDay}
          renderDay={(iso) => {
            const stat = dayStats.get(iso);
            if (!stat) return null;
            return (
              <>
                <span
                  className={`mt-auto font-mono-num font-semibold text-[10px] sm:text-sm leading-tight whitespace-nowrap ${pnlTextClass(
                    stat.net,
                  )}`}
                >
                  <span className="sm:hidden">
                    {formatCompactMoney(stat.net, Math.abs(stat.net) >= 100)}
                  </span>
                  <span className="hidden sm:inline">{formatCompactMoney(stat.net)}</span>
                </span>
                <span className="hidden sm:block text-[10px] text-[#6B6963] dark:text-[#A6A39B]">
                  {stat.count} lệnh
                </span>
              </>
            );
          }}
        />
      </div>
    </div>
  );
};
