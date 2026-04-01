/** D1 query helpers for the Project Hub */

/** Generate a unique ID (URL-safe, 21 chars) */
export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Get current ISO datetime string */
export function now(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

/** Run a parameterised SELECT and return all rows */
export async function queryAll<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results;
}

/** Run a parameterised SELECT and return first row */
export async function queryOne<T>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? null;
}

/** Run a parameterised INSERT/UPDATE/DELETE */
export async function execute(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/** Run multiple statements in a batch (D1 transaction) */
export async function batch(
  db: D1Database,
  statements: { sql: string; params?: unknown[] }[]
): Promise<D1Result[]> {
  const prepared = statements.map((s) =>
    db.prepare(s.sql).bind(...(s.params ?? []))
  );
  return db.batch(prepared);
}
