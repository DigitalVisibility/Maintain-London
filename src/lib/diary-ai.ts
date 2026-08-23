/**
 * Claude turns a day's talking and photographs into a *structured* diary entry.
 *
 * This is the point of the whole feature. A competitor lets a builder talk over
 * their photos and hands back a document; a document is a dead end. What the
 * business actually needs is rows: activities, delays, personnel, materials,
 * variations — because those rows are what flow on into the variations
 * register, the interim valuation, the client update and the invoice. Prose
 * flows nowhere. So the model's job here is classification, not composition.
 *
 * Two rules carry the whole design:
 *
 *   1. Never invent. A site diary is evidence and can end up in front of an
 *      adjudicator. A plausible invention — an estimated hours_lost, a name the
 *      speaker never said — is worse than a gap, because a gap is visibly a gap
 *      and an invention is not.
 *   2. Never silently drop. Anything the model can't place confidently goes in
 *      `uncertain` in plain English. An operative who finds their words vanished
 *      stops talking to the app, and the feature dies.
 *
 * Nothing here writes to the diary. The output is a proposal that a human
 * confirms through the ordinary entry save path, so the operative stays the
 * author of record.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ActivityStatus, DiaryDraftPayload, PersonnelRole } from '../types/diary';

/** A photo to send to the model. Only true vision formats — HEIC/PDF are skipped upstream. */
export interface DraftPhoto {
  /** entry_files.id, so a transcript can be tied to the photo it was spoken over. */
  id?: string;
  data: ArrayBuffer;
  mimeType: string;
  /** Whatever words are already on the photo — a human caption or Claude's own. */
  caption?: string;
}

/** One spoken note, in the order it was recorded. */
export interface DraftTranscript {
  text: string;
  /** Set when the note was recorded against one specific photo (voice_notes.file_id). */
  file_id?: string | null;
  /** Recording time, so the model can read the day in order. */
  recorded_at?: string | null;
}

/** A name from the org's roster, so spoken names are matched rather than invented. */
export interface RosterPerson {
  name: string;
  company?: string | null;
  role?: string | null;
  /** On this project's rota — the people most likely to be named today. */
  on_project?: boolean;
}

export interface DiaryDraftInput {
  project: { name: string; address?: string | null };
  /** The diary date this draft is for (YYYY-MM-DD). */
  date: string;
  transcripts: DraftTranscript[];
  photos: DraftPhoto[];
  /** Supplier names the business actually buys from. */
  suppliers: string[];
  /** People the business actually puts on site. */
  roster: RosterPerson[];
}

const VISION_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Anything the vision API will not take — HEIC off an iPhone, a PDF delivery note. */
export function canSendToVision(mimeType: string | null | undefined): boolean {
  return !!mimeType && VISION_TYPES.has(mimeType.toLowerCase());
}

