import { useEffect, useRef, useState } from 'react';

interface Session {
  id: string; project_id: string; status: string;
  clock_in: string; break_minutes: number; break_started_at: string | null;
}
interface Props { projectId: string; projectName: string; }

function parseTs(ts: string): number {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime();
}

/** Best-effort browser geolocation; resolves to {} if denied/unavailable. */
function getPosition(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export default function ClockWidget({ projectId, projectName }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const timer = useRef<number | null>(null);

  async function loadActive() {
    const res = await fetch('/api/time?active=1');
    setSession(res.ok ? await res.json() : null);
    setLoaded(true);
  }
  useEffect(() => { loadActive(); }, []);

  // Live ticking clock while a session is open.
  useEffect(() => {
    if (session && session.status !== 'completed') {
      timer.current = window.setInterval(() => setTick((t) => t + 1), 1000);
      return () => { if (timer.current) clearInterval(timer.current); };
    }
  }, [session]);

  const elapsed = (() => {
    if (!session) return '';
    const gross = (Date.now() - parseTs(session.clock_in)) / 1000;
    let brk = (session.break_minutes || 0) * 60;
    if (session.status === 'on_break' && session.break_started_at) {
      brk += (Date.now() - parseTs(session.break_started_at)) / 1000;
    }
    const net = Math.max(0, gross - brk);
    const h = Math.floor(net / 3600), m = Math.floor((net % 3600) / 60), s = Math.floor(net % 60);
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  })();

  async function clockIn() {
    setBusy(true);
    try {
      const pos = await getPosition();
      const res = await fetch('/api/time', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...pos }),
      });
      if (res.ok) await loadActive();
      else alert((await res.json()).error || 'Could not clock in');
    } finally { setBusy(false); }
  }

  async function action(act: 'break_start' | 'break_resume' | 'clock_out') {
    if (!session) return;
    setBusy(true);
    try {
      const pos = act === 'clock_out' ? await getPosition() : {};
      const res = await fetch(`/api/time/${session.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...pos }),
      });
      if (res.ok) await loadActive();
    } finally { setBusy(false); }
  }

  if (!loaded) return null;

  // Clocked into a different project.
  if (session && session.project_id !== projectId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        You're currently clocked in on another project. Clock out there before clocking in here.
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Time clock</div>
          <div className="text-xs text-gray-500">Clock in to {projectName}. Your location is captured.</div>
        </div>
        <button onClick={clockIn} disabled={busy} className="px-5 py-2.5 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
          {busy ? '…' : 'Clock in'}
        </button>
      </div>
    );
  }

  const onBreak = session.status === 'on_break';
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {onBreak ? 'On break' : 'Clocked in'} · {projectName}
          </div>
          <div className="text-2xl font-bold text-gray-900 font-display tabular-nums mt-1">{elapsed}</div>
          <div className="text-xs text-gray-400">worked time {session.break_minutes ? `· ${Math.round(session.break_minutes)}m break` : ''}</div>
        </div>
        <div className="flex flex-col gap-2">
          {!onBreak
            ? <button onClick={() => action('break_start')} disabled={busy} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md disabled:opacity-50">Start break</button>
            : <button onClick={() => action('break_resume')} disabled={busy} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md disabled:opacity-50">Resume</button>}
          <button onClick={() => action('clock_out')} disabled={busy} className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-md disabled:opacity-50">Clock out</button>
        </div>
      </div>
    </div>
  );
}
