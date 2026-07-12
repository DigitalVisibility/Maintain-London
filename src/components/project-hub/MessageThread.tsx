import { useEffect, useRef, useState } from 'react';

interface Message {
  id: string; user_id: string; author_name: string | null; author_role: string | null;
  body: string; created_at: string;
}
interface Props { projectId: string; meUserId?: string; }

/** How often an open thread checks for replies. */
const POLL_MS = 20_000;

export default function MessageThread({ projectId, meUserId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);

  async function load() {
    const res = await fetch(`/api/messages?project_id=${projectId}`);
    if (!res.ok) return;
    const next: Message[] = await res.json();
    setMessages(next);
    countRef.current = next.length;
  }

  /** Looking at the thread is reading it. */
  async function markRead() {
    await fetch('/api/messages/unread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    }).catch(() => {});
  }

  useEffect(() => {
    load().then(markRead);

    // The thread used to fetch once and then sit there, so a reply that arrived
    // while you had the page open was invisible until you reloaded.
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const before = countRef.current;
      await load();
      if (countRef.current > before) markRead();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [projectId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, body: text.trim() }),
      });
      if (res.ok) { setText(''); await load(); await markRead(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col" style={{ maxHeight: 480 }}>
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Messages</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 200 }}>
        {messages.length === 0 && <p className="text-sm text-gray-400">No messages yet. Say hello 👋</p>}
        {messages.map((m) => {
          const mine = meUserId && m.user_id === meUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-[#AEDE4A]/20 text-gray-900' : 'bg-gray-100 text-gray-800'}`}>
                {!mine && <div className="text-xs font-medium text-gray-500 mb-0.5">{m.author_name || 'Team'}</div>}
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-gray-100 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
        <button type="submit" disabled={busy || !text.trim()} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">Send</button>
      </form>
    </div>
  );
}