const SYSTEM = `You turn a UK site worker's spoken account of their working day, together with that day's photographs, into a structured site diary entry.

The output is not a report and not a summary. It is rows of data that feed the contractor's variations register, interim valuation, client update and invoice. Classify; do not compose.

## Never invent

A site diary is a legal record. It can end up in an adjudication years later. An invented detail is far worse than a missing one, because a gap is obviously a gap and an invention is not.

- If the speaker did not say how many hours were lost, leave hours_lost null. Do not estimate it from "most of the morning".
- If a name was not said, do not add a person. Three lads on site is not three personnel rows.
- Do not invent quantities, prices, dimensions, dates or times that were not spoken.
- Do not smooth over contradictions. Record what was said and note the contradiction in "uncertain".

## Match against what is known

You are given the business's supplier list and the people on its roster. Spoken names are misheard, abbreviated, accented, and shortened to trade slang.

- Map to the known value where the match is genuinely convincing: "Travis" -> "Travis Perkins", "Screwfix" -> "Screwfix", "HSS" -> "HSS Hire", "Dave" -> the "Dave" on the roster if there is exactly one.
- If nothing matches convincingly, keep what was said, verbatim. Never force a spoken name onto the nearest entry in the list — a wrong supplier on a materials order costs real money, and a wrong name on a personnel row is a false record of who was on site.
- If two roster names are equally plausible ("Dave" with two Daves on the roster), use what was said and add a line to "uncertain".

## Classify correctly — this is where the value is

**activities** — work that was carried out. status is 'active' (in progress), 'complete' (finished today), or 'on_hold' (started but stopped). Default to 'active' if the speaker did not say. task is the short name of the work ("Second fix carpentry"); description is a phrase adding detail, not a paragraph, and may be null.

**delays** — something that stopped or slowed the work, with its reason. Not every complaint is a delay: a delay is lost time. task is what was held up; reason is why.

**variations** — work outside the agreed scope, or a change the client has asked for. Treat these with care in both directions. A variation drives money downstream: a false positive costs the builder an awkward conversation with their client, a false negative costs them the money. Signals: "the client asked for", "while we were there they wanted", "that's not on the drawings", "extra to contract", "they've changed their mind about". When the speech is genuinely ambiguous between ordinary work and a variation, record it as an **activity** and put the ambiguity in "uncertain" as a line the human can settle in seconds.

**personnel** — people on site. role is 'operative' (working) or 'visitor' (building control, the client, an architect, a rep). hours only if actually stated.

**materials_required** — things still to be ordered or asked for. Future or requesting tense: "we need", "get onto", "order", "running short of".
**deliveries** — things that arrived today. Past tense: "came in", "turned up", "dropped off", "delivered this morning".
These two are constantly mixed up in speech. Use tense and context. If a delivery arrived short, that is a delivery (with the shortfall in notes) and usually also a materials_required for the remainder — say so in "uncertain" if you are unsure.

**equipment_hire** — plant and tools on hire: the equipment and who it is hired from.

**notes** — anything about the day that is real and does not belong in a row above. Keep it short. Do not restate rows.

## Use the photographs

The photos corroborate the speech and add detail the speaker skipped — the room, the trade, the state of the work, a make or model on a delivery. Use them to sharpen an activity's description or to confirm which work is being talked about.

But a photograph on its own asserts nothing. Never create a delay, a variation or a person from a photo alone — only the spoken record can assert those. If a photo clearly shows something the speaker never mentioned and it matters, put it in "uncertain" rather than inventing a row for it.

## Never silently drop anything

Every piece of information in the transcripts must end up somewhere: in a row, in notes, or in "uncertain". "uncertain" holds short plain-English lines — what was said and why you could not place it. Examples:
- "Speaker mentioned 'the usual problem with the back door' — no context to classify this."
- "'Sort the skip' could be a delivery to arrange or a materials order — recorded as neither."
- "Possible variation: client asked about moving the socket. Recorded as an activity."

## Voice

British English. Trade vocabulary as spoken on site. Plain and terse — a phrase, not a sentence, and never a paragraph. Do not add politeness, filler or explanation. Transcripts are imperfect; read through obvious mis-transcriptions of trade words rather than repeating nonsense back.

Every array must be present. Use an empty array when nothing applies — an absent key and an empty list must not be ambiguous.`;

