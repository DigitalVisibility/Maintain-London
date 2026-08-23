/**
 * Claude turns a walkthrough into a sectioned scope of works.
 *
 * A builder walks a job they are pricing, talks at their phone and takes photos.
 * What comes out of that is unstructured and, an hour later, half-remembered.
 * This turns it into the thing the office actually needs: sections by room, terse
 * scope lines, and — most valuably — a written list of every unknown the walk
 * surfaced but could not settle.
 *
 * Two rules matter more than the rest, and both are stated hard in the prompt:
 *   1. No prices. Pricing is the estimator's job. A rate proposed by a machine
 *      that reaches a client is a number the builder is then held to.
 *   2. No invented quantities. An area or a length nobody measured, once it is on
 *      a quote, is a commitment made by nobody.
 */

import Anthropic from '@anthropic-ai/sdk';

/** Formats the vision API will accept. HEIC from an iPhone and PDFs are skipped. */
const VISION_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Whether this file can be sent to the model as an image block at all. */
export function canSeePhoto(mimeType: string | null | undefined): boolean {
  return !!mimeType && VISION_TYPES.has(mimeType.toLowerCase());
}

export interface ScopePhoto {
  data: ArrayBuffer;
  mimeType: string;
  /** Whatever words already hang off the photo — a caption, or the filename. */
  label?: string | null;
}

export interface DraftScopeInput {
  /** Transcribed voice notes from the walk, oldest first. Required. */
  transcripts: string[];
  photos?: ScopePhoto[];
  /** What the estimator has already typed on the quote, as background. */
  title?: string | null;
  address?: string | null;
  clientName?: string | null;
  notes?: string | null;
}

export interface ScopeLine {
  description: string;
  qty?: number;
  unit?: string;
  provisional: boolean;
}

export interface ScopeSection {
  name: string;
  items: ScopeLine[];
}

export interface DraftedScope {
  sections: ScopeSection[];
  assumptions: string[];
  title?: string;
  notes?: string;
}

const SYSTEM = `You turn a UK builder's spoken walkthrough of a job they are PRICING into a sectioned scope of works.

The builder has walked round a property they have not yet won, talking into their phone and taking photographs. You are given the transcripts of what they said and the photos they took. Produce the scope of works the office will then price.

STRUCTURE
- Group the work by room or area — "Kitchen", "Rear bedroom", "Hallway and stairs", "Externals", "Loft". That is how a walkthrough naturally divides and how a client reads a quote.
- Use "Preliminaries" for site-wide items (skip, scaffold, welfare, protection, making good) and "Externals" for anything outside. Only create a section the walkthrough actually visited.
- Lines are terse trade phrases, not paragraphs: "Take up existing floor tiles and dispose", "Chase and first-fix 6 new sockets", "Skim ceiling and 4 walls". British English, trade vocabulary. One item of work per line.

QUANTITIES
- Give a qty and unit ONLY when the builder stated it, or when it is plainly countable from a photograph (the number of sockets, radiators, doors or windows visible).
- NEVER estimate an area, a length, a volume or a weight that was not said. A guessed quantity that reaches a client becomes a price the builder is held to, and nobody in the chain will remember it was a guess. When you do not know, leave qty and unit out entirely and, if the size genuinely matters to the price, put the gap in assumptions.
- Units are the ones a UK builder writes: m2, m, nr, item, day, week.

PRICES
- NEVER include a price, a rate, a cost, a day rate or a total, anywhere, in any field. Not in a description, not as a parenthetical, not as a "typically around". Pricing is the estimator's job and yours is scope only. If the builder said a price out loud, put it in the notes field as their words — do not turn it into a line.

PROVISIONAL
- Mark a line provisional:true when the work is implied but cannot be confirmed from what you were given: behind a wall or under a floor, no access on the day, condition unknown until something is opened up, or dependent on a decision the client has not made.
- Everything seen plainly and stated plainly is provisional:false.

ASSUMPTIONS — the most valuable thing you produce
- List every unknown the walkthrough surfaced but could not resolve. No loft access on the day. Consumer unit age unconfirmed. Unclear whether the client wants the chimney breast removed. Boiler location not seen. Whether the floor is suspended timber or solid. Party wall may be involved. Asbestos not ruled out on the artex.
- Include anything you deliberately left un-quantified above, and anything the builder said he would "have to check" or "come back to".
- Never drop one to keep the list tidy. An unpriced unknown discovered after winning the job is the single most expensive thing that happens to a builder, and this list is the only place it gets written down.
- One plain sentence each. Do not invent unknowns that the walkthrough gives no reason to suspect.

GENERAL
- Work only from the transcripts and the photos. Do not invent work that was neither said nor visible. If the walkthrough is thin, the scope is short, and that is correct.
- title: a short job name in the builder's terms ("Full refurb, 2-bed flat, Peckham"). Omit it if the walkthrough does not make it clear.
- notes: anything the estimator needs that is not a scope line — access constraints, the client's stated budget or timescale in their own words, sequencing the builder mentioned. Omit if there is nothing.`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Short job name in the builder’s terms. Omit if not clear from the walkthrough.',
    },
    notes: {
      type: 'string',
      description: 'Context for the estimator that is not a scope line: access, stated budget or timescale, sequencing. Omit if none.',
    },
    sections: {
      type: 'array',
      description: 'The scope, grouped by room or area, in the order the walkthrough visited them.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Room or area, e.g. "Kitchen", "Preliminaries", "Externals".' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'One item of work, as a terse trade phrase. Never a price.' },
                qty: { type: 'number', description: 'Only when stated aloud or plainly countable from a photo. Omit otherwise.' },
                unit: { type: 'string', description: 'm2, m, nr, item, day, week. Omit when there is no qty.' },
                provisional: { type: 'boolean', description: 'true when the work is implied but unconfirmable — no access, hidden, or condition unknown.' },
              },
              required: ['description', 'provisional'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'items'],
        additionalProperties: false,
      },
    },
    assumptions: {
      type: 'array',
      description: 'Every unknown the walkthrough surfaced but could not resolve. One plain sentence each. Never dropped.',
      items: { type: 'string' },
    },
  },
  required: ['sections', 'assumptions'],
  additionalProperties: false,
} as const;

