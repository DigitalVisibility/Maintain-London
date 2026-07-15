import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { isStaff, hasCap } from '../../../lib/capabilities';
import { validateFile, buildDocKey, uploadToR2 } from '../../../lib/r2';
import { normaliseFolder, type ProjectDocument } from '../../../lib/documents';

export const prerender = false;

/**
 * GET /api/documents?project_id= — the project's files.
 * Staff see everything; a client sees only what's been marked client-visible.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const docs = isStaff(locals.role)
    ? await queryAll<ProjectDocument>(
        env.DB, 'SELECT * FROM documents WHERE project_id = ? ORDER BY folder, created_at DESC', [projectId]
      )
    : await queryAll<ProjectDocument>(
        env.DB,
        'SELECT * FROM documents WHERE project_id = ? AND client_visible = 1 ORDER BY folder, created_at DESC',
        [projectId]
      );

  return Response.json(docs);
};

/**
 * POST /api/documents — upload a file into a folder (multipart).
 * Fields: file, project_id, folder, caption?, client_visible?
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Uploading to the project filing cabinet is a staff action.
  if (!isStaff(locals.role) || !hasCap(locals, 'edit_diary')) {
    return new Response('Forbidden', { status: 403 });
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = form.get('file') as File | null;
  const projectId = form.get('project_id') as string | null;
  const folder = normaliseFolder(form.get('folder') as string | null);
  const caption = (form.get('caption') as string | null) ?? null;
  // If the caller didn't say, fall back to whether this business marked the
  // folder client-facing by default.
  const rawVisible = form.get('client_visible');
  let clientVisible: boolean;
  if (rawVisible === null) {
    const def = await queryOne<{ client_default: number }>(
      env.DB, 'SELECT client_default FROM document_folders WHERE org_id = ? AND name = ?',
      [locals.org?.id ?? '', folder]
    );
    clientVisible = def?.client_default === 1;
  } else {
    clientVisible = rawVisible === 'true' || rawVisible === '1';
  }

  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
  if (!projectId) return Response.json({ error: 'project_id is required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const validation = validateFile(file.type, file.size);
  if (!validation.valid) return Response.json({ error: validation.error }, { status: 400 });

  const r2Key = buildDocKey(projectId, folder, file.name);
  await uploadToR2(env.R2, r2Key, await file.arrayBuffer(), file.type, {
    projectId, uploadedBy: user.id,
  });

  const id = generateId();
  await execute(
    env.DB,
    `INSERT INTO documents
       (id, org_id, project_id, folder, filename, r2_key, mime_type, size_bytes,
        caption, client_visible, uploaded_by, uploaded_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, locals.org?.id ?? null, projectId, folder, file.name, r2Key, file.type, file.size,
      caption, clientVisible ? 1 : 0, user.id, user.name ?? null, now(),
    ]
  );

  return Response.json({
    id, folder, filename: file.name, r2_key: r2Key, mime_type: file.type,
    size_bytes: file.size, caption, client_visible: clientVisible ? 1 : 0,
    url: `/api/documents/${encodeURIComponent(r2Key)}`,
  }, { status: 201 });
};
