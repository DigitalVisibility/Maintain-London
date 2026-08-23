import { useEffect, useState } from 'react';

type Status = 'on_time' | 'late' | 'present' | 'absent' | 'upcoming' | 'left_early' | 'extra';

interface Person {
  person_id: string | null;
  name: string;
  byDate: Record<string, Status>;
}
interface HistoryData {
  project_id: string;
  dates: string[];
  people: Person[];
}

interface Props {
  projectId: string;
}

// Matched to AttendanceBoard's STATUS map.
const STATUS: Record<Status, { label: string; cls: string }> = {
  on_time: { label: 'On time', cls: 'bg-green-100 text-green-700' },
  late: { label: 'Late', cls: 'bg-amber-100 text-amber-700' },
  absent: { label: 'No-show', cls: 'bg-red-100 text-red-700' },
  present: { label: 'On site', cls: 'bg-blue-100 text-blue-700' },
  left_early: { label: 'Left early', cls: 'bg-amber-100 text-amber-700' },
  upcoming: { label: 'Not due', cls: 'bg-gray-100 text-gray-500' },
  extra: { label: 'Extra', cls: 'bg-purple-100 text-purple-700' },
};

const LEGEND: Status[] = ['on_time', 'late', 'present', 'left_early', 'upcoming', 'extra', 'absent'];

// 'YYYY-MM-DD' → Date at UTC midnight
function parseDate(d: string): Date {
  return new Date(d + 'T00:00:00Z');
}

// 'YYYY-MM-DD' → e.g. 'Mon 18'
function dayLabel(d: string): string {
  const dt = parseDate(d);
  const weekday = dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${dt.getUTCDate()}`;
}

// Date → 'YYYY-MM-DD' (UTC)
function iso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function addDays(d: string, n: number): string {
  const dt = parseDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return iso(dt);
}

function rangeLabel(from: string, to: string): string {
  const f = parseDate(from);
  const t = parseDate(to);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const sameMonth = f.getUTCMonth() === t.getUTCMonth() && f.getUTCFullYear() === t.getUTCFullYear();
  const fromStr = sameMonth
    ? f.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })
    : f.toLocaleDateString('en-GB', opts);
  const toStr = t.toLocaleDateString('en-GB', opts);
  return `${fromStr} – ${toStr}`;
}

export default function AttendanceHistory({ projectId }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const from = addDays(to, -6);
  const atCurrentWeek = to >= today;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url = `/api/attendance/history?project_id=${projectId}&from=${from}&to=${to}`;
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
  }, [projectId, from, to]);

  const earlier = () => setTo((t) => addDays(t, -7));
  const later = () => setTo((t) => {
    const next = addDays(t, 7);
    return next > today ? today : next;
  });

  const dates = data?.dates ?? [];
  const people = data?.people ?? [];
  const hasData = people.length > 0 && dates.length > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Attendance history</h2>
          <p className="text-xs text-gray-500 mt-0.5">{rangeLabel(from, to)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={earlier}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-50 whitespace-nowrap"
          >
            ‹ Earlier
          </button>
          <button
            onClick={later}
            disabled={atCurrentWeek}
            className="text-sm font-medium px-2 py-1 rounded-md whitespace-nowrap text-gray-600 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600 disabled:cursor-default"
          >
            Later ›
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !hasData ? (
        <p className="text-sm text-gray-400">No attendance recorded for this period.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left text-xs font-semibold text-gray-500 px-3 py-2 border-b border-gray-200">
                    Person
                  </th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      className="text-center text-xs font-medium text-gray-500 px-3 py-2 border-b border-gray-200 whitespace-nowrap"
                    >
                      {dayLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={p.person_id ?? `row-${i}`} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white text-sm font-medium text-gray-900 px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                      {p.name}
                    </td>
                    {dates.map((d) => {
                      const status = p.byDate[d];
                      const s = status ? STATUS[status] : null;
                      return (
                        <td key={d} className="text-center px-3 py-2 border-b border-gray-100">
                          {s ? (
                            <span
                              title={s.label}
                              className={`inline-block w-5 h-5 rounded ${s.cls.split(' ')[0]}`}
                              aria-label={s.label}
                            />
                          ) : (
                            <span className="text-gray-300" title="No record">–</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
            {LEGEND.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className={`inline-block w-3 h-3 rounded ${STATUS[s].cls.split(' ')[0]}`} />
                {STATUS[s].label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