/**
 * Strict schema for DiaryDraftPayload.
 *
 * Optional fields are declared required-and-nullable rather than omitted from
 * `required`. That is deliberate: it forces the model to make an explicit
 * decision — "no hours were stated" — instead of quietly leaving a key out,
 * which is indistinguishable from forgetting. The nulls are normalised away
 * before the payload is returned.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    activities: {
      type: 'array',
      description: 'Work carried out today. Empty array if none was described.',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Short name of the work, e.g. "Second fix carpentry".' },
          description: {
            type: ['string', 'null'],
            description: 'A phrase adding detail. Null if the speaker added none.',
          },
          status: {
            type: 'string',
            enum: ['active', 'complete', 'on_hold'],
            description: "'active' unless the speaker said it was finished or stopped.",
          },
        },
        required: ['task', 'description', 'status'],
        additionalProperties: false,
      },
    },
    delays: {
      type: 'array',
      description: 'Things that stopped or slowed the work today.',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The work that was held up.' },
          reason: { type: 'string', description: 'Why it was held up, in the speaker’s terms.' },
          hours_lost: {
            type: ['number', 'null'],
            description: 'Only if a figure was actually stated. Never estimated. Otherwise null.',
          },
        },
        required: ['task', 'reason', 'hours_lost'],
        additionalProperties: false,
      },
    },
    personnel: {
      type: 'array',
      description: 'Named people on site. Never created from a photo or from an unnamed head-count.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Matched to the roster where convincing, otherwise verbatim.' },
          role: {
            type: 'string',
            enum: ['operative', 'visitor'],
            description: "'operative' if working, 'visitor' if attending (client, inspector, rep).",
          },
          hours: { type: ['number', 'null'], description: 'Only if stated. Otherwise null.' },
          company: { type: ['string', 'null'], description: 'Their firm, if said or known from the roster.' },
        },
        required: ['name', 'role', 'hours', 'company'],
        additionalProperties: false,
      },
    },
    variations: {
      type: 'array',
      description: 'Work outside the agreed scope, or a change the client asked for. Flag carefully.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What the extra or changed work is.' },
          hours_required: { type: ['number', 'null'], description: 'Only if stated. Otherwise null.' },
        },
        required: ['description', 'hours_required'],
        additionalProperties: false,
      },
    },
    materials_required: {
      type: 'array',
      description: 'Still to be ordered. Future/requesting tense.',
      items: {
        type: 'object',
        properties: {
          supplier: { type: 'string', description: 'Matched to the supplier list where convincing, else verbatim.' },
          items: { type: 'string', description: 'What is needed, as spoken.' },
          date_required: {
            type: ['string', 'null'],
            description: 'YYYY-MM-DD, only if a date was actually stated. Otherwise null.',
          },
        },
        required: ['supplier', 'items', 'date_required'],
        additionalProperties: false,
      },
    },
    equipment_hire: {
      type: 'array',
      description: 'Plant and tools on hire.',
      items: {
        type: 'object',
        properties: {
          equipment: { type: 'string', description: 'The item on hire.' },
          supplier: { type: 'string', description: 'Who it is hired from.' },
        },
        required: ['equipment', 'supplier'],
        additionalProperties: false,
      },
    },
    deliveries: {
      type: 'array',
      description: 'Materials that arrived today. Past tense.',
      items: {
        type: 'object',
        properties: {
          supplier: { type: 'string', description: 'Who delivered. Matched to the supplier list where convincing.' },
          notes: { type: ['string', 'null'], description: 'What arrived, shortages, damage. Null if nothing was said.' },
        },
        required: ['supplier', 'notes'],
        additionalProperties: false,
      },
    },
    notes: {
      type: ['string', 'null'],
      description: 'Anything real about the day that belongs in no row above. Short. Null if nothing.',
    },
    uncertain: {
      type: 'array',
      description: 'Short plain-English lines for anything that could not be placed confidently. Never drop information silently.',
      items: { type: 'string' },
    },
  },
  required: [
    'activities', 'delays', 'personnel', 'variations',
    'materials_required', 'equipment_hire', 'deliveries', 'notes', 'uncertain',
  ],
  additionalProperties: false,
} as const;

/**
 * Base64 without Node's Buffer.
 *
 * Workers have no `Buffer`, and `String.fromCharCode(...bytes)` on a
 * multi-megabyte photo overflows the call stack because every byte becomes an
 * argument. Chunking keeps each spread small enough to be safe.
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

/** Flatten everything the model must classify against into one plain-text brief. */
function describeContext(input: DiaryDraftInput, photoLabels: Map<string, string>): string {
  const lines: string[] = [];

  lines.push(`Project: ${input.project.name}${input.project.address ? `, ${input.project.address}` : ''}`);
  lines.push(`Diary date: ${input.date}`);
  lines.push('');

  // Known values first. The model matches spoken names against these lists, so
  // they are the difference between "Travis Perkins" and "travis perkin's".
  lines.push('## Suppliers this business uses');
  lines.push(input.suppliers.length
    ? input.suppliers.map((s) => `- ${s}`).join('\n')
    : '(none on record — keep every supplier name exactly as spoken)');
  lines.push('');

  lines.push('## People on this business’s roster');
  if (input.roster.length) {
    for (const p of input.roster) {
      const bits = [p.company ? `${p.company}` : null, p.role ?? null].filter(Boolean).join(', ');
      lines.push(`- ${p.name}${bits ? ` (${bits})` : ''}${p.on_project ? ' [on this project’s rota]' : ''}`);
    }
  } else {
    lines.push('(none on record — keep every name exactly as spoken)');
  }
  lines.push('');

  if (input.photos.length) {
    lines.push('## Photographs');
    lines.push(`${input.photos.length} photo${input.photos.length === 1 ? '' : 's'} from this day are attached above, labelled in order.`);
    const captioned = input.photos
      .map((p, i) => (p.caption ? `- Photo ${i + 1}: ${p.caption}` : null))
      .filter(Boolean);
    if (captioned.length) {
      lines.push('Existing captions (background only — the photo itself is the evidence):');
      lines.push(captioned.join('\n'));
    }
    lines.push('');
  }

  lines.push('## What was said, in the order it was recorded');
  lines.push('');
  input.transcripts.forEach((t, i) => {
    const label = t.file_id ? photoLabels.get(t.file_id) : undefined;
    const heading = [
      `Note ${i + 1}`,
      label ? `spoken over ${label}` : null,
      t.recorded_at ? `at ${t.recorded_at}` : null,
    ].filter(Boolean).join(', ');
    lines.push(`### ${heading}`);
    lines.push(t.text.trim());
    lines.push('');
  });

  lines.push('Produce the structured diary entry for this day.');

  return lines.join('\n');
}

