import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $isOnline, $pendingSyncCount } from '../../stores/offline';
import { queueClock, processQueue, getSyncQueueCount } from '../../lib/offline';

interface Session {
  id: string; project_id: string; status: string;
  clock_in: string; break_minutes: number; break_started_at: string | null;
  /** True for a session started offline and not yet synced. */
  local?: boolean;
  lat?: number | null; lng?: number | null;
}
interface Props { projectId: string; projectName: string; }

const LOCAL_KEY = 'pd_local_clock';

function parseTs(ts: string): number {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime();
}
/** 'YYYY-MM-DD HH:MM:SS' in UTC — same shape the server stores, so parseTs works. */
function nowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

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

function readLocal(): Session | null {
  try { const s = localStorage.getItem(LOCAL_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function writeLocal(s: Session | null) {
  try { s ? localStorage.setItem(LOCAL_KEY, JSON.stringify(s)) : localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
}

export default function ClockWidget({ projectId, projectName }: Props) {
  const isOnline = useStore($isOnline);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const timer = useRef<number | null>(null);

  async function flushQueue() {
    try {
      const { synced } = await processQueue();
      if (synced > 0) $pendingSyncCount.set(await getSyncQueueCount());
    } catch { /* stays queued */ }
  }

  async function loadActive() {
    // A local (offline) session always takes precedence — it hasn't been sent yet.
    const local = readLocal();
    if (local) { setSession(local); setLoaded(true); return; }
    try {
      const res = await fetch('/api/time?active=1');
      setSession(res.ok ? await res.json() : null);
    } catch {
      setSession(null);
    }
    setLoaded(true);
  }

  useEffect(() => {
    (async () => { if (navigator.onLine) await flushQueue(); await loadActive(); })();
    const onOnline = async () => { await flushQueue(); await loadActive(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

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
      if (navigator.onLine) {
        try {
          const res = await fetch('/api/time', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, ...pos }),
          });
          if (res.ok) { await loadActive(); return; }
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Could not clock in');
          return;
        } catch { /* fall through to offline */ }
      }
      // Offline: start a local session.
      const local: Session = {
        id: 'local-' + Date.now(), project_id: projectId, status: 'active',
        clock_in: nowStamp(), break_minutes: 0, break_started_at: null,
        local: true, lat: pos.lat ?? null, lng: pos.lng ?? null,
      };
      writeLocal(local); setSession(local);
    } finally { setBusy(false); }
  }

  async function action(act: 'break_start' | 'break_resume' | 'clock_out') {
    if (!session) return;
    setBusy(true);
    try {
      // ── Local (offline-started) session: handle entirely on the device ──
      if (session.local) {
        if (act === 'break_start') {
          const next = { ...session, status: 'on_break', break_started_at: nowStamp() };
          writeLocal(next); setSession(next);
        } else if (act === 'break_resume') {
          const extra = session.break_started_at ? (Date.now() - parseTs(session.break_started_at)) / 60000 : 0;
          const next = { ...session, status: 'active', break_started_at: null, break_minutes: (session.break_minutes || 0) + extra };
          writeLocal(next); setSession(next);
        } else {
          // Clock out: finalise and queue the completed session for sync.
          const pos = await getPosition();
          let brkMin = session.break_minutes || 0;
          if (session.status === 'on_break' && session.break_started_at) {
            brkMin += (Date.now() - parseTs(session.break_started_at)) / 60000;
          }
          await queueClock(session.id, '/api/time', 'POST', {
            offline: true, project_id: session.project_id,
            clock_in: session.clock_in, clock_out: nowStamp(),
            break_minutes: Math.round(brkMin),
            lat: session.lat ?? pos.lat ?? null, lng: session.lng ?? pos.lng ?? null,
          });
          writeLocal(null); setSession(null);
          $pendingSyncCount.set(await getSyncQueueCount());
          if (navigator.onLine) await flushQueue();
        }
        return;
      }

      // ── Server session ──
      const pos = act === 'clock_out' ? await getPosition() : {};
      if (!navigator.onLine && act === 'clock_out') {
        // Offline clock-out of a live server session — queue the PATCH.
        await queueClock('patch-' + session.id, `/api/time/${session.id}`, 'PATCH', { action: 'clock_out', ...pos });
        setSession(null);
        $pendingSyncCount.set(await getSyncQueueCount());
        return;
      }
      const res = await fetch(`/api/time/${session.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...pos }),
      });
      if (res.ok) await loadActive();
    } finally { setBusy(false); }
  }

  if (!loaded) return null;

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
          <div className="text-xs text-gray-500">
            Clock in to {projectName}. Your location is captured.{!isOnline && ' Works offline — syncs when you’re back online.'}
          </div>
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
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            {onBreak ? 'On break' : 'Clocked in'} · {projectName}
            {session.local && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">offline</span>}
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
