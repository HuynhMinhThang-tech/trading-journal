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
import { ChevronRight } from 'lucide-react';
import { BottomSheet } from './ui/BottomSheet.tsx';
import { SegmentedControl } from './ui/controls.tsx';
import { useIsDark } from '../hooks/useIsDark.ts';
import { useIsMobile } from '../hooks/useMediaQuery.ts';
import { formatAxisUsd, formatUsd } from '../lib/format.ts';
import { chartColors, chartTooltipProps } from '../lib/pnl.ts';
import type { MetricsSummary } from '../shared/types.ts';

interface AnalyticsViewProps {
  metrics: MetricsSummary;
}

function formatMoney(val: string | number | null): string {
  if (val === null) return 'Chưa có';
  return formatUsd(val);
}

const PREVIEW_ROWS = 6;

interface MetricListRowProps {
  label: React.ReactNode;
  trades: number;
  winRate: number;
  netPL: string;
  mono?: boolean;
}

/** Một dòng của bảng số liệu, dạng danh sách cho điện thoại (không phải kéo ngang). */
const MetricListRow: React.FC<MetricListRowProps> = ({ label, trades, winRate, netPL, mono = false }) => (
  <li className="flex items-center justify-between gap-3 py-3">
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${mono ? 'font-mono-num' : ''}`}>{label}</p>
      <p className="mt-0.5 font-mono-num text-[11px] text-[#55534D] dark:text-[#C2BFB6]">
        n={trades} · Win {winRate}%
      </p>
    </div>
    <span
      className={`shrink-0 font-mono-num text-sm font-bold ${Number(netPL) >= 0 ? 'text-win' : 'text-loss'}`}
    >
      {formatMoney(netPL)}
    </span>
  </li>
);

const LIST_CLASS = 'divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70';

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  metrics,
}) => {
  const [timeScale, setTimeScale] = useState<'day' | 'week' | 'month'>('day');
  const [showAllPeriods, setShowAllPeriods] = useState(false);
  const isMobile = useIsMobile();
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

  // Điện thoại: mới nhất lên đầu, chỉ hiện vài dòng đầu, phần còn lại mở trong panel
  const recentRows = [...timeSeriesRows].reverse();
  const scaleLabel = timeScale === 'day' ? 'ngày' : timeScale === 'week' ? 'tuần' : 'tháng';

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Core Quantitative Grid (Complementary to Overview) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="col-span-2 lg:col-span-1 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Kỳ vọng toán học (Expectancy)</p>
          <p
            className={`mt-1.5 text-lg lg:text-xl font-semibold font-mono-num ${
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
            Lãi gộp {formatUsd(metrics.grossProfit)} · Lỗ gộp {formatUsd(-Number(metrics.grossLoss))}
          </p>
        </div>

        <div className="col-span-2 lg:col-span-1 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Lãi TB / Lỗ TB mỗi lệnh</p>
          <p className="mt-1.5 text-lg lg:text-xl font-semibold font-mono-num">
            <span className="text-win">
              {metrics.averageWin !== null ? formatUsd(metrics.averageWin) : '—'}
            </span>
            <span className="mx-1.5 text-[#55534D]">/</span>
            <span className="text-loss">
              {metrics.averageLoss !== null ? formatUsd(-Number(metrics.averageLoss)) : '—'}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Chuỗi thắng / thua tối đa</p>
          <p className="mt-1.5 text-lg lg:text-xl font-semibold font-mono-num">
            {metrics.maxConsecutiveWins} / {metrics.maxConsecutiveLosses}
          </p>
          <p className="mt-1 text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
            Giữ TB: Thắng {metrics.avgWinHoldingMinutes ?? '—'}p · Thua {metrics.avgLossHoldingMinutes ?? '—'}p
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4">
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6]">Phí & Swap lũy kế</p>
          <p className="mt-1.5 text-lg lg:text-xl font-semibold font-mono-num">
            {formatMoney(Number(metrics.totalCommission) + Number(metrics.totalSwap))}
          </p>
          <p className="mt-1 text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6]">
            Comm {formatUsd(metrics.totalCommission, false)} · Swap {formatUsd(metrics.totalSwap, false)}
          </p>
        </div>
      </div>

      {/* Buy vs Sell Side Comparison */}
      {metrics.bySide.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:gap-4">
          {metrics.bySide.map((s) => (
            <div
              key={s.side}
              className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-4 py-3.5 lg:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-1.5 lg:gap-4"
            >
              <div>
                <p className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                  <span className="lg:hidden">{s.side === 'BUY' ? 'Chiều MUA' : 'Chiều BÁN'}</span>
                  <span className="hidden lg:inline">
                    {s.side === 'BUY' ? 'Hiệu suất chiều MUA (Buy)' : 'Hiệu suất chiều BÁN (Sell)'}
                  </span>
                </p>
                <p className="text-xs font-mono-num text-[#55534D] dark:text-[#C2BFB6] mt-0.5">
                  n={s.trades} · Thắng {s.wins} · {s.winRate}%
                </p>
              </div>
              <span
                className={`text-base font-mono-num font-bold ${
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-4">Net P/L theo Mã giao dịch</h3>
          <div className="h-56 w-full">
            {symbolChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={symbolChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,115,105,0.18)" vertical={false} />
                  <XAxis dataKey="symbol" tick={{ fontSize: 12, fill: colors.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => formatAxisUsd(v)} />
                  <Tooltip
                    {...tooltip}
                    cursor={{ fill: colors.barCursor }}
                    formatter={(v: unknown) => [formatUsd(Number(v)), 'Net P/L']}
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
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3">Hiệu suất theo Ngày / Tuần / Tháng</h3>
          <SegmentedControl
            ariaLabel="Chu kỳ thời gian"
            value={timeScale}
            onChange={(v) => setTimeScale(v)}
            className="mb-3"
            options={[
              { id: 'day', label: 'Ngày' },
              { id: 'week', label: 'Tuần' },
              { id: 'month', label: 'Tháng' },
            ]}
          />

          {isMobile ? (
            <>
              {timeSeriesRows.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#55534D] dark:text-[#C2BFB6]">
                  Chưa có dữ liệu theo thời gian.
                </p>
              ) : (
                <ul className={LIST_CLASS}>
                  {recentRows.slice(0, PREVIEW_ROWS).map((r) => (
                    <MetricListRow key={r.label} label={r.label} trades={r.trades} winRate={r.winRate} netPL={r.netPL} mono />
                  ))}
                </ul>
              )}
              {recentRows.length > PREVIEW_ROWS && (
                <button
                  type="button"
                  onClick={() => setShowAllPeriods(true)}
                  className="press mt-2 flex min-h-[46px] w-full items-center justify-center gap-1 rounded-xl border border-[#E7E5E0] bg-[#FAF9F5] text-sm font-semibold dark:border-[#32302B] dark:bg-[#181715]"
                >
                  Xem tất cả {recentRows.length} {scaleLabel}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
              <BottomSheet
                open={showAllPeriods}
                onClose={() => setShowAllPeriods(false)}
                title={`Hiệu suất theo ${scaleLabel}`}
                subtitle={`${recentRows.length} mục · mới nhất trước`}
              >
                <ul className={LIST_CLASS}>
                  {recentRows.map((r) => (
                    <MetricListRow key={r.label} label={r.label} trades={r.trades} winRate={r.winRate} netPL={r.netPL} mono />
                  ))}
                </ul>
              </BottomSheet>
            </>
          ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#55534D] dark:text-[#C2BFB6] [&_th]:sticky [&_th]:top-0 [&_th]:bg-white dark:[&_th]:bg-[#22211E]">
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
          )}
        </div>

        {/* Holding Time Analysis */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-1">Phân tích thời gian giữ lệnh (Holding Time)</h3>
          <p className="text-xs text-[#55534D] dark:text-[#C2BFB6] mb-3">
            Trung bình toàn bộ: {metrics.avgHoldingMinutes ?? '—'} phút · Thắng: {metrics.avgWinHoldingMinutes ?? '—'}p · Thua: {metrics.avgLossHoldingMinutes ?? '—'}p
          </p>
          {isMobile ? (
            metrics.holdingTimeBuckets.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#55534D] dark:text-[#C2BFB6]">
                Chưa có dữ liệu thời gian giữ lệnh.
              </p>
            ) : (
              <ul className={LIST_CLASS}>
                {metrics.holdingTimeBuckets.map((b) => (
                  <MetricListRow key={b.bucket} label={b.bucket} trades={b.trades} winRate={b.winRate} netPL={b.netPL} />
                ))}
              </ul>
            )
          ) : (
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
          )}
        </div>
      </div>

      {/* Session Analysis + Strategy + Mistake Tags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
        {/* Session Breakdown */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-1">Hiệu suất theo Phiên (Á / Âu / Mỹ)</h3>
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
        </div>

        {/* By Strategy */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
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
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
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
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-4 sm:p-5">
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
              {formatUsd(-Number(metrics.maxObservedDailyDrawdown))}
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
