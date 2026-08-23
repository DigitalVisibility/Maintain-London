import { useEffect, useState } from 'react';

/** base64url VAPID key → Uint8Array for applicationServerKey. */
function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationToggle() {
  const [supported] = useState(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  const [configured, setConfigured] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function currentEndpoint(): Promise<string | null> {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub?.endpoint ?? null;
  }

  async function refresh() {
    if (!supported) return;
    const endpoint = await currentEndpoint();
    const r = await fetch(`/api/push/subscribe${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`);
    if (!r.ok) return;
    const d = await r.json();
    setConfigured(!!d.configured);
    setPublicKey(d.publicKey);
    setSubscribed(!!endpoint && !!d.subscribed);
  }
  useEffect(() => { refresh(); }, []);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setMsg({ kind: 'err', text: 'Notifications were blocked. Allow them in your browser settings to turn this on.' }); return; }
      if (!publicKey) { setMsg({ kind: 'err', text: 'Push isn’t configured on this deployment yet.' }); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error('Could not save subscription');
      setSubscribed(true);
      setMsg({ kind: 'ok', text: 'Notifications are on for this device.' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message || 'Could not enable notifications.' });
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg({ kind: 'ok', text: 'Notifications turned off for this device.' });
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not send test');
      setMsg({ kind: 'ok', text: 'Test sent — it should pop up in a moment.' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally { setBusy(false); }
  }

  if (!supported) return <p className="text-sm text-gray-500">This device/browser doesn’t support push notifications.</p>;
  if (!configured) return <p className="text-sm text-gray-500">Push notifications aren’t switched on for this deployment yet.</p>;

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`text-sm px-3 py-2 rounded-md ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>
      )}
      <div className="flex items-center gap-3">
        {subscribed ? (
          <>
            <button onClick={disable} disabled={busy} className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50">Turn off</button>
            <button onClick={sendTest} disabled={busy} className="px-4 py-2 text-sm font-medium bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 rounded-md disabled:opacity-50">Send test</button>
            <span className="text-xs text-green-600">On for this device</span>
          </>
        ) : (
          <button onClick={enable} disabled={busy} className="px-4 py-2 text-sm font-semibold bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 rounded-md disabled:opacity-50">
            {busy ? 'Enabling…' : 'Turn on notifications'}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">Get notified about new messages, approvals and clock reminders — even when the app is closed. Turn on per device.</p>
    </div>
  );
}