/** Photos a single request will carry. Beyond this the context stops helping. */
export const MAX_SCOPE_PHOTOS = 12;

/**
 * Base64 without newlines, built by hand.
 *
 * Workers have no Node `Buffer`, and `String.fromCharCode(...new Uint8Array(buf))`
 * overflows the call stack on a multi-megabyte photo because every byte becomes
 * an argument. Chunking keeps each spread small enough to be safe.
 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Anything that is not a finite positive number is not a quantity. */
function cleanQty(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 1000) / 1000;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Validate what came back before anyone stores it.
 *
 * A malformed response throws rather than being half-saved: the estimator sees
 * "drafting failed, try again" and still has their transcripts and photos, which
 * is far better than a scope with three sections silently missing.
 */
function validate(parsed: unknown): DraftedScope {
  if (!parsed || typeof parsed !== 'object') throw new Error('Claude returned no scope object');
  const raw = parsed as Record<string, unknown>;

  if (!Array.isArray(raw.sections)) throw new Error('Claude returned no sections');

  const sections: ScopeSection[] = [];
  for (const s of raw.sections) {
    if (!s || typeof s !== 'object') continue;
    const section = s as Record<string, unknown>;
    const name = cleanText(section.name, 120);
    const rawItems = Array.isArray(section.items) ? section.items : [];

    const items: ScopeLine[] = [];
    for (const i of rawItems) {
      if (!i || typeof i !== 'object') continue;
      const item = i as Record<string, unknown>;
      const description = cleanText(item.description, 1000);
      if (!description) continue;

      const qty = cleanQty(item.qty);
      items.push({
        description,
        qty,
        // A unit without a quantity means nothing on a quote line, so it goes
        // with the quantity it belonged to.
        unit: qty === undefined ? undefined : cleanText(item.unit, 16),
        provisional: item.provisional === true,
      });
    }

    if (!name || items.length === 0) continue;
    sections.push({ name, items });
  }

  if (sections.length === 0) throw new Error('Claude returned no usable scope lines');

  // assumptions may legitimately be empty, but it must be an array — a string or
  // an object here means the response shape is wrong and should not be trusted.
  if (!Array.isArray(raw.assumptions)) throw new Error('Claude returned no assumptions list');
  const assumptions = [...new Set(
    raw.assumptions.map((a) => cleanText(a, 500)).filter((a): a is string => !!a)
  )];

  return {
    sections,
    assumptions,
    title: cleanText(raw.title, 200),
    notes: cleanText(raw.notes, 4000),
  };
}

/**
 * Draft the scope. Throws on a missing key, a failed call or malformed output —
 * the route turns that into a 502 the estimator can retry, with the walkthrough
 * still intact.
 */
export async function draftScope(apiKey: string, input: DraftScopeInput): Promise<DraftedScope> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const transcripts = (input.transcripts ?? []).map((t) => t.trim()).filter(Boolean);
  if (transcripts.length === 0) {
    // Scope invented from photographs alone is invention. The route refuses this
    // earlier with a clear message; this is the belt to that braces.
    throw new Error('A walkthrough needs at least one transcribed voice note before a scope can be drafted');
  }

  const client = new Anthropic({ apiKey });

  const photos = (input.photos ?? []).filter((p) => canSeePhoto(p.mimeType)).slice(0, MAX_SCOPE_PHOTOS);

  const background = [
    input.title ? `Job as named so far: ${input.title}` : null,
    input.address ? `Address: ${input.address}` : null,
    input.clientName ? `Client: ${input.clientName}` : null,
    input.notes ? `Estimator's existing notes: ${input.notes}` : null,
  ].filter(Boolean);

  const prompt = [
    background.length
      ? `Background (do not treat as scope — the walkthrough is the source):\n${background.join('\n')}\n`
      : '',
    photos.length
      ? `${photos.length} photograph${photos.length === 1 ? '' : 's'} from the walk are above, in the order they were taken.\n`
      : 'No photographs were taken on this walk.\n',
    'Walkthrough transcript, in the order it was recorded:',
    '',
    transcripts.map((t, i) => `[Recording ${i + 1}]\n${t}`).join('\n\n'),
    '',
    'Produce the sectioned scope of works, and the assumptions list.',
  ].filter(Boolean).join('\n');

  // Images first, then the instruction about them: Claude reads the pictures and
  // then what it is being asked to do with them.
  const content: Anthropic.ContentBlockParam[] = photos.map((photo) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: photo.mimeType.toLowerCase() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
      data: toBase64(photo.data),
    },
  }));
  content.push({ type: 'text', text: prompt });

  // claude-opus-5: this is the one job on the platform where being wrong is
  // expensive later rather than annoying now — a missed assumption surfaces as an
  // unpriced cost after the job is won. Effort is high for the same reason.
  // Opus 5 thinks by default and rejects a thinking budget, so none is sent.
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content }],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Claude returned no text content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new Error('Claude returned malformed JSON');
  }

  return validate(parsed);
}
