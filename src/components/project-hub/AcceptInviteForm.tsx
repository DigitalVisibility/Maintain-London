import { useEffect, useState } from 'react';
import { signUp } from '../../lib/auth-client';

interface Props {
  token: string;
}

interface InviteInfo {
  valid: boolean;
  email?: string;
  name?: string;
  role?: string;
  org_name?: string;
}

export default function AcceptInviteForm({ token }: Props) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: InviteInfo) => {
        setInfo(data);
        if (data.name) setName(data.name);
      })
      .catch(() => setInfo({ valid: false }));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!info?.email) return;
    if (password.length < 8) {
      setError('Please choose a password of at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // 1) Create the account (signs the user in).
      const result = await signUp.email({ email: info.email, password, name: name || info.email });
      if (result.error) {
        // If the account already exists, the user should just sign in instead.
        setError(result.error.message || 'Could not create your account. You may already have one — try signing in.');
        setLoading(false);
        return;
      }

      // 2) Finalise: assign role/org/project from the invite (server-side).
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not finalise your invitation.');
        setLoading(false);
        return;
      }
      window.location.href = data.redirect || '/project-hub/';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (info && !info.valid) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Invitation not valid</h2>
        <p className="text-sm text-gray-500">
          This invitation link is invalid, has expired, or has already been used. Please ask for a new one.
        </p>
        <a href="/project-hub/login" className="inline-block mt-4 text-sm font-medium text-[#83B81A] hover:underline">
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      {!info ? (
        <p className="text-sm text-gray-500">Checking your invitation…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold text-gray-900 font-display">Join {info.org_name}</h1>
            <p className="text-sm text-gray-500 mt-1">You're joining as <span className="capitalize font-medium">{info.role}</span>. Set a password to finish.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={info.email} disabled className="w-full px-3 py-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Choose a password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" placeholder="At least 8 characters" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 px-4 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md transition-colors disabled:opacity-50">
            {loading ? 'Setting up…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}
