import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CandlestickChart,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { DiaryView } from './components/DiaryView.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { ResearchView } from './components/ResearchView.tsx';
import { SyncAndSettingsView } from './components/SyncAndSettingsView.tsx';
import { useSwipeTabs } from './hooks/useSwipeTabs.ts';
import { calculateMetrics } from './lib/analytics/metricsEngine.ts';
import { addDaysIso, isoFromRaw, todayIso } from './lib/dateUtils.ts';
import { toVietnamTimeDataset } from './lib/timezone.ts';
import type {
  JournalEntry,
  PriceObservation,
  ThemeMode,
  WorkspaceDataset,
} from './shared/types.ts';

type TabId = 'overview' | 'diary' | 'research' | 'analytics' | 'sync_settings';
type RangePreset = 'ALL' | '7D' | '30D' | '90D' | 'CUSTOM';

const RANGE_PRESET_OPTIONS: Array<{ id: RangePreset; label: string }> = [
  { id: 'ALL', label: 'Tất cả thời gian' },
  { id: '7D', label: '7 ngày gần nhất' },
  { id: '30D', label: '30 ngày gần nhất' },
  { id: '90D', label: '90 ngày gần nhất' },
  { id: 'CUSTOM', label: 'Tùy chọn khoảng ngày' },
];

const PRESET_DAYS: Record<'7D' | '30D' | '90D', number> = { '7D': 7, '30D': 30, '90D': 90 };

