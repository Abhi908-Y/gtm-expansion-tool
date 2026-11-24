import { geminiJson } from './gemini';

// M1 company profile. The model proposes claims; code keeps only claims whose quote really appears in a fetched page.
export const FIELDS = {
  what_they_sell: 'products and services, in plain words',
  who_they_sell_to: 'customer types and industries (builders, enterprises, resellers, etc.)',
  pricing_model: 'how they charge (per minute, per number, subscription, free tier)',
  differentiators: 'what they say makes them different',
  current_customers: 'named customers, partners and integrations',
  countries_served: 'countries or regions they say they serve or have numbers in',
  team_and_stage: 'headcount, funding, founding year, location',
} as const;
export type Field = keyof typeof FIELDS;

export type Source = { url: string; text: string };
export type Claim = { text: string; quote: string; url: string };
export type Profile = { fields: Record<Field, Claim[]>; not_stated: Field[]; dropped: number };

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();

/** Evidence validator: a claim survives only if its quote is verbatim in the page it cites. */
export function validateClaims(raw: unknown, sources: Source[]): Profile {
  const byUrl = new Map(sources.map((s) => [s.url, norm(s.text)]));
  const fields = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, [] as Claim[]])) as Record<Field, Claim[]>;
  let dropped = 0;
  const given = (raw as { fields?: Record<string, unknown> })?.fields ?? {};
  for (const k of Object.keys(FIELDS) as Field[]) {
    const list = Array.isArray(given[k]) ? (given[k] as Partial<Claim>[]) : [];
    for (const c of list) {
      const page = typeof c.url === 'string' ? byUrl.get(c.url) : undefined;
      if (typeof c.text === 'string' && typeof c.quote === 'string' && c.quote.length >= 12 && page?.includes(norm(c.quote)))
        fields[k].push({ text: c.text, quote: c.quote, url: c.url! });
      else dropped++;
    }
  }
  return { fields, not_stated: (Object.keys(FIELDS) as Field[]).filter((k) => fields[k].length === 0), dropped };
}

export async function buildProfile(company: string, sources: Source[]): Promise<Profile> {
  const pages = sources.map((s) => `### SOURCE ${s.url}\n${s.text}`).join('\n\n');
  const wanted = Object.entries(FIELDS).map(([k, d]) => `- ${k}: ${d}`).join('\n');
  const prompt = `You are building a factual profile of "${company}" from the sources below. Use only the sources.
For each field, list claims. Every claim needs: "text" (your short statement), "quote" (an exact, copy-pasted sentence or phrase from the source, at least 12 characters), and "url" (the SOURCE url it came from).
If the sources do not say, return an empty list for that field. Never guess.

Fields:
${wanted}

Return JSON: {"fields": {"<field>": [{"text": "...", "quote": "...", "url": "..."}]}}

${pages}`;
  return validateClaims(await geminiJson(prompt), sources);
}
