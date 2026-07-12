import { useEffect, useState } from 'react';

/**
 * When client summaries go out. Friday 4pm is the default, not the law:
 * a business sets its own rhythm, and any project can depart from it.
 */

type Cadence = 'manual' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'milestone';

const CADENCE_LABEL: Record<Cadence, string> = {
  manual: 'No schedule — I\'ll send updates when I choose',
  daily: 'Every day',
  weekly: 'Weekly',
  fortnightly: 'Every other week',
  monthly: 'Monthly',
  milestone: 'When a milestone is reached',
};

const CADENCE_HINT: Record<Cadence, string> = {
  manual: 'Nothing is sent automatically. Use "Generate an update now" on a project whenever you want one.',
  daily: 'A draft each day, covering the day\'s work.',
  weekly: 'A draft once a week, covering the week.',
  fortnightly: 'A draft every two weeks.',
  monthly: 'A draft once a month.',
  milestone: 'A draft each time a milestone is marked complete — for jobs paid on stages rather than dates.',
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Data {
  cadences: Cadence[];
  timezone: string;
  org: { cadence: Cadence; day: number; time: string; anchor?: string | null };
  project: { cadence: Cadence | null; day: number | null; time: string | null; anchor: string | null } | null;
  effective: { cadence: Cadence; day: number; time: string };
  description: string;
}

export default function ScheduleSettings({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const scope: 'org' | 'project' = projectId ? 'project' : 'org';

  async function load() {
    const res = await fetch(`/api/schedule${projectId ? `?project_id=${projectId}` : ''}`);
    if (res.ok) setData(await res.json());
  }
  useEffect(() => { load(); }, [projectId]);

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  // On a project, an unset override means "follow the business default".
  const following = scope === 'project' && !data.project?.cadence;
  const current = scope === 'project'
    ? {
        cadence: (data.project?.cadence ?? data.org.cadence) as Cadence,
        day: data.project?.day ?? data.org.day,
        time: data.project?.time ?? data.org.time,
      }
    : data.org;

  async function save(next: Partial<{ cadence: Cadence | null; day: number | null; time: string | null; timezone: string }>) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, project_id: projectId, ...next }),
      });
      await load();
      setSaved(true);
    } finally { setSaving(false); }
  }

  const usesDay = current.cadence === 'weekly' || current.cadence === 'fortnightly';
  const usesDom = current.cadence === 'monthly';
  const usesTime = usesDay || usesDom || current.cadence === 'daily';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Client update schedule</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {scope === 'org'
            ? 'The default for every project. Any project can override it.'
            : 'This project only. Leave it following the business default unless it runs differently.'}
        </p>
      </div>

      {scope === 'project' && (
        <div className={`text-xs rounded-md px-3 py-2 border ${
          following
            ? 'bg-gray-50 border-gray-200 text-gray-600'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {following ? (
            <>Following the business default: <strong>{data.description}</strong></>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span>This project overrides the business default.</span>
              <button
                type="button"
                onClick={() => save({ cadence: null, day: null, time: null })}
                className="font-semibold underline whitespace-nowrap"
              >
                Follow the default
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">How often</label>
        <select
          value={current.cadence}
          onChange={(e) => save({ cadence: e.target.value as Cadence })}
          disabled={saving}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
        >
          {data.cadences.map((c) => (
            <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">{CADENCE_HINT[current.cadence]}</p>
      </div>

      {(usesDay || usesDom || usesTime) && (
        <div className="grid grid-cols-2 gap-3">
          {usesDay && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Day</label>
              <select
                value={current.day}
                onChange={(e) => save({ day: Number(e.target.value) })}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
              >
                {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </div>
          )}

          {usesDom && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Day of month</label>
              <input
                type="number" min={1} max={28}
                value={current.day}
                onChange={(e) => save({ day: Number(e.target.value) })}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
              />
            </div>
          )}

          {usesTime && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={current.time}
                onChange={(e) => save({ time: e.target.value })}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
              />
            </div>
          )}
        </div>
      )}

      {scope === 'org' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={data.timezone}
            onChange={(e) => save({ timezone: e.target.value })}
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
          >
            {['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'UTC'].map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Times above are local to this zone, so 4pm stays 4pm through the clock change.
          </p>
        </div>
      )}

      <div className="text-xs text-gray-500 border-t border-gray-100 pt-3">
        {saving ? 'Saving…' : saved ? 'Saved.' : <>Currently: <strong className="text-gray-700">{data.description}</strong></>}
      </div>
    </div>
  );
}
