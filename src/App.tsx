import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CandlestickChart,
  LayoutDashboard,
  Mail,
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
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ResearchView } from './components/ResearchView.tsx';
import { SyncAndSettingsView } from './components/SyncAndSettingsView.tsx';
import { calculateMetrics } from './lib/analytics/metricsEngine.ts';
import type {
  JournalEntry,
  PriceObservation,
  ThemeMode,
  WorkspaceDataset,
} from './shared/types.ts';

type TabId = 'overview' | 'diary' | 'research' | 'analytics' | 'sync_settings';

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

function extractIsoDateFromRaw(raw: string): string {
  const m = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw.slice(0, 10);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('tj_sidebar_collapsed') === 'true';
  });

  // Global shared filters across Overview / Diary / Analytics
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | '7D' | '30D' | '90D'>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('tj_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const [dataset, setDataset] = useState<WorkspaceDataset | null>(null);
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

  const availableSymbols = useMemo(() => {
    if (!dataset) return ['ALL'];
    const set = new Set(dataset.trades.map((t) => t.symbol));
    return ['ALL', ...Array.from(set)];
  }, [dataset]);

  const cutoffDateStr = useMemo(() => {
    if (dateRangeFilter === 'ALL') return null;
    const days = dateRangeFilter === '7D' ? 7 : dateRangeFilter === '30D' ? 30 : 90;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [dateRangeFilter]);

  const filteredTrades = useMemo(() => {
    if (!dataset) return [];
    return dataset.trades.filter((t) => {
      if (accountFilter !== 'ALL' && t.accountId !== accountFilter) return false;
      if (symbolFilter !== 'ALL' && t.symbol !== symbolFilter) return false;
      if (cutoffDateStr) {
        const tradeDate = extractIsoDateFromRaw(t.closeTimeRaw ?? t.openTimeRaw);
        if (tradeDate < cutoffDateStr) return false;
      }
      return true;
    });
  }, [dataset, accountFilter, symbolFilter, cutoffDateStr]);

  const filteredSnapshots = useMemo(() => {
    if (!dataset) return [];
    return dataset.snapshots.filter((s) => {
      if (accountFilter !== 'ALL' && s.accountId !== accountFilter) return false;
      if (cutoffDateStr && s.reportDate < cutoffDateStr) return false;
      return true;
    });
  }, [dataset, accountFilter, cutoffDateStr]);

  const filteredMetrics = useMemo(() => {
    if (!dataset) return null;
    const unmatchedCount = dataset.reviewItems.filter(
      (r) => r.type === 'unmatched_deal' && r.status === 'pending',
    ).length;
    return calculateMetrics(
      filteredTrades,
      filteredSnapshots,
      unmatchedCount,
      dataset.accounts,
    );
  }, [dataset, filteredTrades, filteredSnapshots]);

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

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];
  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const showGlobalFilters = ['overview', 'diary', 'analytics'].includes(activeTab);

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#181715] text-[#1C1B18] dark:text-[#F2EFE9] flex">
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
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#6B6963] dark:text-[#A6A39B] hover:bg-[#F3F1EC] dark:hover:bg-[#22211E] hover:text-[#1C1B18] dark:hover:text-[#F2EFE9] transition-colors shrink-0"
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
                    : 'text-[#6B6963] dark:text-[#A6A39B] hover:bg-[#F3F1EC] dark:hover:bg-[#22211E]/60 hover:text-[#1C1B18] dark:hover:text-[#F2EFE9]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#C96442]' : 'text-[#6B6963] dark:text-[#A6A39B]'
                  }`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E7E5E0] dark:border-[#32302B] space-y-2.5 flex flex-col items-center">
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

          <div className="w-full flex justify-center">
            <PWAInstallButton iconOnly={sidebarCollapsed} />
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
        }`}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 lg:px-8 border-b border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5]/95 dark:bg-[#181715]/95 backdrop-blur-sm flex items-center justify-between gap-4">
          <h1 className="text-base sm:text-lg font-semibold truncate">{activeNav.label}</h1>

          <div className="flex items-center gap-2 shrink-0">
            <div className="lg:hidden">
              <PWAInstallButton compact />
            </div>
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
            <button
              type="button"
              onClick={() => setActiveTab('sync_settings')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#C96442] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#B55535] transition-colors whitespace-nowrap min-h-[38px]"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Đồng bộ Email</span>
            </button>
          </div>
        </header>

        {/* Global Shared Query Filter Bar */}
        {dataset && showGlobalFilters && dataset.imports.length > 0 && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl w-full mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-4 py-2.5 text-xs">
              <div className="inline-flex rounded-lg bg-[#F3F1EC] dark:bg-[#181715] p-1">
                {(
                  [
                    { id: 'ALL', label: 'Tất cả' },
                    { id: '7D', label: '7 ngày' },
                    { id: '30D', label: '30 ngày' },
                    { id: '90D', label: '90 ngày' },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDateRangeFilter(r.id)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                      dateRangeFilter === r.id
                        ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                        : 'text-[#6B6963] dark:text-[#A6A39B]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-2.5 py-1.5 text-xs font-medium"
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
                  className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-2.5 py-1.5 text-xs font-medium"
                >
                  {availableSymbols.map((s) => (
                    <option key={s} value={s}>
                      {s === 'ALL' ? 'Mọi mã giao dịch' : s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          {loading && !dataset ? (
            <div className="space-y-4">
              <div className="h-28 rounded-xl bg-[#F3F1EC] dark:bg-[#22211E] animate-pulse" />
              <div className="h-64 rounded-xl bg-[#F3F1EC] dark:bg-[#22211E] animate-pulse" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-50/70 dark:bg-red-950/30 p-6 text-sm text-[#B91C1C] dark:text-[#F87171]">
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
                  dataset={dataset}
                  trades={filteredTrades}
                  snapshots={filteredSnapshots}
                  metrics={filteredMetrics}
                  onNavigate={(t) => setActiveTab(t as TabId)}
                />
              )}
              {activeTab === 'diary' && (
                <DiaryView trades={filteredTrades} onSaveJournal={handleSaveJournal} />
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
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5]/95 dark:bg-[#181715]/95 backdrop-blur-md pb-safe"
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
                    : 'text-[#6B6963] dark:text-[#A6A39B]'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="truncate max-w-full px-1">{tab.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
