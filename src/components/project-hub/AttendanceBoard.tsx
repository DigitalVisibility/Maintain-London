import { useEffect, useState } from 'react';

interface Row {
  person_id: string;
  name: string;
  company: string | null;
  expected_start: string | null;
  expected_end: string | null;
  clocked_in: string | null;
  clocked_out: string | null;
  present: boolean;
  source: 'clock' | 'register' | null;
  hours: number | null;
  note: string | null;
  status: 'on_time' | 'late' | 'present' | 'absent' | 'upcoming' | 'left_early' | 'extra';
  offsite?: boolean;
  distance_m?: number | null;
}
interface Summary {
  expected: number; present: number; on_time: number; late: number; absent: number; extra: number; offsite?: number;
}
interface SiteData {
  date: string;
  project_id: string;
  rows: Row[];
  summary: Summary;
}
interface OverviewProject {
  project_id: string; project_name: string;
  expected: number; present: number; on_time: number; late: number; absent: number; extra: number; offsite?: number;
}
interface OverviewData {
  date: string;
  projects: OverviewProject[];
  totals: { present: number; expected: number; late: number; absent: number; offsite?: number };
}

interface Props {
  projectId?: string;
}

const STATUS: Record<Row['status'], { label: string; cls: string }> = {
  on_time: { label: 'On time', cls: 'bg-green-100 text-green-700' },
  late: { label: 'Late', cls: 'bg-amber-100 text-amber-700' },
  absent: { label: 'No-show', cls: 'bg-red-100 text-red-700' },
  present: { label: 'On site', cls: 'bg-blue-100 text-blue-700' },
  left_early: { label: 'Left early', cls: 'bg-amber-100 text-amber-700' },
  upcoming: { label: 'Not due', cls: 'bg-gray-100 text-gray-500' },
  extra: { label: 'Extra', cls: 'bg-purple-100 text-purple-700' },
};

const LEGEND: Row['status'][] = ['on_time', 'late', 'present', 'left_early', 'upcoming', 'extra', 'absent'];

// Time part of a 'YYYY-MM-DD HH:MM:SS' timestamp → 'HH:MM'
function hhmm(ts: string | null): string {
  if (!ts) return '';
  const parts = ts.split(' ');
  return (parts[1] || parts[0] || '').slice(0, 5);
}

function StatusBadge({ status }: { status: Row['status'] }) {
  const s = STATUS[status] || STATUS.present;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>
  );
}

export default function AttendanceBoard({ projectId }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<SiteData | OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        let url = `/api/attendance?date=${date}`;
        if (projectId) url += `&project_id=${projectId}`;
        const res = await fetch(url);
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [date, projectId]);

  const site = projectId ? (data as SiteData | null) : null;
  const overview = !projectId ? (data as OverviewData | null) : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Who&apos;s on site</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-700"
          />
          {date !== today && (
            <button
              onClick={() => setDate(today)}
              className="text-sm font-medium text-[#83B81A] hover:underline whitespace-nowrap"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-gray-400">Couldn&apos;t load attendance.</p>
      ) : site ? (
        <SiteView data={site} />
      ) : overview ? (
        <OverviewView data={overview} />
      ) : (
        <p className="text-sm text-gray-400">No attendance data.</p>
      )}
    </div>
  );
}

function SiteView({ data }: { data: SiteData }) {
  const { rows, summary } = data;

  const summaryLine = () => {
    const parts = [`${summary.present} of ${summary.expected} on site`];
    if (summary.late > 0) parts.push(`${summary.late} late`);
    if (summary.absent > 0) parts.push(`${summary.absent} absent`);
    if (summary.extra > 0) parts.push(`${summary.extra} extra`);
    return parts.join(' · ');
  };

  if (!rows || rows.length === 0) {
    return (
      <div>
        <p className="text-sm text-gray-400">No one is on the rota for this day.</p>
        <Legend />
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-3">{summaryLine()}</div>
      <div className="space-y-2">
        {rows.map((r) => {
          const expected = r.expected_start && r.expected_end
            ? `Expected ${hhmm(r.expected_start)}–${hhmm(r.expected_end)}`
            : '—';
          let actual = '';
          if (r.present) {
            if (r.source === 'register') actual = 'Logged by manager';
            else if (r.clocked_in) actual = `In ${hhmm(r.clocked_in)}`;
          }
          return (
            <div key={r.person_id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {r.name}
                    {r.company && <span className="text-gray-400 font-normal"> · {r.company}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {expected}
                    {actual && <span className="text-gray-700"> · {actual}</span>}
                  </div>
                  {r.note && <div className="text-xs text-gray-400 italic mt-0.5">{r.note}</div>}
                  {r.offsite && (
                    <div className="text-xs text-orange-600 mt-1 inline-flex items-center gap-1" title="Clocked in away from the site location">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                      Clocked in off-site{r.distance_m != null ? ` (~${r.distance_m >= 1000 ? (r.distance_m / 1000).toFixed(1) + ' km' : r.distance_m + ' m'} away)` : ''}
                    </div>
                  )}
                </div>
                <StatusBadge status={r.status} />
              </div>
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
      {LEGEND.map((s) => (
        <span key={s} className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS[s].cls}`}>
          {STATUS[s].label}
        </span>
      ))}
    </div>
  );
}

function OverviewView({ data }: { data: OverviewData }) {
  const { projects, totals } = data;

  const totalsLine = () => {
    const parts = [`${totals.present} of ${totals.expected} on site`];
    if (totals.late > 0) parts.push(`${totals.late} late`);
    if (totals.absent > 0) parts.push(`${totals.absent} absent`);
    return parts.join(' · ');
  };

  if (!projects || projects.length === 0) {
    return <p className="text-sm text-gray-400">No projects to show for this day.</p>;
  }

  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-3">{totalsLine()}</div>
      <div className="space-y-2">
        {projects.map((p) => {
          const allGood = p.present >= p.expected && p.late === 0 && p.absent === 0;
          return (
            <div key={p.project_id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{p.project_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{p.present} / {p.expected} present</div>
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {p.late > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{p.late} late</span>
                )}
                {p.absent > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{p.absent} absent</span>
                )}
                {(p.offsite ?? 0) > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{p.offsite} off-site</span>
                )}
                {allGood && <span className="text-green-600 text-sm" aria-label="All present">✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
