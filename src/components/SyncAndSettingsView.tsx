import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Mail,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { ParsedStatement, WorkspaceDataset } from '../shared/types.ts';

interface SyncAndSettingsViewProps {
  dataset: WorkspaceDataset;
  onRefreshWorkspace: () => Promise<void>;
}

const BROKER_TZ_OPTIONS = [
  { value: 'Unknown', label: 'Unknown (tắt phân tích phiên)' },
  { value: 'UTC+2', label: 'UTC+2 (MetaTrader mùa Đông)' },
  { value: 'UTC+3', label: 'UTC+3 (MetaTrader mùa Hè)' },
  { value: 'UTC+0', label: 'UTC+0 (GMT)' },
  { value: 'UTC+7', label: 'UTC+7 (Giờ Việt Nam)' },
];

const SAMPLE_VANTAGE_TEXT = `A/C No: 26818392\tName: MINH THANG HUYNH\tCurrency: USD\t2026.10.22 23:59
Orders:
   Open Time\tTicket\tType\tSize\tItem\tPrice\tS / L\tT / P\tTime\tState\tComment
2026.10.22 14:57:30\t113834869\tsell\t0.2 / 0.2\tSP500ft\tmarket\t0.00\t0.00\t2026.10.22 14:57:31\tfilled\t
2026.10.22 15:12:17\t113846738\tbuy\t0.2 / 0.2\tSP500ft\t7728.31\t0.00\t0.00\t2026.10.22 15:12:18\tfilled\t[sl 7728.31]
2026.10.22 17:11:07\t113965466\tsell\t0.2 / 0.2\tNAS100ft\tmarket\t0.00\t0.00\t2026.10.22 17:11:07\tfilled\t
2026.10.22 17:15:09\t113968525\tbuy\t0.2 / 0.2\tNAS100ft\tmarket\t0.00\t0.00\t2026.10.22 17:15:10\tfilled\t
 
Deals:
   Open Time\tTicket\tType\tSize\tItem\tPrice\tOrder\tComment\tEntry\tCommission\tSwap\tProfit
2026.10.22 14:57:31\t106992104\tsell\t0.2\tSP500ft\t7720.81\t113834869\t\tin\t0.00\t0.00\t0.00
2026.10.22 15:12:18\t107003069\tbuy\t0.2\tSP500ft\t7728.45\t113846738\t[sl 7728.31]\tout\t0.00\t0.00\t-1.53
2026.10.22 17:11:07\t107110945\tsell\t0.2\tNAS100ft\t29488.78\t113965466\t\tin\t0.00\t0.00\t0.00
2026.10.22 17:15:10\t107113424\tbuy\t0.2\tNAS100ft\t29462.85\t113968525\t\tout\t0.00\t0.00\t5.19
 
A/C Summary:
Closed Trade P/L:\t3.66\t \tPrevious Ledger Balance:\t22.49
Deposit/Withdrawal:\t0.00\t \tPrevious Equity:\t22.49
Total Credit Facility:\t0.00\t \tBalance:\t26.15
Round Commission:\t0.00\t \tEquity:\t26.15
Instant Commission:\t0.00\t \tFloating P/L:\t0.00
Additional Operations:\t0.00\t \tMargin Requirements:\t0.00
Total:\t3.66\t \tAvailable Margin:\t26.15`;

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const SyncAndSettingsView: React.FC<SyncAndSettingsViewProps> = ({
  dataset,
  onRefreshWorkspace,
}) => {
  const [methodTab, setMethodTab] = useState<'gmail' | 'paste' | 'eml'>('gmail');

  // Gmail state (đồng bộ chạy hoàn toàn trên máy chủ bằng Refresh Token)
  const [gmailStatus, setGmailStatus] = useState<{
    loaded: boolean;
    configured: boolean;
    email: string | null;
    error: string | null;
  }>({ loaded: false, configured: false, email: null, error: null });
  const [lookbackDays, setLookbackDays] = useState<number>(14);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailMessage, setGmailMessage] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailPreviews, setGmailPreviews] = useState<
    Array<{
      messageId: string;
      emailDate: string;
      accountNumber: string;
      reportTimestampRaw: string;
      ordersCount: number;
      dealsCount: number;
      status: string;
      message: string;
    }>
  >([]);

  // Paste / EML state
  const [rawInput, setRawInput] = useState('');
  const [previewStatement, setPreviewStatement] = useState<ParsedStatement | null>(null);
  const [parseBusy, setParseBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Account Timezone Settings
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [accountDrafts, setAccountDrafts] = useState<
    Record<string, { label: string; serverTimezone: string; displayTimezone: string }>
  >({});

  useEffect(() => {
    let active = true;
    fetch('/api/gmail/status')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setGmailStatus({
          loaded: true,
          configured: Boolean(data.configured),
          email: data.email ?? null,
          error: data.error ?? null,
        });
      })
      .catch(() => {
        if (active) {
          setGmailStatus({ loaded: true, configured: false, email: null, error: 'Không kiểm tra được kết nối Gmail.' });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const lastGmailSync = dataset.syncLogs.find((l) => l.source === 'gmail');

  const handleGmailSync = async (dryRun: boolean) => {
    setGmailBusy(true);
    setGmailError(null);
    setGmailMessage(null);
    try {
      const res = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: lookbackDays, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGmailError(data.error ?? 'Đồng bộ Gmail thất bại.');
        return;
      }
      setGmailMessage(data.message);
      setGmailPreviews(data.previews ?? []);
      if (!dryRun) {
        await onRefreshWorkspace();
      }
    } catch {
      setGmailError('Lỗi kết nối khi đồng bộ Gmail.');
    } finally {
      setGmailBusy(false);
    }
  };

  const handlePreview = async (contentToParse: string, mode: 'auto' | 'eml' = 'auto') => {
    setParseBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawContent: contentToParse, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error ?? 'Không thể phân tích nội dung.' });
        return;
      }
      setPreviewStatement(data.statement);
    } catch {
      setFeedback({ type: 'err', text: 'Lỗi kết nối máy chủ khi phân tích thử.' });
    } finally {
      setParseBusy(false);
    }
  };

  const handleCommit = async (source: 'paste' | 'eml') => {
    if (!rawInput.trim()) return;
    setParseBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawContent: rawInput,
          mode: source === 'eml' ? 'eml' : 'auto',
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error ?? 'Lưu thất bại.' });
        return;
      }
      setFeedback({
        type: data.outcome.status === 'rejected' ? 'err' : 'ok',
        text: data.outcome.message,
      });
      setPreviewStatement(data.statement);
      await onRefreshWorkspace();
    } catch {
      setFeedback({ type: 'err', text: 'Lỗi kết nối máy chủ khi lưu dữ liệu.' });
    } finally {
      setParseBusy(false);
    }
  };

  const handleEmlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawInput(text);
    await handlePreview(text, file.name.endsWith('.eml') ? 'eml' : 'auto');
  };

  const saveAccount = async (id: string) => {
    const acct = dataset.accounts.find((a) => a.id === id);
    if (!acct) return;
    const draft = accountDrafts[id] ?? {
      label: acct.label,
      serverTimezone: acct.serverTimezone,
      displayTimezone: acct.displayTimezone,
    };
    setSavingId(id);
    setSavedBanner(null);
    try {
      await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      await onRefreshWorkspace();
      setSavedBanner(`Đã lưu cấu hình múi giờ cho tài khoản ${acct.accountNumber}.`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Email Daily Confirmation Import */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E7E5E0] dark:border-[#32302B]">
          <h2 className="text-base font-semibold">Nhập báo cáo Daily Confirmation từ Email</h2>
          <div className="inline-flex rounded-lg bg-[#F3F1EC] dark:bg-[#181715] p-1 self-start">
            <button
              type="button"
              onClick={() => setMethodTab('gmail')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                methodTab === 'gmail'
                  ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                  : 'text-[#6B6963] dark:text-[#A6A39B]'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Gmail tự động</span>
            </button>
            <button
              type="button"
              onClick={() => setMethodTab('paste')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                methodTab === 'paste'
                  ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                  : 'text-[#6B6963] dark:text-[#A6A39B]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Dán nội dung</span>
            </button>
            <button
              type="button"
              onClick={() => setMethodTab('eml')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                methodTab === 'eml'
                  ? 'bg-white dark:bg-[#2A2925] text-[#1C1B18] dark:text-[#F2EFE9] shadow-xs'
                  : 'text-[#6B6963] dark:text-[#A6A39B]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Tải file .eml</span>
            </button>
          </div>
        </div>

        {methodTab === 'gmail' && (
          <div className="mt-5 space-y-4">
            {!gmailStatus.loaded ? (
              <p className="text-xs text-[#6B6963] dark:text-[#A6A39B]">Đang kiểm tra kết nối...</p>
            ) : !gmailStatus.configured ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-50/70 dark:bg-red-950/30 p-3 text-xs text-loss">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Chưa cấu hình Gmail trên máy chủ (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).
                </span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium">
                    {gmailStatus.error ? (
                      <AlertCircle className="w-4 h-4 text-loss shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-win shrink-0" />
                    )}
                    <span className={gmailStatus.error ? 'text-loss' : 'text-win'}>
                      {gmailStatus.error
                        ? gmailStatus.error
                        : `Tự động đồng bộ · ${gmailStatus.email ?? 'Gmail đã kết nối'}`}
                    </span>
                  </div>
                  <span className="text-xs font-mono-num text-[#6B6963] dark:text-[#A6A39B]">
                    Lần gần nhất:{' '}
                    {lastGmailSync ? new Date(lastGmailSync.createdAt).toLocaleString('vi-VN') : '—'}
                  </span>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Quét bù lịch sử</label>
                    <select
                      value={lookbackDays}
                      onChange={(e) => setLookbackDays(Number(e.target.value))}
                      className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] px-3 py-2 text-sm min-h-[44px]"
                    >
                      <option value={7}>7 ngày gần nhất</option>
                      <option value={14}>14 ngày gần nhất</option>
                      <option value={30}>30 ngày gần nhất</option>
                      <option value={90}>90 ngày gần nhất</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={gmailBusy || Boolean(gmailStatus.error)}
                    onClick={() => handleGmailSync(false)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#C96442] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#B55535] disabled:opacity-50 min-h-[44px]"
                  >
                    <RefreshCw className={`w-4 h-4 ${gmailBusy ? 'animate-spin' : ''}`} />
                    <span>Đồng bộ ngay</span>
                  </button>
                  <button
                    type="button"
                    disabled={gmailBusy || Boolean(gmailStatus.error)}
                    onClick={() => handleGmailSync(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-4 py-2.5 text-sm font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] disabled:opacity-50 min-h-[44px]"
                  >
                    <span>Quét thử (Dry-run)</span>
                  </button>
                </div>
              </>
            )}

            {gmailMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs text-win">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{gmailMessage}</span>
              </div>
            )}
            {gmailError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-50/70 dark:bg-red-950/30 p-3 text-xs text-loss">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{gmailError}</span>
              </div>
            )}

            {gmailPreviews.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-[#6B6963] dark:text-[#A6A39B]">
                  Kết quả quét Gmail ({gmailPreviews.length} email):
                </h4>
                {gmailPreviews.map((p) => (
                  <div
                    key={p.messageId}
                    className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] p-3 text-xs flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono-num font-semibold">{p.reportTimestampRaw || 'N/A'}</span>{' '}
                      <span className="text-[#6B6963] dark:text-[#A6A39B]">
                        · TK {p.accountNumber} · {p.ordersCount} Orders · {p.dealsCount} Deals
                      </span>
                    </div>
                    <span className="font-medium">{p.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {methodTab === 'paste' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium">Nội dung email Daily Confirmation</label>
              <button
                type="button"
                onClick={() => {
                  setRawInput(SAMPLE_VANTAGE_TEXT);
                  handlePreview(SAMPLE_VANTAGE_TEXT, 'auto');
                }}
                className="text-xs font-medium text-[#C96442] hover:underline"
              >
                Nạp thử mẫu Vantage (22/10/2026)
              </button>
            </div>
            <textarea
              rows={7}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="A/C No: 26818392   Name: ...   Currency: USD   2026.10.22 23:59..."
              className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] p-3 text-xs font-mono-num focus:outline-none focus:border-[#C96442]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={parseBusy || !rawInput.trim()}
                onClick={() => handlePreview(rawInput, 'auto')}
                className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-4 py-2 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] disabled:opacity-50 min-h-[42px]"
              >
                Phân tích xem trước
              </button>
              <button
                type="button"
                disabled={parseBusy || !rawInput.trim()}
                onClick={() => handleCommit('paste')}
                className="rounded-lg bg-[#C96442] px-4 py-2 text-xs font-medium text-white hover:bg-[#B55535] disabled:opacity-50 min-h-[42px]"
              >
                Xác nhận lưu vào cơ sở dữ liệu
              </button>
            </div>
          </div>
        )}

        {methodTab === 'eml' && (
          <div className="mt-5 space-y-4">
            <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] p-8 cursor-pointer hover:border-[#C96442] transition-colors">
              <Upload className="w-6 h-6 text-[#C96442] mb-2" />
              <span className="text-sm font-medium">Chọn file .eml hoặc .html</span>
              <input
                type="file"
                accept=".eml,.html,.htm,.txt"
                onChange={handleEmlFile}
                className="hidden"
              />
            </label>
            {rawInput && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={parseBusy}
                  onClick={() => handleCommit('eml')}
                  className="rounded-lg bg-[#C96442] px-4 py-2 text-xs font-medium text-white hover:bg-[#B55535] disabled:opacity-50 min-h-[42px]"
                >
                  Xác nhận nhập file này
                </button>
              </div>
            )}
          </div>
        )}

        {feedback && (
          <div
            className={`mt-4 rounded-lg border p-3 text-xs ${
              feedback.type === 'ok'
                ? 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-win'
                : 'border-red-500/30 bg-red-50/70 dark:bg-red-950/30 text-loss'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {previewStatement && (
          <div className="mt-5 pt-5 border-t border-[#E7E5E0] dark:border-[#32302B] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold">
                Kết quả phân tích ({previewStatement.parserVersion})
              </h3>
              <span className="text-xs font-mono-num">
                Trạng thái: <strong>{previewStatement.validationStatus.toUpperCase()}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3 border border-[#E7E5E0] dark:border-[#32302B]">
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Tài khoản</span>
                <p className="mt-1 font-mono-num font-semibold">
                  {previewStatement.header.accountNumber || '—'} ({previewStatement.header.currency})
                </p>
              </div>
              <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3 border border-[#E7E5E0] dark:border-[#32302B]">
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Thời gian báo cáo</span>
                <p className="mt-1 font-mono-num font-semibold">
                  {previewStatement.header.reportTimestampRaw || '—'}
                </p>
              </div>
              <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3 border border-[#E7E5E0] dark:border-[#32302B]">
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Dòng ghi nhận</span>
                <p className="mt-1 font-mono-num font-semibold">
                  {previewStatement.orders.length} Orders · {previewStatement.deals.length} Deals
                </p>
              </div>
              <div className="rounded-lg bg-[#FAF9F5] dark:bg-[#181715] p-3 border border-[#E7E5E0] dark:border-[#32302B]">
                <span className="text-[#6B6963] dark:text-[#A6A39B]">Closed P/L → Balance</span>
                <p className="mt-1 font-mono-num font-semibold">
                  {previewStatement.summary.closedTradePL} → ${previewStatement.summary.balance}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Timezone & Storage Status + Export / PWA */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E7E5E0] dark:border-[#32302B]">
          <h3 className="text-sm font-semibold">Cài đặt tài khoản & Lưu trữ</h3>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium shrink-0">
            <Database className="w-3.5 h-3.5 text-[#C96442]" />
            <span className={dataset.dbConnected ? 'text-win' : 'text-[#6B6963] dark:text-[#A6A39B]'}>
              {dataset.dbConnected ? 'Neon PostgreSQL: Đã kết nối' : 'Bộ nhớ tạm (chưa có DATABASE_URL)'}
            </span>
          </div>
        </div>

        {savedBanner && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 text-xs text-win">
            {savedBanner}
          </div>
        )}

        {dataset.accounts.length > 0 ? (
          <div className="space-y-3">
            {dataset.accounts.map((a) => {
              const draft = accountDrafts[a.id] ?? {
                label: a.label,
                serverTimezone: a.serverTimezone,
                displayTimezone: a.displayTimezone,
              };
              return (
                <div
                  key={a.id}
                  className="rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-[#FAF9F5] dark:bg-[#181715] p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Tên tài khoản (TK {a.accountNumber} · {a.currency})
                    </label>
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(e) =>
                        setAccountDrafts((p) => ({
                          ...p,
                          [a.id]: { ...draft, label: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Múi giờ máy chủ sàn</label>
                    <select
                      value={draft.serverTimezone}
                      onChange={(e) =>
                        setAccountDrafts((p) => ({
                          ...p,
                          [a.id]: { ...draft, serverTimezone: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-2 text-xs"
                    >
                      {BROKER_TZ_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Múi giờ hiển thị</label>
                    <input
                      type="text"
                      value={draft.displayTimezone}
                      onChange={(e) =>
                        setAccountDrafts((p) => ({
                          ...p,
                          [a.id]: { ...draft, displayTimezone: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] px-3 py-2 text-xs font-mono-num"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={savingId === a.id}
                    onClick={() => saveAccount(a.id)}
                    className="rounded-lg bg-[#1C1B18] dark:bg-[#F2EFE9] text-white dark:text-[#1C1B18] px-4 py-2 text-xs font-medium min-h-[38px]"
                  >
                    {savingId === a.id ? 'Đang lưu...' : 'Lưu cài đặt'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-[#6B6963] dark:text-[#A6A39B]">Chưa có tài khoản nào.</p>
        )}

        <div className="pt-3 border-t border-[#E7E5E0] dark:border-[#32302B] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'lich-su-giao-dich.csv',
                  ['Ma', 'Chieu', 'Mo', 'Dong', 'KhoiLuong', 'GiaVao', 'GiaRa', 'NetPL', 'ChienLuoc'],
                  dataset.trades.map((t) => [
                    t.symbol,
                    t.side,
                    t.openTimeRaw,
                    t.closeTimeRaw ?? '',
                    t.volume,
                    t.entryPrice,
                    t.exitPrice ?? '',
                    t.netPL,
                    t.journal?.strategy ?? '',
                  ]),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-3 py-2 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[38px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất CSV Nhật ký</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'nghien-cuu-hanh-dong-gia.csv',
                  ['Ma', 'Ngay', 'Gio', 'Khung', 'Phien', 'HanhDongGia', 'Nen', 'BoiCanh', 'TinCay', 'ThoiQuen'],
                  dataset.observations.map((o) => [
                    o.symbol,
                    o.observedDate,
                    o.observedTime,
                    o.timeframe,
                    o.session,
                    o.priceAction,
                    o.candlePattern,
                    o.marketContext,
                    o.confidence,
                    o.habitTag,
                  ]),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-3 py-2 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[38px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất CSV Nghiên cứu giá</span>
            </button>

            <a
              href="/api/export/json"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] dark:border-[#32302B] px-3 py-2 text-xs font-medium hover:bg-[#F3F1EC] dark:hover:bg-[#2A2925] min-h-[38px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sao lưu JSON</span>
            </a>
          </div>
        </div>
      </div>

      {/* 3. Sync History */}
      <div className="rounded-xl border border-[#E7E5E0] dark:border-[#32302B] bg-white dark:bg-[#22211E] p-5">
        <h3 className="text-sm font-semibold mb-3">
          Lịch sử nhập báo cáo ({dataset.imports.length}) & Nhật ký đồng bộ ({dataset.syncLogs.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E7E5E0] dark:border-[#32302B] text-[#6B6963] dark:text-[#A6A39B]">
                <th className="py-2 font-medium">Thời điểm</th>
                <th className="py-2 font-medium">Nguồn</th>
                <th className="py-2 font-medium">Tài khoản</th>
                <th className="py-2 font-medium">Báo cáo gốc</th>
                <th className="py-2 font-medium">Trạng thái & Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E5E0]/70 dark:divide-[#32302B]/70">
              {dataset.syncLogs.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 font-mono-num text-[#6B6963] dark:text-[#A6A39B] whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString('vi-VN')}
                  </td>
                  <td className="py-2.5 uppercase">{l.source}</td>
                  <td className="py-2.5 font-mono-num">{l.accountNumber ?? '—'}</td>
                  <td className="py-2.5 font-mono-num">{l.reportTimestampRaw ?? '—'}</td>
                  <td className="py-2.5">
                    <span className="font-medium">{l.status}</span> · {l.message}
                  </td>
                </tr>
              ))}
              {dataset.syncLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#6B6963]">
                    Chưa có lịch sử đồng bộ nào.
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
