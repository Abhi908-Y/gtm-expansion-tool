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

/** Google Search grounding. JSON mode cannot be combined with tools, so the JSON is pulled out of the text. */
export async function geminiSearchJson(prompt: string): Promise<{ data: unknown; sources: { title: string; url: string }[] }> {
  const r = await post({ temperature: 0 }, `${prompt}\n\nReturn only a JSON object, no other text.`, [{ google_search: {} }]);
  const text = textOf(r);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Gemini search returned no JSON');
  const sources = (r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? '', url: c.web.uri }] : []));
  return { data: parse(m[0]), sources };
}
