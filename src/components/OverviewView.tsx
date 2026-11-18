import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ArrowUpRight, CircleDollarSign, Mail, Scale, Target, Upload } from 'lucide-react';
import type {
  AccountSnapshotRecord,
  MetricsSummary,
  TradeRecord,
  WorkspaceDataset,
} from '../shared/types.ts';

interface OverviewViewProps {
  dataset: WorkspaceDataset;
  trades: TradeRecord[];
  snapshots: AccountSnapshotRecord[];
  metrics: MetricsSummary;
  onNavigate: (tab: string) => void;
}

function formatUsd(val: string | number, signed = true): string {
  const num = typeof val === 'string' ? Number(val) : val;
  if (Number.isNaN(num)) return '$0.00';
  const absFormatted = Math.abs(num).toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `${absFormatted} US$`;
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}${absFormatted} US$`;
}

function formatPrice(raw: string | null): string {
  if (!raw) return '—';
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  return num.toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseRawTimestampMs(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const dt = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
  );
  return dt.getTime();
}

function formatExactHoldingDuration(openRaw: string, closeRaw: string | null, fallbackMinutes: number | null): string {
  const start = parseRawTimestampMs(openRaw);
  const end = parseRawTimestampMs(closeRaw);
  if (start !== null && end !== null && end >= start) {
    const totalSec = Math.floor((end - start) / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
    }
    if (mins > 0) {
      return secs > 0 ? `${mins} phút ${secs} giây` : `${mins} phút`;
    }
    return `${secs} giây`;
  }
  if (fallbackMinutes !== null) {
    return `${fallbackMinutes} phút`;
  }
  return '—';
}

function formatDateTimeDisplay(raw: string): string {
  const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]} · ${m[4]}`;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  dataset,
  trades,
  snapshots,
  metrics,
  onNavigate,
}) => {
  const latestSnapshot =
    snapshots[snapshots.length - 1] ?? dataset.snapshots[dataset.snapshots.length - 1] ?? null;

  const recentTrades = useMemo(() => {
    return [...trades]
      .sort((a, b) => (b.closeTimeRaw ?? b.openTimeRaw).localeCompare(a.closeTimeRaw ?? a.openTimeRaw))
      .slice(0, 6);
  }, [trades]);

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

  if (dataset.imports.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-6 sm:p-8">
          <p className="text-xs font-medium text-[#C96442] tracking-wide">
            Chưa có dữ liệu báo cáo cuối ngày
          </p>
          <h2 className="mt-2 text-xl sm:text-2xl font-semibold text-[#1C1B18] dark:text-[#F2EFE9] text-balance">
            Kết nối Gmail hoặc nhập email Daily Confirmation đầu tiên
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6B6963] dark:text-[#A6A39B]">
            Đây là sổ nhật ký ghi nhận lại các giao dịch đã hoàn tất và quan sát hành động giá cá nhân. Mỗi ngày vào 23:59 (giờ sàn), khi phát sinh giao dịch, sàn sẽ gửi email{' '}
            <span className="font-medium text-[#1C1B18] dark:text-[#F2EFE9]">Daily Confirmation</span>{' '}
            vào Gmail của bạn — ứng dụng sẽ đọc lại báo cáo đó để tổng hợp số liệu và rút kinh nghiệm.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('sync_settings')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C96442] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B55535] transition-colors min-h-[44px]"
            >
              <Mail className="w-4 h-4" />
              <span>Đồng bộ Gmail / Nhập báo cáo</span>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
            <p className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">01. Nhật ký sau phiên</p>
            <p className="mt-1.5 text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
              Ghi nhận từ báo cáo đã chốt cuối ngày
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#6B6963] dark:text-[#A6A39B]">
              Ngày không có email xác nhận được hiểu là không phát sinh giao dịch hoặc chưa nhập báo cáo, không tạo số liệu giả.
            </p>
          </div>
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
            <p className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">02. Rút kinh nghiệm cá nhân</p>
            <p className="mt-1.5 text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
              Lưu lại setup, tâm lý và bài học
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#6B6963] dark:text-[#A6A39B]">
              Các lệnh đã hoàn tất được tổng hợp vào Nhật ký giao dịch để bạn tự đánh giá kỷ luật và sai sót.
            </p>
          </div>
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
            <p className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">03. Quan sát đã ghi nhận</p>
            <p className="mt-1.5 text-sm font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
              <span className="font-mono-num">{dataset.observations.length}</span> bản ghi hành động giá
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#6B6963] dark:text-[#A6A39B]">
              Bạn có thể ghi nhận ngay các hành vi nến theo phiên Á/Âu/Mỹ để tích lũy dữ liệu thói quen giá.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const netPlNum = Number(metrics.netPL);
  const closedPadded = String(metrics.closedTrades).padStart(2, '0');
  const isSmallSample = metrics.closedTrades > 0 && metrics.closedTrades < 10;

  return (
    <div className="space-y-5">
      {/* Row 1: 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Lãi / lỗ ròng đã chốt */}
        <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#6B6963] dark:text-[#A6A39B]">
              Lãi / lỗ ròng đã chốt
            </span>
            <CircleDollarSign className="w-4 h-4 text-[#6B6963] dark:text-[#A6A39B] shrink-0" />
          </div>
          <p
            className={`mt-2.5 text-2xl font-semibold font-mono-num tracking-tight ${
              netPlNum > 0
                ? 'text-[#15803D] dark:text-[#4ADE80]'
                : netPlNum < 0
                  ? 'text-[#B91C1C] dark:text-[#F87171]'
                  : 'text-[#1C1B18] dark:text-[#F2EFE9]'
            }`}
          >
            {formatUsd(metrics.netPL)}
          </p>
          <p className="mt-1.5 text-xs text-[#6B6963] dark:text-[#A6A39B]">
            <span className="font-mono-num">{metrics.closedTrades}</span> giao dịch hoàn tất
          </p>
        </div>

        {/* KPI 2: Số giao dịch đã đóng */}
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

        {/* KPI 3: Tỷ lệ thắng */}
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
          <p className="mt-1.5 text-xs text-[#6B6963] dark:text-[#A6A39B]">
            {metrics.closedTrades === 0
              ? 'Chưa có giao dịch hoàn tất'
              : isSmallSample
                ? 'Mẫu còn nhỏ · chỉ mang tính mô tả'
                : 'Tính trên các giao dịch đã đóng'}
          </p>
        </div>

        {/* KPI 4: Hệ số lợi nhuận */}
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
          <p className="mt-1.5 text-xs text-[#6B6963] dark:text-[#A6A39B]">
            {metrics.profitFactorInfinite
              ? 'Chưa xác định khi tổng lỗ bằng 0'
              : metrics.expectancy !== null
                ? `Kỳ vọng ${formatUsd(metrics.expectancy)} / lệnh`
                : 'Chưa đủ dữ liệu tính toán'}
          </p>
        </div>
      </div>

      {/* Row 2: Account Balance Evolution (Left 2/3) + Product Performance & Research Summary (Right 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Left: Diễn biến số dư tài khoản */}
        <div className="lg:col-span-2 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                Diễn biến số dư tài khoản
              </h3>
              <p className="text-xs text-[#6B6963] dark:text-[#A6A39B] mt-0.5">
                Các mốc số dư từ sao kê, không phải đường Equity trong ngày
              </p>
            </div>
            {latestSnapshot && (
              <span className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                {latestSnapshot.reportTimestampRaw}
              </span>
            )}
          </div>

          <div className="h-64 w-full">
            {metrics.equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.equityCurve} margin={{ top: 18, right: 24, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C96442" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#C96442" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,115,105,0.16)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#6B6963' }}
                    axisLine={false}
                    tickLine={false}
                    padding={{ left: 20, right: 20 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6B6963' }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${v}`}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1B18',
                      border: '1px solid #32302B',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#F2EFE9',
                    }}
                    formatter={(val: unknown, name: unknown) => [
                      formatUsd(Number(val), false),
                      name === 'balance' ? 'Số dư (Balance)' : 'Equity',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#C96442"
                    strokeWidth={2.2}
                    fill="url(#balanceGradient)"
                    dot={{ r: 4, fill: '#C96442', stroke: '#FFFFFF', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#6B6963]">
                Chưa có mốc số dư trong khoảng thời gian đang chọn.
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#E7E5E0]/70 dark:border-[#32302B]/70 flex items-center justify-between text-xs text-[#6B6963] dark:text-[#A6A39B]">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-0.5 bg-[#C96442]" aria-hidden="true" />
              <span>Mốc Balance / Equity</span>
            </span>
            <span className="font-mono-num">{snapshots.length} bản sao kê</span>
          </div>
        </div>

        {/* Right: Stacked 2 Cards (Hiệu suất theo sản phẩm + Nghiên cứu hành vi giá) */}
        <div className="flex flex-col gap-4">
          {/* Card A: Hiệu suất theo sản phẩm */}
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex-1 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                Hiệu suất theo sản phẩm
              </h3>
              <p className="text-xs text-[#6B6963] dark:text-[#A6A39B] mt-0.5">
                Lãi / lỗ ròng đã thực hiện, nhóm theo mã giao dịch
              </p>

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
                        <span
                          className={`font-mono-num font-semibold ${
                            val > 0
                              ? 'text-[#15803D] dark:text-[#4ADE80]'
                              : val < 0
                                ? 'text-[#B91C1C] dark:text-[#F87171]'
                                : ''
                          }`}
                        >
                          {formatUsd(item.netPL)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#F3F1EC] dark:bg-[#181715] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            val >= 0 ? 'bg-[#C96442]' : 'bg-[#B91C1C]'
                          }`}
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
                  <p className="text-xs text-[#6B6963] py-2">Chưa có giao dịch đã đóng.</p>
                )}
              </div>
            </div>

            {isSmallSample && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Mẫu dữ liệu còn ít: chưa nên kết luận về lợi thế giao dịch dài hạn.
              </div>
            )}
          </div>

          {/* Card B: Nghiên cứu hành vi giá */}
          <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
                Nghiên cứu hành vi giá
              </h3>
              <p className="text-xs text-[#6B6963] dark:text-[#A6A39B] mt-0.5 font-mono-num">
                {dataset.observations.length} quan sát đã ghi nhận
              </p>

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

      {/* Row 3: Full-Width Recent Trades Table */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">
              Giao dịch gần đây
            </h3>
            <p className="text-xs text-[#6B6963] dark:text-[#A6A39B] mt-0.5">
              Giao dịch được ghép từ các Deal vào và ra từ báo cáo cuối ngày
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('diary')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-3.5 py-2 text-xs font-medium text-[#1C1B18] dark:text-[#F2EFE9] hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] transition-colors whitespace-nowrap min-h-[38px]"
          >
            <span>Xem toàn bộ</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#6B6963] dark:text-[#A6A39B] text-[11px] tracking-wide">
                <th className="py-2.5 pr-4 font-medium">MÃ GIAO DỊCH</th>
                <th className="py-2.5 px-3 font-medium">CHIỀU</th>
                <th className="py-2.5 px-3 font-medium">GIÁ VÀO → RA</th>
                <th className="py-2.5 px-3 font-medium text-right">KHỐI LƯỢNG</th>
                <th className="py-2.5 px-3 font-medium">THỜI GIAN GIỮ</th>
                <th className="py-2.5 px-3 font-medium text-right">LÃI / LỖ RÒNG</th>
                <th className="py-2.5 pl-3 font-medium text-right">ĐÁNH GIÁ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70">
              {recentTrades.map((t) => {
                const netNum = Number(t.netPL);
                const hasJournal = Boolean(
                  t.journal &&
                    (t.journal.strategy ||
                      t.journal.thesis ||
                      t.journal.lessonLearned ||
                      t.journal.exitReason),
                );
                const tickerShort = t.symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
                return (
                  <tr
                    key={t.id}
                    onClick={() => onNavigate('diary')}
                    className="hover:bg-[#FAF9F5] dark:hover:bg-[#181715]/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 rounded-lg bg-[#F3F1EC] dark:bg-[#181715] border border-[#E7E5E0] dark:border-[#32302B] flex items-center justify-center font-mono-num text-[11px] font-semibold text-[#6B6963] dark:text-[#A6A39B] shrink-0">
                          {tickerShort}
                        </span>
                        <div>
                          <p className="font-semibold text-[#1C1B18] dark:text-[#F2EFE9]">{t.symbol}</p>
                          <p className="text-[11px] font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                            {formatDateTimeDisplay(t.openTimeRaw)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-semibold ${
                          t.side === 'BUY'
                            ? 'text-[#15803D] dark:text-[#4ADE80]'
                            : 'text-[#B91C1C] dark:text-[#F87171]'
                        }`}
                      >
                        {t.side === 'BUY' ? 'MUA' : 'BÁN'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono-num">
                      <div className="font-medium text-[#1C1B18] dark:text-[#F2EFE9]">
                        {formatPrice(t.entryPrice)}
                      </div>
                      <div className="text-[11px] text-[#6B6963] dark:text-[#A6A39B]">
                        {formatPrice(t.exitPrice)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num font-medium">
                      {Number(t.volume).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]">
                      {formatExactHoldingDuration(t.openTimeRaw, t.closeTimeRaw, t.holdingMinutes)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono-num font-semibold ${
                        netNum > 0
                          ? 'text-[#15803D] dark:text-[#4ADE80]'
                          : netNum < 0
                            ? 'text-[#B91C1C] dark:text-[#F87171]'
                            : ''
                      }`}
                    >
                      {formatUsd(t.netPL)}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <span
                        className={`text-[11px] font-medium ${
                          hasJournal
                            ? 'text-[#15803D] dark:text-[#4ADE80]'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {hasJournal ? 'ĐÃ ĐÁNH GIÁ' : 'CHỜ ĐÁNH GIÁ'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {recentTrades.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#6B6963]">
                    Chưa có giao dịch đã đóng nào trong bộ lọc hiện tại.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