const FILTER_FIELD_CLASS =
  'rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-2.5 py-1.5 text-xs font-medium min-h-[34px]';

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: LayoutDashboard },
  { id: 'diary', label: 'Nhật ký giao dịch', mobileLabel: 'Nhật ký', icon: BookOpen },
  { id: 'research', label: 'Nghiên cứu hành động giá', mobileLabel: 'Nghiên cứu', icon: CandlestickChart },
  { id: 'analytics', label: 'Phân tích hiệu suất', mobileLabel: 'Phân tích', icon: BarChart3 },
  { id: 'sync_settings', label: 'Đồng bộ & Cài đặt', mobileLabel: 'Cài đặt', icon: SlidersHorizontal },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('tj_sidebar_collapsed') === 'true';
  });

  // Global shared filters across Overview / Diary / Analytics
  const [rangePreset, setRangePreset] = useState<RangePreset>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');

  // Ngày được chọn từ lịch Tổng quan để mở thẳng trong Nhật ký giao dịch
  const [diaryDay, setDiaryDay] = useState<string | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('tj_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const [dataset, setDataset] = useState<WorkspaceDataset | null>(null);
  // Cùng dữ liệu nhưng mọi giờ giao dịch đã đổi sang giờ Việt Nam (Cài đặt vẫn dùng `dataset` gốc).
  const vnDataset = useMemo(() => (dataset ? toVietnamTimeDataset(dataset) : null), [dataset]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('tj_theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#181715' : '#FAF9F5');
    }
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('tj_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Không thể tải dữ liệu từ máy chủ');
      }
      const data = await res.json();
      setDataset(data.dataset);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (activeTab !== 'diary') setDiaryDay(null);
  }, [activeTab]);

  const availableSymbols = useMemo(() => {
    if (!dataset) return ['ALL'];
    const set = new Set(dataset.trades.map((t) => t.symbol));
    return ['ALL', ...Array.from(set)];
  }, [dataset]);

  const applyRangePreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === 'ALL') {
      setDateFrom('');
      setDateTo('');
    } else if (preset !== 'CUSTOM') {
      const today = todayIso();
      setDateFrom(addDaysIso(today, -(PRESET_DAYS[preset] - 1)));
      setDateTo(today);
    }
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setRangePreset('CUSTOM');
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setRangePreset('CUSTOM');
  };

  const isDateInRange = useCallback(
    (iso: string) => (!dateFrom || iso >= dateFrom) && (!dateTo || iso <= dateTo),
    [dateFrom, dateTo],
  );

  const filteredTrades = useMemo(() => {
    if (!vnDataset) return [];
    return vnDataset.trades.filter((t) => {
      if (accountFilter !== 'ALL' && t.accountId !== accountFilter) return false;
      if (symbolFilter !== 'ALL' && t.symbol !== symbolFilter) return false;
      return isDateInRange(isoFromRaw(t.closeTimeRaw ?? t.openTimeRaw));
    });
  }, [vnDataset, accountFilter, symbolFilter, isDateInRange]);

  // Số dư hiển thị luôn lấy mốc mới nhất, chỉ phụ thuộc bộ lọc tài khoản (không theo khoảng ngày)
  const balanceSnapshots = useMemo(() => {
    if (!dataset) return [];
    return dataset.snapshots.filter((s) => accountFilter === 'ALL' || s.accountId === accountFilter);
  }, [dataset, accountFilter]);

  const filteredSnapshots = useMemo(
    () => balanceSnapshots.filter((s) => isDateInRange(s.reportDate)),
    [balanceSnapshots, isDateInRange],
  );

  const filteredMetrics = useMemo(() => {
    if (!vnDataset) return null;
    const unmatchedCount = vnDataset.reviewItems.filter(
      (r) => r.type === 'unmatched_deal' && r.status === 'pending',
    ).length;
    return calculateMetrics(
      filteredTrades,
      filteredSnapshots,
      unmatchedCount,
      vnDataset.accounts,
    );
  }, [vnDataset, filteredTrades, filteredSnapshots]);

  const handleSaveJournal = async (
    tradeId: string,
    payload: Omit<JournalEntry, 'id' | 'tradeId' | 'updatedAt'>,
  ) => {
    const res = await fetch(`/api/trades/${encodeURIComponent(tradeId)}/journal`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) await fetchWorkspace();
  };

  const handleCreateObservation = async (
    input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) await fetchWorkspace();
  };

  const handleUpdateObservation = async (
    id: string,
    input: Omit<PriceObservation, 'id' | 'createdAt' | 'updatedAt'>,
  ) => {
    const res = await fetch(`/api/observations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) await fetchWorkspace();
  };

  const handleDeleteObservation = async (id: string) => {
    const res = await fetch(`/api/observations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) await fetchWorkspace();
  };

  const openDiaryDay = (iso: string) => {
    setDiaryDay(iso);
    setActiveTab('diary');
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];
  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const showGlobalFilters = ['overview', 'diary', 'analytics'].includes(activeTab);

  // Vuốt ngang để chuyển panel; đổi tab thì cuộn nội dung về đầu trang.
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipeHandlers = useSwipeTabs((direction) => {
    setActiveTab((current) => {
      const index = NAV_ITEMS.findIndex((n) => n.id === current);
      const target = NAV_ITEMS[index + (direction === 'next' ? 1 : -1)];
      return target ? target.id : current;
    });
  });
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  return (
    <div className="h-dvh overflow-hidden bg-[#FAF9F5] dark:bg-[#181715] text-[#1C1B18] dark:text-[#F2EFE9] flex">
      {/* Desktop Left Sidebar (Collapsible / Expandable) */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] transition-[width] duration-200 ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64'
        }`}
      >
        <div
          className={`h-14 flex items-center border-b border-[#E7E5E0] dark:border-[#32302B] ${
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {!sidebarCollapsed && (
            <span className="text-base font-semibold tracking-tight text-[#1C1B18] dark:text-[#F2EFE9] whitespace-nowrap truncate">
              Nhật Ký Giao Dịch
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#55534D] dark:text-[#C2BFB6] hover:bg-[#F3F1EC] dark:hover:bg-[#22211E] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9] transition-colors shrink-0"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
                className={`w-full flex items-center rounded-lg text-sm transition-colors min-h-[40px] ${
                  sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3 text-left'
                } ${
                  isActive
                    ? 'bg-[#FFFFFF] dark:bg-[#22211E] text-[#1C1B18] dark:text-[#F2EFE9] font-semibold border border-[#E7E5E0] dark:border-[#32302B]'
                    : 'text-[#55534D] dark:text-[#C2BFB6] hover:bg-[#F3F1EC] dark:hover:bg-[#22211E]/60 hover:text-[#1C1B18] dark:hover:text-[#F2EFE9]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#C96442]' : 'text-[#55534D] dark:text-[#C2BFB6]'
                  }`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E7E5E0] dark:border-[#32302B] flex flex-col items-center">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Chuyển sang Giao diện Tối' : 'Chuyển sang Giao diện Sáng'}
            aria-label="Chuyển đổi giao diện Sáng / Tối"
            className={`w-full flex items-center rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] transition-colors min-h-[40px] ${
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3'
            }`}
          >
            {!sidebarCollapsed && (
              <span className="whitespace-nowrap">{theme === 'light' ? 'Giao diện Sáng' : 'Giao diện Tối'}</span>
            )}
            {theme === 'light' ? (
              <Sun className="w-4 h-4 text-[#C96442] shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-[#D97757] shrink-0" />
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div
        className={`flex-1 flex flex-col min-w-0 h-full min-h-0 transition-[padding] duration-200 ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
        }`}
      >
        {/* Top Bar */}
        <header className="shrink-0 z-30 h-14 px-4 sm:px-6 lg:px-8 border-b border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5]/95 dark:bg-[#181715]/95 backdrop-blur-sm flex items-center justify-between gap-4">
          <h1 className="text-base sm:text-lg font-semibold truncate">{activeNav.label}</h1>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E]"
              aria-label="Chuyển đổi giao diện Sáng / Tối"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4 text-[#D97757]" />
              )}
            </button>
          </div>
        </header>

        {/* Vùng nội dung cuộn riêng: thanh tab dưới luôn hiện, trang không bị kéo giãn */}
        <div
          ref={scrollRef}
          {...swipeHandlers}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-none"
        >
        {/* Global Shared Query Filter Bar */}
        {dataset && showGlobalFilters && dataset.imports.length > 0 && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl w-full mx-auto">
            <div
              data-no-swipe
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-4 py-2.5 text-xs"
            >
              <select
                value={rangePreset}
                onChange={(e) => applyRangePreset(e.target.value as RangePreset)}
                aria-label="Khoảng thời gian"
                className={FILTER_FIELD_CLASS}
              >
                {RANGE_PRESET_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-[#55534D] dark:text-[#C2BFB6]">
                <span>Từ</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className={`${FILTER_FIELD_CLASS} font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]`}
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-[#55534D] dark:text-[#C2BFB6]">
                <span>đến</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className={`${FILTER_FIELD_CLASS} font-mono-num text-[#1C1B18] dark:text-[#F2EFE9]`}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  aria-label="Tài khoản"
                  className={FILTER_FIELD_CLASS}
                >
                  <option value="ALL">Tất cả tài khoản</option>
                  {dataset.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({a.accountNumber})
                    </option>
                  ))}
                </select>

                <select
                  value={symbolFilter}
                  onChange={(e) => setSymbolFilter(e.target.value)}
                  aria-label="Mã giao dịch"
                  className={FILTER_FIELD_CLASS}
                >
                  {availableSymbols.map((sym) => (
                    <option key={sym} value={sym}>
                      {sym === 'ALL' ? 'Mọi mã giao dịch' : sym}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Viewport Content */}
        <main
          key={activeTab}
          className="animate-tab-in px-4 sm:px-6 lg:px-8 py-5 pb-6 lg:pb-8 max-w-7xl w-full mx-auto"
        >
          {loading && !dataset ? (
            <div className="space-y-4">
              <div className="h-28 rounded-xl bg-[#F3F1EC] dark:bg-[#22211E] animate-pulse" />
              <div className="h-64 rounded-xl bg-[#F3F1EC] dark:bg-[#22211E] animate-pulse" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-50/70 dark:bg-red-950/30 p-6 text-sm text-loss">
              <p className="font-semibold">{error}</p>
              <button
                type="button"
                onClick={fetchWorkspace}
                className="mt-3 rounded-lg bg-[#1C1B18] text-white px-4 py-2 text-xs font-medium"
              >
                Thử tải lại
              </button>
            </div>
          ) : dataset && filteredMetrics ? (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  dataset={vnDataset ?? dataset}
                  trades={filteredTrades}
                  balanceSnapshots={balanceSnapshots}
                  metrics={filteredMetrics}
                  onNavigate={(t) => setActiveTab(t as TabId)}
                  onOpenDiaryDay={openDiaryDay}
                />
              )}
              {activeTab === 'diary' && (
                <DiaryView
                  trades={filteredTrades}
                  focusDay={diaryDay}
                  onClearFocusDay={() => setDiaryDay(null)}
                  onSaveJournal={handleSaveJournal}
                />
              )}
              {activeTab === 'research' && (
                <ResearchView
                  observations={dataset.observations}
                  onCreate={handleCreateObservation}
                  onUpdate={handleUpdateObservation}
                  onDelete={handleDeleteObservation}
                />
              )}
              {activeTab === 'analytics' && (
                <AnalyticsView
                  metrics={filteredMetrics}
                  onNavigateSettings={() => setActiveTab('sync_settings')}
                />
              )}
              {activeTab === 'sync_settings' && (
                <SyncAndSettingsView
                  dataset={dataset}
                  onRefreshWorkspace={fetchWorkspace}
                />
              )}
            </>
          ) : null}
        </main>
        </div>

        {/* Mobile Bottom Navigation Bar (All 5 Tabs Directly Accessible on iPhone PWA) */}
        <nav
          aria-label="Điều hướng di động"
          className="lg:hidden shrink-0 z-40 border-t border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5]/95 dark:bg-[#181715]/95 backdrop-blur-md pb-safe"
        >
          <div className="grid grid-cols-5 h-16 items-center">
            {NAV_ITEMS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
                    active
                      ? 'text-[#C96442]'
                      : 'text-[#55534D] dark:text-[#C2BFB6]'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-0.5" />
                  <span className="truncate max-w-full px-1">{tab.mobileLabel}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <OfflineIndicator />
    </div>
  );
}
