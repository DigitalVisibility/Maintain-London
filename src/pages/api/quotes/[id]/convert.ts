import type { APIRoute } from 'astro';
import { authoriseQuote, convertToProject, loadQuoteRow } from '../../../../lib/quotes';

export const prerender = false;

/**
 * POST /api/quotes/{id}/convert — an accepted quote graduates into a project.
 *
 * This is the seam between "a job we are pricing" and "a job we are doing". The
 * accepted net lands on the new project as its quoted sum, so the valuation, the
 * variations register and every invoice that follows are all working from the
 * figure the client signed rather than a number typed in again from memory.
 *
 * Safe to call twice: convertToProject returns the existing project if the quote
 * has already been converted, so a double tap or a retried request can never
 * leave the business with two projects for one job.
 */
export const POST: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const auth = await authoriseQuote(env.DB, locals, params.id);
  if (!auth.ok) return auth.response;

  const quote = auth.quote;

  // Already converted — hand back the project rather than treating a second
  // request as an error the user has to interpret.
  if (quote.project_id) {
    const result = await convertToProject(env.DB, quote, locals);
    return Response.json({ project_id: result.project_id, created: result.created });
  }

  if (quote.status !== 'accepted') {
    return Response.json(
      { error: `Only an accepted quote becomes a project. Mark this one accepted first — it is currently ${quote.status}.` },
      { status: 409 }
    );
  }

  const result = await convertToProject(env.DB, quote, locals);
  const updated = await loadQuoteRow(env.DB, quote.id);

  return Response.json({
    project_id: result.project_id,
    created: result.created,
    quote: updated,
  }, { status: result.created ? 201 : 200 });
};
