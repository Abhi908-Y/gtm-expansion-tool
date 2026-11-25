// Minimal Gemini REST client. Reads GEMINI_API_KEY and GEMINI_MODEL from the environment.
export function geminiConfigured(): string | null {
  if (!process.env.GEMINI_API_KEY) return 'GEMINI_API_KEY is empty in .env';
  if (!process.env.GEMINI_MODEL) return 'GEMINI_MODEL is empty in .env';
  return null;
}

type Reply = { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] };

async function post(generationConfig: object, prompt: string, tools?: object[]): Promise<Reply> {
  const model = process.env.GEMINI_MODEL!;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig, ...(tools ? { tools } : {}) }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Reply;
}

const textOf = (r: Reply) => {
  const t = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!t) throw new Error('Gemini returned no text (empty or blocked response)');
  return t;
};
const parse = (t: string) => JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, ''));

/** JSON out, one retry that tells the model what was wrong. */
export async function geminiJson(prompt: string): Promise<unknown> {
  const cfg = { responseMimeType: 'application/json', temperature: 0 };
  const first = textOf(await post(cfg, prompt));
  try {
    return parse(first);
  } catch (e) {
    return parse(textOf(await post(cfg, `${prompt}\n\nYour previous answer was not valid JSON (${e instanceof Error ? e.message : e}). Return only the JSON object.`)));
  }
}

/** Models sometimes put a raw newline inside a JSON string. JSON.parse rejects it, so escape control characters found inside strings. */
export function escapeStrayControlChars(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString && !escaped && ch === '\\') {
      escaped = true;
      out += ch;
      continue;
    }
    if (!escaped && ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && !escaped && ch.charCodeAt(0) < 0x20) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
      continue;
    }
    out += ch;
    escaped = false;
  }
  return out;
}

/** Pull one JSON object out of a reply that may carry prose or code fences around it. */
export function extractJson(text: string): Record<string, unknown> {
  let t = text.trim();
  const fenced = /```(?:json)?\s*(\{[\s\S]*\})\s*```/.exec(t);
  if (fenced) t = fenced[1];
  else {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a !== -1 && b > a) t = t.slice(a, b + 1);
  }
  try {
    return JSON.parse(t);
  } catch {
    return JSON.parse(escapeStrayControlChars(t));
  }
}

/**
 * Google Search grounding. JSON mode cannot be combined with tools, so the JSON is pulled out of the text.
 * Do NOT cap thinking here: tested on this model, a thinking budget makes it skip the search tool entirely (no sources, answers from memory).
 * The cap is kept only as a last resort when an uncapped reply comes back empty, and the caller treats a source-less reply as unverified.
 */
export async function geminiSearchJson(prompt: string): Promise<{ data: Record<string, unknown>; sources: { title: string; url: string }[] }> {
  const ask = `${prompt}\n\nReturn only a JSON object, no other text.`;
  const attempts = [
    { cfg: { temperature: 0.4, maxOutputTokens: 16384 }, text: ask },
    { cfg: { temperature: 0.4, maxOutputTokens: 16384 }, text: `${ask}\n\nYour previous answer was empty or not valid JSON. Return a single valid JSON object only.` },
    { cfg: { temperature: 0.4, maxOutputTokens: 16384, thinkingConfig: { thinkingBudget: 1024 } }, text: ask },
  ];
  let last: unknown;
  for (const a of attempts) {
    try {
      const r = await post(a.cfg, a.text, [{ google_search: {} }]);
      const sources = (r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? '', url: c.web.uri }] : []));
      const data = extractJson(textOf(r));
      if (!sources.length) console.warn('[gemini] reply had no grounding sources; queries:', JSON.stringify((r.candidates?.[0]?.groundingMetadata as any)?.webSearchQueries ?? null), 'keys:', Object.keys(r.candidates?.[0]?.groundingMetadata ?? {}));
      return { data, sources };
    } catch (e) {
      console.warn('[gemini] search attempt failed:', e instanceof Error ? e.message.slice(0, 200) : e);
      last = e;
    }
  }
  throw last;
}

/**
 * Plain-language research with Google Search on. Asked for notes (not JSON), the model searches reliably;
 * asked for "ONLY a JSON object" it often answers from memory without searching. Returns the notes and the sources consulted.
 */
export async function geminiSearchText(prompt: string): Promise<{ text: string; sources: { title: string; url: string }[] }> {
  const r = await post({ temperature: 0.4, maxOutputTokens: 8192 }, prompt, [{ google_search: {} }]);
  const sources = (r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? '', url: c.web.uri }] : []));
  return { text: textOf(r), sources };
}