/** Trim to a non-empty string, or undefined. Nulls from the schema collapse here. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** A finite number, or undefined. A NaN hour would poison the valuation downstream. */
function figure(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

const ACTIVITY_STATUSES: ActivityStatus[] = ['active', 'complete', 'on_hold'];
const PERSONNEL_ROLES: PersonnelRole[] = ['operative', 'visitor'];

/**
 * Validate and normalise the model's JSON into a payload the diary form can eat.
 *
 * Structured outputs make malformed JSON unlikely, not impossible, and this
 * payload is about to be shown to a human as "your day". A row missing its
 * `task`, or a `status` outside the union, would render as a broken form field
 * rather than an obvious error — so anything unusable is rejected loudly here,
 * and the caller records the failure on the draft.
 */
export function validateDraftPayload(raw: unknown): DiaryDraftPayload {
  if (!raw || typeof raw !== 'object') throw new Error('Claude returned no draft object');
  const r = raw as Record<string, unknown>;

  const arrays = [
    'activities', 'delays', 'personnel', 'variations',
    'materials_required', 'equipment_hire', 'deliveries',
  ];
  for (const key of arrays) {
    if (!Array.isArray(r[key])) throw new Error(`Claude returned no "${key}" array`);
  }

  const rows = <T>(key: string, map: (row: Record<string, unknown>) => T | null): T[] =>
    (r[key] as unknown[])
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map(map)
      .filter((row): row is T => row !== null);

  const payload: DiaryDraftPayload = {
    activities: rows('activities', (a) => {
      const task = text(a.task);
      if (!task) return null;
      const status = a.status as ActivityStatus;
      return {
        task,
        description: text(a.description),
        // An unknown status is corrected rather than rejected: 'active' is the
        // safe reading of "work happened", and losing the whole row would lose
        // the work itself.
        status: ACTIVITY_STATUSES.includes(status) ? status : 'active',
      };
    }),
    delays: rows('delays', (d) => {
      const task = text(d.task);
      const reason = text(d.reason);
      if (!task || !reason) return null;
      return { task, reason, hours_lost: figure(d.hours_lost) };
    }),
    personnel: rows('personnel', (p) => {
      const name = text(p.name);
      if (!name) return null;
      const role = p.role as PersonnelRole;
      return {
        name,
        role: PERSONNEL_ROLES.includes(role) ? role : 'operative',
        hours: figure(p.hours),
        company: text(p.company),
      };
    }),
    variations: rows('variations', (v) => {
      const description = text(v.description);
      if (!description) return null;
      return { description, hours_required: figure(v.hours_required) };
    }),
    materials_required: rows('materials_required', (m) => {
      const supplier = text(m.supplier);
      const items = text(m.items);
      if (!supplier || !items) return null;
      return { supplier, items, date_required: text(m.date_required) };
    }),
    equipment_hire: rows('equipment_hire', (e) => {
      const equipment = text(e.equipment);
      const supplier = text(e.supplier);
      if (!equipment || !supplier) return null;
      return { equipment, supplier };
    }),
    deliveries: rows('deliveries', (d) => {
      const supplier = text(d.supplier);
      if (!supplier) return null;
      return { supplier, notes: text(d.notes) };
    }),
    notes: text(r.notes),
    uncertain: Array.isArray(r.uncertain)
      ? r.uncertain.map(text).filter((line): line is string => !!line)
      : [],
  };

  return payload;
}

/**
 * Draft the structured entry. Throws on a missing key, an API failure or output
 * that cannot be made into a usable payload — the caller records that on the
 * draft row as status='failed' with the reason, so the operative is told
 * "couldn't draft this, write it by hand" rather than staring at a spinner.
 */
export async function draftDiaryEntry(
  apiKey: string,
  input: DiaryDraftInput
): Promise<DiaryDraftPayload> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const spoken = input.transcripts.filter((t) => t.text && t.text.trim());
  if (spoken.length === 0) {
    // Photos alone cannot assert what happened. A draft built from them would
    // be invention, which is the one thing this feature must never produce.
    throw new Error('No transcripts to draft from');
  }

  const photos = input.photos.filter((p) => canSendToVision(p.mimeType));

  const client = new Anthropic({ apiKey });

  // Photo blocks first, each preceded by its label so a transcript can say
  // "spoken over Photo 3", then the whole brief as the final text block. The
  // model reads the pictures, then the instruction about them.
  const photoLabels = new Map<string, string>();
  const content: Anthropic.ContentBlockParam[] = [];
  photos.forEach((photo, i) => {
    const label = `Photo ${i + 1}`;
    if (photo.id) photoLabels.set(photo.id, label);
    content.push({ type: 'text', text: `${label}:` });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: photo.mimeType.toLowerCase() as VisionMediaType,
        data: toBase64(photo.data),
      },
    });
  });
  content.push({
    type: 'text',
    text: describeContext({ ...input, transcripts: spoken, photos }, photoLabels),
  });

  // claude-opus-5 at high effort: this is the quality-critical call in the
  // product. Everything downstream — the variations register, the valuation,
  // the invoice — inherits whatever this call classifies, and a misfiled
  // variation is money. Thinking is on by default on Opus 5 and budget_tokens
  // no longer exists, so effort is the only dial and no thinking block is sent.
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

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('Claude returned no text content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    throw new Error('Claude returned malformed JSON');
  }

  return validateDraftPayload(parsed);
}
