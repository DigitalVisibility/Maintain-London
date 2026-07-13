/** The document hub's folders and shared types. */

export interface ProjectDocument {
  id: string;
  org_id: string | null;
  project_id: string;
  folder: string;
  filename: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number | null;
  caption: string | null;
  client_visible: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

/**
 * The standard folders, from the wireframe. A fixed set keeps every project's
 * filing consistent and the client-facing view predictable; uploads to an
 * unknown folder fall back to "Documents".
 */
export const FOLDERS = [
  'Drawings',
  'Interior Finishes',
  'Kitchen',
  'Bathrooms',
  'Superseded',
  'Contracts',
  'Handovers',
  'Progress Pics',
  'Financials',
] as const;

export type Folder = (typeof FOLDERS)[number];

export function normaliseFolder(folder: string | null | undefined): string {
  const match = FOLDERS.find((f) => f.toLowerCase() === (folder ?? '').trim().toLowerCase());
  return match ?? 'Documents';
}

/** Whether a folder is one a client would normally be shown (used as an upload default). */
export function clientVisibleByDefault(folder: string): boolean {
  return ['Contracts', 'Handovers', 'Progress Pics', 'Financials'].includes(folder);
}
