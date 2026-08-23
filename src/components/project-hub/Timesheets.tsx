import { useEffect, useRef, useState } from 'react';

interface Row {
  id: string; project_id: string; project_name: string; user_id: string; user_name: string | null;
  clock_in: string; clock_out: string | null; break_minutes: number; worked_hours: number;
  clock_in_lat: number | null; clock_in_lng: number | null;
  clock_out_lat: number | null; clock_out_lng: number | null;
}

interface LabourRow {
  project_id: string; project_name: string; date: string;
  name: string; person_id: string | null; hours: number; note: string | null;
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().split('T')[0];
}
function fmtDate(ts: string) {
  return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtDay(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Timesheets() {
  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [labour, setLabour] = useState<LabourRow[]>([]);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/time/report?from=${from}&to=${to}`);
      const data = await res.json();
      setRows(data.rows || []);
      setLabour(data.labour || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Totals
  const byWorker = new Map<string, number>();
  const byProject = new Map<string, number>();
  let grand = 0;
  for (const r of rows) {
    byWorker.set(r.user_name || 'Unknown', (byWorker.get(r.user_name || 'Unknown') || 0) + r.worked_hours);
    byProject.set(r.project_name, (byProject.get(r.project_name) || 0) + r.worked_hours);
    grand += r.worked_hours;
  }
  for (const l of labour) {
    byWorker.set(l.name, (byWorker.get(l.name) || 0) + l.hours);
    byProject.set(l.project_name, (byProject.get(l.project_name) || 0) + l.hours);
    grand += l.hours;
  }

  // Leaflet map (loaded from CDN, best-effort).
  useEffect(() => {
    const pts = rows.filter((r) => r.clock_in_lat != null && r.clock_in_lng != null);
    if (pts.length === 0 || !mapRef.current) return;

    let cancelled = false;
    async function ensureLeaflet(): Promise<any> {
      if ((window as any).L) return (window as any).L;
      await new Promise<void>((resolve) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = () => resolve();
        document.head.appendChild(js);
      });
      return (window as any).L;
    }

    ensureLeaflet().then((L) => {
      if (cancelled || !mapRef.current) return;
      if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; }
      const map = L.map(mapRef.current).setView([pts[0].clock_in_lat, pts[0].clock_in_lng], 12);
      mapObj.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      const group: any[] = [];
      for (const r of pts) {
        const mk = L.marker([r.clock_in_lat, r.clock_in_lng]).addTo(map)
          .bindPopup(`<b>${r.user_name || 'Worker'}</b><br>${r.project_name}<br>In: ${fmtDate(r.clock_in)}`);
        group.push(mk);
        if (r.clock_out_lat != null && r.clock_out_lng != null) {
          L.circleMarker([r.clock_out_lat, r.clock_out_lng], { radius: 6, color: '#83B81A' }).addTo(map)
            .bindPopup(`Out: ${r.clock_out ? fmtDate(r.clock_out) : ''}`);
        }
      }
      if (group.length > 1) {
        const fg = L.featureGroup(group);
        map.fitBounds(fg.getBounds().pad(0.3));
      }
    });
    return () => { cancelled = true; };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="px-5 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
          {loading ? 'Loading…' : 'Run report'}
        </button>
        <div className="ml-auto text-sm text-gray-500">Total: <span className="font-bold text-gray-900">{grand.toFixed(2)}h</span></div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">By worker (payroll)</h3>
          {[...byWorker.entries()].map(([name, h]) => (
            <div key={name} className="flex justify-between text-sm py-1 border-b border-gray-50">
              <span className="text-gray-700">{name}</span><span className="font-medium">{h.toFixed(2)}h</span>
            </div>
          ))}
          {byWorker.size === 0 && <p className="text-sm text-gray-400">No completed sessions.</p>}
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">By project (billing)</h3>
          {[...byProject.entries()].map(([name, h]) => (
            <div key={name} className="flex justify-between text-sm py-1 border-b border-gray-50">
              <span className="text-gray-700">{name}</span><span className="font-medium">{h.toFixed(2)}h</span>
            </div>
          ))}
          {byProject.size === 0 && <p className="text-sm text-gray-400">No completed sessions.</p>}
        </div>
      </div>

      {/* Map */}
      {rows.some((r) => r.clock_in_lat != null) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
          <div ref={mapRef} style={{ height: 320, borderRadius: 8, overflow: 'hidden' }} />
        </div>
      )}

      {/* Detail */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr><th className="text-left px-4 py-2">Worker</th><th className="text-left px-4 py-2">Project</th><th className="text-left px-4 py-2">In</th><th className="text-left px-4 py-2">Out</th><th className="text-right px-4 py-2">Break</th><th className="text-right px-4 py-2">Hours</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{r.user_name}</td>
                <td className="px-4 py-2">{r.project_name}</td>
                <td className="px-4 py-2">{fmtDate(r.clock_in)}</td>
                <td className="px-4 py-2">{r.clock_out ? fmtDate(r.clock_out) : '—'}</td>
                <td className="px-4 py-2 text-right">{Math.round(r.break_minutes)}m</td>
                <td className="px-4 py-2 text-right font-medium">{r.worked_hours.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No data for this range.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Site-logged labour */}
      {labour.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Site-logged labour</h3>
            <p className="text-xs text-gray-500">Hours the manager recorded in the diary for workers without an app clock-in.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-2">Worker</th><th className="text-left px-4 py-2">Project</th><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Note</th><th className="text-right px-4 py-2">Hours</th></tr>
            </thead>
            <tbody>
              {labour.map((l, i) => (
                <tr key={`${l.project_id}-${l.person_id ?? l.name}-${l.date}-${i}`} className="border-t border-gray-100">
                  <td className="px-4 py-2">{l.name}</td>
                  <td className="px-4 py-2">{l.project_name}</td>
                  <td className="px-4 py-2">{fmtDay(l.date)}</td>
                  <td className="px-4 py-2 text-gray-500">{l.note || '—'}</td>
                  <td className="px-4 py-2 text-right font-medium">{l.hours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
