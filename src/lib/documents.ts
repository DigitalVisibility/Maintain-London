/** The document hub's shared types, defaults, and helpers. */

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

export interface DocumentFolder {
  id: string;
  org_id: string;
  name: string;
  sort_order: number;
  client_default: number;
  created_at: string;
}

/**
 * The folders a new business starts with — the cross-trade ones that apply to
 * almost any builder. Trade-specific folders (Kitchen, Bathrooms, …) are left for
 * each business to add, so a roofer isn't stuck with a "Bathrooms" folder.
 * `client_default` marks the ones whose uploads are normally shown to the client.
 */
export const DEFAULT_FOLDERS: { name: string; client_default: number }[] = [
  { name: 'Drawings', client_default: 0 },
  { name: 'Superseded', client_default: 0 },
  { name: 'Contracts', client_default: 1 },
  { name: 'Handovers', client_default: 1 },
  { name: 'Progress Pics', client_default: 1 },
  { name: 'Financials', client_default: 1 },
];

/** Tidy a folder name: trim, collapse whitespace, cap length. Empty → "Documents". */
export function normaliseFolder(folder: string | null | undefined): string {
  const name = (folder ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return name || 'Documents';
}
