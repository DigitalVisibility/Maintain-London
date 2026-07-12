/**
 * ID generation, shared by the worker and the browser.
 *
 * Diary child rows (variations, deliveries, …) are given their id in the form,
 * not on the server, so that a row keeps the same id across autosaves and can
 * be referenced by files and approvals. Keep this dependency-free so it can be
 * imported from React components without pulling in any D1 code.
 */

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Generate a unique ID (URL-safe, 21 chars). */
export function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

/** Shape we accept as a row id coming back from a client. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}
