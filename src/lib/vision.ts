/**
 * Claude writes a caption and search tags for a site photo.
 *
 * A phone dumps forty photos onto a diary entry in a burst and nobody types a
 * caption for any of them. Six months later, when the argument is about when a
 * lintel went in, those photos are unsearchable. The point of this is that every
 * photo arrives with words attached — plain, factual words a builder would
 * actually type into a search box.
 *
 * The machine's caption lives in `ai_caption`, beside the human `caption`, never
 * on top of it: a guess must never destroy what a person wrote.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface CaptionResult {
  caption: string;
  tags: string[];
}

/** Whatever context the caller happens to know — all of it optional. */
export interface CaptionContext {
  project?: string;
  date?: string;
  trade?: string;
}

const SYSTEM = `You caption photographs taken on UK construction and refurbishment sites, for a contractor's site diary.

Voice: plain, factual, British English. One sentence, present tense. No marketing language, no adjectives that flatter the work.

The caption describes what is visible: the element, where it is if that is evident from the photo, and the state of the work. Nothing else.

Never invent:
- a room name that isn't obvious from the photo
- a measurement, a quantity or a dimension
- a date, a stage of programme, or who did the work
- a judgement about workmanship or quality you cannot see

If the photo is dark, blurred, or too close to read, say so plainly — "close-up of an unclear surface, subject not identifiable" is a better caption than a confident guess.

Tags: 2 to 6 short lowercase terms, taken from what is actually visible — trade, element, room, material, condition. These drive photo search, so use the words a builder would type: "plasterboard", "first fix", "kitchen", "damp", "scaffold". No hashtags, no punctuation, no full sentences.`;

const SCHEMA = {
  type: 'object',
  properties: {
    caption: {
      type: 'string',
      description: 'One plain sentence describing what is visible in the photo.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '2-6 short lowercase search terms drawn from what is visible.',
    },
  },
  required: ['caption', 'tags'],
  additionalProperties: false,
} as const;

/**
 * The only formats the vision API accepts. This app deliberately accepts HEIC
 * from iPhones and PDFs as delivery notes, and neither can be sent as an image
 * block — so callers ask first and skip, rather than firing off a request that
 * is certain to 400.
 */
const CAPTIONABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Whether this file can be sent to the vision model at all. */
export function canCaption(mimeType: string | null | undefined): boolean {
  return !!mimeType && CAPTIONABLE.has(mimeType.toLowerCase());
}

/**
 * Base64 without newlines, built by hand.
 *
 * Workers have no Node `Buffer`, and the obvious
 * `String.fromCharCode(...new Uint8Array(buf))` overflows the call stack on a
 * multi-megabyte photo — every byte becomes an argument. Chunking keeps each
 * spread small enough to be safe.
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

/**
 * Caption one photo. Throws on a missing key or an API failure — the caller
 * records that as ai_status='failed' on the file, so a photo that couldn't be
 * read shows up as retryable rather than silently arriving with no words.
 */
export async function captionPhoto(
  apiKey: string,
  image: { data: ArrayBuffer; mimeType: string },
  context?: CaptionContext
): Promise<CaptionResult> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const mediaType = image.mimeType.toLowerCase();
  if (!canCaption(mediaType)) {
    throw new Error(`Cannot caption "${image.mimeType}" — only JPEG, PNG, WebP and GIF are vision inputs`);
  }

  const client = new Anthropic({ apiKey });

  // Context is a hint, not a fact to be repeated: the model still captions what
  // it sees. Naming the project stops "the kitchen" being invented out of thin
  // air on a job that is a loft conversion.
  const hints = [
    context?.project ? `Project: ${context.project}` : null,
    context?.date ? `Taken on: ${context.date}` : null,
    context?.trade ? `Trade on site: ${context.trade}` : null,
  ].filter(Boolean);

  const prompt = [
    hints.length
      ? `Context (background only — do not state anything from it that the photo does not show):\n${hints.join('\n')}\n`
      : '',
    'Caption this site photo.',
  ].join('\n');

  // claude-haiku-4-5: captioning is high-volume, cheap and low-stakes — a human
  // reads every caption in the diary anyway. Haiku 4.5 predates output_config
  // effort, so only the JSON format is set here.
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    system: SYSTEM,
    output_config: {
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          // The image must come before the text: Claude reads the picture, then
          // the instruction about it.
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: toBase64(image.data),
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Claude returned no text content');

  const parsed = JSON.parse(text.text) as CaptionResult;
  if (!parsed.caption) throw new Error('Claude returned no caption');

  return {
    caption: parsed.caption.trim(),
    // Tidy up rather than trust: lowercase, de-duplicate, drop empties and cap
    // the list, so one over-enthusiastic response can't bloat the tag index.
    tags: [...new Set(
      (Array.isArray(parsed.tags) ? parsed.tags : [])
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean)
    )].slice(0, 6),
  };
}
