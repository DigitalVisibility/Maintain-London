import { useEffect, useState } from 'react';

/**
 * How chatty the message alerts are, and who a client's reply reaches.
 *
 * The default is "tell me once": you're told a thread has something new, and not
 * told again until you've looked at it. Reading re-arms it, so the next message
 * gets through immediately.
 */

type Mode = 'once' | 'chase';

interface Data {
  message_notify: Mode;
  sender_name: string;
  reply_to: string;
}

export default function NotificationSettings() {
  const [data, setData] = useState<Data | null>(null);
  const [replyTo, setReplyTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch('/api/org/notifications');
    if (!res.ok) return;
    const d: Data = await res.json();
    setData(d);
    setReplyTo(d.reply_to ?? '');
  }
  useEffect(() => { load(); }, []);

  async function save(next: Partial<Data>) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/org/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      await load();
      setSaved(true);
    } finally { setSaving(false); }
  }

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Message notifications</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          When a client writes to you (or you write to them), who gets emailed and how often.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-gray-700 mb-1">If nobody opens the thread</legend>

        {([
          {
            value: 'once' as Mode,
            title: 'Tell me once',
            hint: 'One email per conversation. You won\'t be told again until you\'ve read it — then the next message emails you straight away. Anything you miss still shows as an unread badge.',
          },
          {
            value: 'chase' as Mode,
            title: 'Keep chasing me',
            hint: 'Keep reminding while new messages arrive and nobody has read them — at most one email every 30 minutes.',
          },
        ]).map((opt) => (
          <label
            key={opt.value}
            className={`flex gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
              data.message_notify === opt.value
                ? 'border-[#AEDE4A] bg-[#AEDE4A]/10'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="message_notify"
              checked={data.message_notify === opt.value}
              disabled={saving}
              onChange={() => save({ message_notify: opt.value })}
              className="mt-0.5 h-4 w-4 text-[#83B81A] focus:ring-[#AEDE4A]"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{opt.title}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Reply-to address</label>
        <input
          type="email"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          onBlur={() => { if (replyTo !== (data.reply_to ?? '')) save({ reply_to: replyTo }); }}
          placeholder="e.g. office@yourbusiness.co.uk"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
        />
        <p className="text-xs text-gray-500 mt-1">
          Emails go out as <strong className="text-gray-700">{data.sender_name}</strong>. If a client hits
          reply, this is where it lands. Leave blank and replies go nowhere — so it's worth setting.
        </p>
      </div>

      <div className="text-xs text-gray-400 border-t border-gray-100 pt-3">
        {saving ? 'Saving…' : saved ? 'Saved.' : 'Changes save as you make them.'}
      </div>
    </div>
  );
}
