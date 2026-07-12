import { useEffect, useState } from 'react';

/**
 * Project milestones — "roof stripped, felted, battened, watertight".
 *
 * A milestone is a programme marker and, when it completes, a trigger for a
 * client update. It is also what a stage payment will hang off, which is why it's
 * one object rather than two that drift apart.
 */

interface Milestone {
  id: string;
  name: string;
  sort_order: number;
  target_date: string | null;
  status: 'pending' | 'complete';
  completed_at: string | null;
  triggers_summary: number;
}

export default function Milestones({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Milestone[] | null>(null);
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/milestones?project_id=${projectId}`);
    if (res.ok) setItems(await res.json());
  }
  useEffect(() => { load(); }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('new');
    try {
      await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: name.trim(),
          target_date: targetDate || null,
        }),
      });
      setName('');
      setTargetDate('');
      await load();
    } finally { setBusy(''); }
  }

  async function toggleComplete(m: Milestone) {
    const completing = m.status !== 'complete';
    if (completing && m.triggers_summary) {
      if (!confirm(`Mark "${m.name}" complete?\n\nThis will draft a client update covering the work since the last one, ready for you to review.`)) return;
    }

    setBusy(m.id);
    setNote(null);
    try {
      const res = await fetch(`/api/milestones/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: completing ? 'complete' : 'pending' }),
      });
      const data = await res.json();
      if (data.summary_id) setNote('A client update has been drafted and is waiting for your approval.');
      await load();
    } finally { setBusy(''); }
  }

  async function toggleTrigger(m: Milestone) {
    setBusy(m.id);
    try {
      await fetch(`/api/milestones/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggers_summary: !m.triggers_summary }),
      });
      await load();
    } finally { setBusy(''); }
  }

  async function remove(m: Milestone) {
    if (!confirm(`Delete "${m.name}"?`)) return;
    setBusy(m.id);
    try {
      await fetch(`/api/milestones/${m.id}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(''); }
  }

  if (!items) return <p className="text-sm text-gray-500">Loading…</p>;

  const done = items.filter((m) => m.status === 'complete').length;

  return (
    <div className="space-y-3">
      {note && (
        <div className="text-sm rounded-md px-3 py-2 bg-green-50 border border-green-200 text-green-800">
          {note}
        </div>
      )}

      {items.length > 0 && (
        <div className="text-xs text-gray-500">{done} of {items.length} complete</div>
      )}

      <div className="space-y-1">
        {items.map((m) => (
          <div key={m.id} className="bg-white rounded-md border border-gray-200 px-3 py-2 flex items-center gap-3">
            <input
              type="checkbox"
              checked={m.status === 'complete'}
              disabled={busy === m.id}
              onChange={() => toggleComplete(m)}
              className="h-4 w-4 rounded border-gray-300 text-[#83B81A] focus:ring-[#AEDE4A] flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className={`text-sm truncate ${m.status === 'complete' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {m.name}
              </div>
              <div className="text-xs text-gray-400">
                {m.target_date ? `Due ${m.target_date}` : 'No target date'}
                {m.status === 'complete' && m.completed_at && ` · Completed ${m.completed_at.split(' ')[0]}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggleTrigger(m)}
              disabled={busy === m.id}
              title={m.triggers_summary
                ? 'Completing this drafts a client update — click to stop that'
                : 'Completing this does not notify the client — click to enable'}
              className={`text-xs px-2 py-1 rounded-full flex-shrink-0 transition-colors ${
                m.triggers_summary
                  ? 'bg-[#AEDE4A]/20 text-[#5f8410] hover:bg-[#AEDE4A]/40'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              {m.triggers_summary ? 'Updates client' : 'Silent'}
            </button>

            <button
              type="button"
              onClick={() => remove(m)}
              disabled={busy === m.id}
              className="text-gray-300 hover:text-red-500 flex-shrink-0"
              title="Delete"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          No milestones yet. Add the stages this job is measured in — "strip out complete",
          "watertight", "first fix" — and the client can be updated as each one lands.
        </p>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2 pt-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Milestone, e.g. Roof watertight"
          className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
        />
        <button
          type="submit"
          disabled={busy === 'new' || !name.trim()}
          className="px-4 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
