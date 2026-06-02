import type { ReactNode } from 'react';
import { useState } from 'react';
import { signOut } from '../../lib/auth-client';

interface Props { className?: string; children?: ReactNode; }

/**
 * Sign out via the Better Auth client (sends JSON) rather than an HTML form,
 * which would post application/x-www-form-urlencoded and be rejected.
 */
export default function SignOutButton({ className, children }: Props) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch {
      // Ignore — we redirect to login regardless.
    } finally {
      window.location.href = '/project-hub/login';
    }
  }

  return (
    <button type="button" onClick={handle} disabled={busy} className={className}>
      {children ?? 'Sign Out'}
    </button>
  );
}
