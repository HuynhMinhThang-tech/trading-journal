import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useIsDark } from '../hooks/useIsDark.ts';
import { chartColors, chartTooltipProps } from '../lib/pnl.ts';
import type { MetricsSummary } from '../shared/types.ts';

interface AnalyticsViewProps {
  metrics: MetricsSummary;
  onNavigateSettings?: () => void;
}

function formatMoney(val: string | number | null): string {
  if (val === null) return 'Chưa có';
  const num = typeof val === 'string' ? Number(val) : val;
  if (Number.isNaN(num)) return '$0.00';
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  metrics,
  onNavigateSettings,
}) => {
  const [timeScale, setTimeScale] = useState<'day' | 'week' | 'month'>('day');
  const isDark = useIsDark();
  const colors = chartColors(isDark);
  const axisTick = { fontSize: 11, fill: colors.axis };
  const tooltip = chartTooltipProps(colors);

  const symbolChartData = metrics.bySymbol.map((s) => ({
    symbol: s.symbol,
    netPL: Number(s.netPL),
    trades: s.trades,
  }));

  const timeSeriesRows =
    timeScale === 'day'
      ? metrics.byDay.map((d) => ({
          label: d.date,
          trades: d.trades,
          winRate: d.trades > 0 ? Number(((d.wins / d.trades) * 100).toFixed(1)) : 0,
          netPL: d.netPL,
        }))
      : timeScale === 'week'
        ? metrics.byWeek.map((w) => ({
            label: w.week,
            trades: w.trades,
            winRate: w.winRate,
            netPL: w.netPL,
          }))
        : metrics.byMonth.map((m) => ({
            label: m.month,
            trades: m.trades,
            winRate: m.winRate,
            netPL: m.netPL,
          }));

  return (
    <div className="space-y-5">
      {/* Core Quantitative Grid (Complementary to Overview) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Kỳ vọng toán học (Expectancy)</p>
          <p
            className={`mt-1.5 text-xl font-semibold font-mono-num ${
              metrics.expectancy !== null && Number(metrics.expectancy) > 0
                ? 'text-win'
                : metrics.expectancy !== null && Number(metrics.expectancy) < 0
                  ? 'text-loss'
                  : ''
            }`}
          >
            {metrics.expectancy !== null ? `${formatMoney(metrics.expectancy)}/lệnh` : 'Chưa đủ mẫu'}
          </p>
          <p className="mt-1 text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
            Lãi gộp +${metrics.grossProfit} · Lỗ gộp -${metrics.grossLoss}
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Lãi TB / Lỗ TB mỗi lệnh</p>
          <p className="mt-1.5 text-xl font-semibold font-mono-num">
            <span className="text-win">
              {metrics.averageWin ? `+$${metrics.averageWin}` : '—'}
            </span>
            <span className="mx-1.5 text-[#55534D]">/</span>
            <span className="text-loss">
              {metrics.averageLoss ? `-$${metrics.averageLoss}` : '—'}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Chuỗi thắng / thua tối đa</p>
          <p className="mt-1.5 text-xl font-semibold font-mono-num">
            {metrics.maxConsecutiveWins} / {metrics.maxConsecutiveLosses}
          </p>
          <p className="mt-1 text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
            Giữ TB: Thắng {metrics.avgWinHoldingMinutes ?? '—'}p · Thua {metrics.avgLossHoldingMinutes ?? '—'}p
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Phí & Swap lũy kế</p>
          <p className="mt-1.5 text-xl font-semibold font-mono-num">
            {formatMoney(Number(metrics.totalCommission) + Number(metrics.totalSwap))}
          </p>
          <p className="mt-1 text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
            Comm {metrics.totalCommission} · Swap {metrics.totalSwap}
          </p>
        </div>
      </div>

      {/* Buy vs Sell Side Comparison */}
      {metrics.bySide.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {metrics.bySide.map((s) => (
            <div
              key={s.side}
              className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-5 py-3.5 flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                  {s.side === 'BUY' ? 'Hiệu suất chiều MUA (Buy)' : 'Hiệu suất chiều BÁN (Sell)'}
                </p>
                <p className="text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6] mt-0.5">
                  n={s.trades} lệnh · Thắng {s.wins} · Win Rate {s.winRate}%
                </p>
              </div>
              <span
                className={`text-base font-mono-num font-semibold ${
                  Number(s.netPL) > 0
                    ? 'text-win'
                    : Number(s.netPL) < 0
                      ? 'text-loss'
                      : ''
                }`}
              >
                {formatMoney(s.netPL)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Charts: P/L by Symbol + Win/Loss Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <h3 className="text-sm font-semibold mb-4">Net P/L theo Mã giao dịch</h3>
          <div className="h-56 w-full">
            {symbolChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={symbolChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,115,105,0.18)" vertical={false} />
                  <XAxis dataKey="symbol" tick={{ fontSize: 12, fill: colors.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    {...tooltip}
                    cursor={{ fill: colors.barCursor }}
                    formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, 'Net P/L']}
                  />
                  <Bar dataKey="netPL" radius={[6, 6, 0, 0]}>
                    {symbolChartData.map((entry) => (
                      <Cell key={entry.symbol} fill={entry.netPL >= 0 ? colors.win : colors.loss} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#55534D]">
                Chưa có dữ liệu lệnh đã đóng.
              </div>
            )}
          </div>
        </div>

        {/* Win/Loss Distribution */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <h3 className="text-sm font-semibold mb-4">Phân bố mức Lãi / Lỗ (Win/Loss Distribution)</h3>
          <div className="h-56 w-full">
            {metrics.closedTrades > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.winLossDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,115,105,0.18)" vertical={false} />
                  <XAxis dataKey="bucket" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltip}
                    cursor={{ fill: colors.barCursor }}
                    formatter={(v: unknown) => [`${v} lệnh`, 'Số lượng']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {metrics.winLossDistribution.map((b) => (
                      <Cell key={b.bucket} fill={b.isWin ? colors.win : colors.loss} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#55534D]">
                Chưa có dữ liệu phân bố.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Time Comparison: Day / Week / Month + Holding Time Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold">Hiệu suất theo Ngày / Tuần / Tháng</h3>
            <select
              value={timeScale}
              onChange={(e) => setTimeScale(e.target.value as 'day' | 'week' | 'month')}
              aria-label="Chu kỳ thời gian"
              className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-1.5 text-xs font-medium min-h-[34px]"
            >
              <option value="day">Theo ngày</option>
              <option value="week">Theo tuần</option>
              <option value="month">Theo tháng</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#55534D] dark:text-[#C2BFB6]">
                  <th className="py-2 font-medium">Khoảng thời gian</th>
                  <th className="py-2 font-medium text-right">Mẫu (n)</th>
                  <th className="py-2 font-medium text-right">Win Rate</th>
                  <th className="py-2 font-medium text-right">Net P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70">
                {timeSeriesRows.map((r) => (
                  <tr key={r.label}>
                    <td className="py-2 font-mono-num font-medium">{r.label}</td>
                    <td className="py-2 text-right font-mono-num">n={r.trades}</td>
                    <td className="py-2 text-right font-mono-num">{r.winRate}%</td>
                    <td
                      className={`py-2 text-right font-mono-num font-semibold ${
                        Number(r.netPL) >= 0
                          ? 'text-win'
                          : 'text-loss'
                      }`}
                    >
                      {formatMoney(r.netPL)}
                    </td>
                  </tr>
                ))}
                {timeSeriesRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#55534D]">
                      Chưa có dữ liệu theo thời gian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Holding Time Analysis */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <h3 className="text-sm font-semibold mb-1">Phân tích thời gian giữ lệnh (Holding Time)</h3>
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6] mb-3">
            Trung bình toàn bộ: {metrics.avgHoldingMinutes ?? '—'} phút · Thắng: {metrics.avgWinHoldingMinutes ?? '—'}p · Thua: {metrics.avgLossHoldingMinutes ?? '—'}p
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#55534D] dark:text-[#C2BFB6]">
                  <th className="py-2 font-medium">Khoảng giữ lệnh</th>
                  <th className="py-2 font-medium text-right">Mẫu (n)</th>
                  <th className="py-2 font-medium text-right">Win Rate</th>
                  <th className="py-2 font-medium text-right">Net P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70">
                {metrics.holdingTimeBuckets.map((b) => (
                  <tr key={b.bucket}>
                    <td className="py-2 font-medium">{b.bucket}</td>
                    <td className="py-2 text-right font-mono-num">n={b.trades}</td>
                    <td className="py-2 text-right font-mono-num">{b.winRate}%</td>
                    <td
                      className={`py-2 text-right font-mono-num font-semibold ${
                        Number(b.netPL) >= 0
                          ? 'text-win'
                          : 'text-loss'
                      }`}
                    >
                      {formatMoney(b.netPL)}
                    </td>
                  </tr>
                ))}
                {metrics.holdingTimeBuckets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#55534D]">
                      Chưa có dữ liệu thời gian giữ lệnh.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Session Analysis + Strategy + Mistake Tags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Session Breakdown */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <h3 className="text-sm font-semibold mb-1">Hiệu suất theo Phiên (Á / Âu / Mỹ)</h3>
          {!metrics.sessionAnalysisAvailable ? (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 p-3 text-xs space-y-2">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{metrics.sessionWarning}</span>
              </div>
              {onNavigateSettings && (
                <button
                  type="button"
                  onClick={onNavigateSettings}
                  className="text-xs font-medium text-[#C96442] underline underline-offset-4"
                >
                  Cấu hình múi giờ sàn trong Cài đặt
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-xs">
              {metrics.bySession.map((s) => (
                <div
                  key={s.session}
                  className="flex items-center justify-between py-2 border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70 last:border-none"
                >
                  <div>
                    <div className="font-medium">{s.session}</div>
                    <div className="font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
                      n={s.trades} · Win {s.winRate}%
                    </div>
                  </div>
                  <span
                    className={`font-mono-num font-semibold ${
                      Number(s.netPL) >= 0
                        ? 'text-win'
                        : 'text-loss'
                    }`}
                  >
                    {formatMoney(s.netPL)}
                  </span>
                </div>
              ))}
              {metrics.bySession.length === 0 && (
                <p className="text-[#55534D] py-4">Chưa có lệnh trong bộ lọc.</p>
              )}
            </div>
          )}
        </div>

        {/* By Strategy */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <h3 className="text-sm font-semibold mb-3">Theo Chiến lược / Setup</h3>
          <div className="space-y-2 text-xs">
            {metrics.byStrategy.map((s) => (
              <div
                key={s.strategy}
                className="flex items-center justify-between py-2 border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70 last:border-none"
              >
                <div>
                  <div className="font-medium">{s.strategy}</div>
                  <div className="font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
                    n={s.trades} · Win {s.winRate}%
                  </div>
                </div>
                <span
                  className={`font-mono-num font-semibold ${
                    Number(s.netPL) >= 0
                      ? 'text-win'
                      : 'text-loss'
                  }`}
                >
                  {formatMoney(s.netPL)}
                </span>
              </div>
            ))}
            {metrics.byStrategy.length === 0 && (
              <p className="text-[#55534D] py-4">Chưa có dữ liệu.</p>
            )}
          </div>
        </div>

        {/* By Mistake Tags */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <h3 className="text-sm font-semibold mb-3">Chi phí theo Thẻ lỗi sai</h3>
          <div className="space-y-2 text-xs">
            {metrics.byMistakeTag.map((m) => (
              <div
                key={m.tag}
                className="flex items-center justify-between py-2 border-b border-[#E7E5E0]/70 dark:border-[#32302B]/70 last:border-none"
              >
                <div>
                  <div className="font-medium">{m.tag}</div>
                  <div className="font-mono-num text-[#55534D] dark:text-[#C2BFB6]">n={m.trades}</div>
                </div>
                <span
                  className={`font-mono-num font-semibold ${
                    Number(m.netPL) >= 0
                      ? 'text-win'
                      : 'text-loss'
                  }`}
                >
                  {formatMoney(m.netPL)}
                </span>
              </div>
            ))}
            {metrics.byMistakeTag.length === 0 && (
              <p className="text-[#55534D] py-4">Chưa gắn thẻ lỗi sai nào trong Nhật ký.</p>
            )}
          </div>
        </div>
      </div>

      {/* Explicit Data Limitations Dictionary */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <h3 className="text-sm font-semibold mb-3">Chỉ số nâng cao</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed text-[#55534D] dark:text-[#C2BFB6]">
          <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3.5 border border-[#E7E5E0] dark:border-[#32302B]">
            <p className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">R-Multiple</p>
            <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">Chưa đủ dữ liệu</p>
          </div>
          <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3.5 border border-[#E7E5E0] dark:border-[#32302B]">
            <p className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">MAE / MFE</p>
            <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">Chưa đủ dữ liệu</p>
          </div>
          <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3.5 border border-[#E7E5E0] dark:border-[#32302B]">
            <p className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">Max Drawdown ngày</p>
            <p className="mt-1 font-mono-num font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
              -${metrics.maxObservedDailyDrawdown}
              {metrics.maxObservedDailyDrawdownPct !== null
                ? ` (${metrics.maxObservedDailyDrawdownPct}%)`
                : ''}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
