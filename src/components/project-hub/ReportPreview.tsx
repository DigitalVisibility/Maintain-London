import { useState } from 'react';

interface Props {
  projectId: string;
  entries: { id: string; date: string; status: string }[];
}

type ReportType = 'daily' | 'weekly';

export default function ReportPreview({ projectId, entries }: Props) {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [selectedEntryId, setSelectedEntryId] = useState<string>(entries[0]?.id || '');
  const [weekOf, setWeekOf] = useState<string>(getLastMonday());
  const [loading, setLoading] = useState(false);
  const [reportHTML, setReportHTML] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function getLastMonday(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  async function generateReport() {
    setLoading(true);
    setError(null);
    setReportHTML(null);

    const params = new URLSearchParams({ project_id: projectId, type: reportType });
    if (reportType === 'daily') {
      params.set('entry_id', selectedEntryId);
    } else {
      params.set('week_of', weekOf);
    }

    try {
      const res = await fetch(`/api/reports/summary?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate report' }));
        throw new Error(err.error || 'Failed to generate report');
      }
      const html = await res.text();
      setReportHTML(html);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    if (!reportHTML) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(reportHTML);
      win.document.close();
      // Brief delay to ensure styles are loaded before printing
      setTimeout(() => win.print(), 300);
    }
  }

  function handleDownload() {
    if (!reportHTML) return;
    const blob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = reportType === 'daily'
      ? `diary-${entries.find((e) => e.id === selectedEntryId)?.date || 'report'}.html`
      : `weekly-${weekOf}.html`;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Generate Report</h3>

        {/* Report type selector */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setReportType('daily')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              reportType === 'daily'
                ? 'bg-[#AEDE4A] text-gray-900'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Daily Report
          </button>
          <button
            type="button"
            onClick={() => setReportType('weekly')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              reportType === 'weekly'
                ? 'bg-[#AEDE4A] text-gray-900'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Weekly Summary
          </button>
        </div>

        {/* Daily: select entry */}
        {reportType === 'daily' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Entry</label>
            {entries.length > 0 ? (
              <select
                value={selectedEntryId}
                onChange={(e) => setSelectedEntryId(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
              >
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    — {entry.status}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400 italic">No diary entries to generate reports from.</p>
            )}
          </div>
        )}

        {/* Weekly: select week */}
        {reportType === 'weekly' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week commencing (Monday)
            </label>
            <input
              type="date"
              value={weekOf}
              onChange={(e) => setWeekOf(e.target.value)}
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
            />
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={generateReport}
          disabled={loading || (reportType === 'daily' && !selectedEntryId)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4 2a1 1 0 10-2 0v3a1 1 0 102 0v-3z" clipRule="evenodd" />
              </svg>
              Generate Report
            </>
          )}
        </button>

        {error && (
          <div className="mt-3 text-sm text-red-600">{error}</div>
        )}
      </div>

      {/* Report preview */}
      {reportHTML && (
        <div className="space-y-3">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Report Preview</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                </svg>
                Print / Save as PDF
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download HTML
              </button>
            </div>
          </div>

          {/* Preview iframe */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <iframe
              srcDoc={reportHTML}
              title="Report Preview"
              className="w-full border-0"
              style={{ minHeight: '600px' }}
              onLoad={(e) => {
                // Auto-resize iframe to content
                const iframe = e.currentTarget;
                const doc = iframe.contentDocument;
                if (doc?.body) {
                  iframe.style.height = doc.body.scrollHeight + 40 + 'px';
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
