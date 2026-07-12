/**
 * Claude drafts the client-facing narrative for a summary.
 *
 * The point of the automation is that the summary arrives *written* — something
 * to scan, tweak and approve, not a table of raw diary data still to be written
 * up. A summary nobody can approve in thirty seconds is a summary that doesn't
 * get sent.
 *
 * Nothing here reaches the client unreviewed: the draft lands in the approval
 * queue and a human sends it.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DiaryEntryFull, Project } from '../types/diary';

export interface DraftInput {
  project: Project;
  entries: DiaryEntryFull[];
  periodStart: string;
  periodEnd: string;
  /** Set when a completed milestone triggered this summary. */
  milestone?: string | null;
}

export interface Draft {
  title: string;
  narrative: string;
}

const SYSTEM = `You write short progress updates that a building contractor sends to their client.

You are given the contractor's own site diary for a period of work. Turn it into an update the client will actually read.

Voice: plain, warm, professional. British English. Write as the contractor ("we"), addressing the client directly. No jargon, no filler, no marketing language. Never invent work that isn't in the diary — if the diary is thin, the update is short, and that is fine.

Content:
- Lead with what was achieved in this period.
- Mention delays or problems honestly, but factually and without blame or internal finger-pointing. The client should learn about a delay from you rather than discover it.
- Say what happens next if the diary makes it clear. Don't speculate.
- Do not include internal matters: individual operatives' hours, staff performance, cost disputes, supplier pricing, or anything that reads as internal chatter.
- Do not fabricate dates, costs, or completion promises.

Format: 2-4 short paragraphs of plain prose. No headings, no bullet lists, no sign-off, no greeting — the email template adds those.`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'A short subject line for the update, e.g. "Kitchen walls out, first fix underway".',
    },
    narrative: {
      type: 'string',
      description: 'The update itself: 2-4 short paragraphs of plain prose, separated by blank lines.',
    },
  },
  required: ['title', 'narrative'],
  additionalProperties: false,
} as const;

/** Flatten the diary into the facts the model should write from. */
function describeEntries(entries: DiaryEntryFull[]): string {
  if (entries.length === 0) return 'No diary entries were recorded in this period.';

  return entries.map((e) => {
    const lines: string[] = [`## ${e.date}`];

    const activities = e.activities.filter((a) => a.task);
    if (activities.length) {
      lines.push('Work done:');
      for (const a of activities) {
        lines.push(`- ${a.task}${a.description ? ` — ${a.description}` : ''} (${a.status})`);
      }
    }

    if (e.delays.length) {
      lines.push('Delays:');
      for (const d of e.delays) lines.push(`- ${d.task}: ${d.reason}`);
    }

    if (e.variations.length) {
      lines.push('Variations / additional works raised:');
      for (const v of e.variations) lines.push(`- ${v.description}`);
    }

    if (e.deliveries.length) {
      lines.push('Materials delivered:');
      for (const d of e.deliveries) lines.push(`- ${d.supplier}${d.notes ? `: ${d.notes}` : ''}`);
    }

    if (e.weather_condition) lines.push(`Weather: ${e.weather_condition}`);
    if (e.notes) lines.push(`Site notes: ${e.notes}`);

    const photos = e.files.filter((f) => f.mime_type.startsWith('image/')).length;
    if (photos) lines.push(`${photos} photo${photos === 1 ? '' : 's'} taken.`);

    return lines.join('\n');
  }).join('\n\n');
}

/**
 * Draft the narrative. Throws if the API key is missing or the call fails — the
 * caller records the error on the summary so it shows up in the queue as
 * "needs writing by hand" rather than vanishing.
 */
export async function draftSummary(apiKey: string, input: DraftInput): Promise<Draft> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const client = new Anthropic({ apiKey });

  const context = [
    `Project: ${input.project.name}, ${input.project.address}`,
    `Period: ${input.periodStart} to ${input.periodEnd}`,
    input.milestone
      ? `This update was triggered by reaching a milestone: "${input.milestone}". Lead with that.`
      : null,
    '',
    'Site diary for the period:',
    '',
    describeEntries(input.entries),
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    system: SYSTEM,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content: context }],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Claude returned no text content');

  const draft = JSON.parse(text.text) as Draft;
  if (!draft.title || !draft.narrative) throw new Error('Claude returned an incomplete draft');
  return draft;
}
