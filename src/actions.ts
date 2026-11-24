// Everything a visitor can do to a plan. The API routes are thin wrappers around this.
import { analyse, cleanDomain } from './compete/compete';
import { Bad } from './errors';
import { geminiConfigured, geminiJson, geminiSearchJson } from './research/gemini';
import { runProfile } from './research/runProfile';
import { READINESS } from './screen/screen';
import { scrapeSite } from './scrape/site';
import { competeView, compute, countryNames, loadProject, runScreen, saveProject, type Project } from './store';

const needGemini = () => {
  const why = geminiConfigured();
  if (why) throw new Bad(`${why}. The site owner needs to add it.`, 503);
};

export function view(p: Project) {
  return {
    project: { ...p, indicators: undefined },
    computed: compute(p),
    compete: competeView(p),
    suggested: (p.competitors ?? []).filter((c) => c.status === 'suggested'),
    gemini: !geminiConfigured(),
  };
}

export async function act(ws: string, id: string, action: string, b: any) {
  const p = await loadProject(ws, id);
  if (p.isSample && action !== 'screen') throw new Bad('This is the read-only Vobiz example. Start your own plan to change things.', 403);
  const list = (p.competitors ??= []);

  switch (action) {
    case 'screen':
      await runScreen(p, !!b.force);
      break;

    case 'profile':
      p.profile = await runProfile(p.company, p.website);
      break;

    case 'country': {
      const iso3 = String(b.iso3 ?? '');
      if (!p.regions.some((r) => r.countries.includes(iso3))) throw new Bad('Unknown country');
      const c = (p.countries[iso3] ??= {});
      if (b.readiness !== undefined) {
        if (!READINESS.includes(b.readiness)) throw new Bad('Unknown readiness');
        c.readiness = b.readiness;
      }
      if (b.desk) {
        for (const [k, v] of Object.entries(b.desk as Record<string, number | null>)) {
          if (!['competition', 'rules', 'partner'].includes(k)) throw new Bad(`Unknown field ${k}`);
          if (v === null) {
            delete c.desk?.[k as 'rules'];
            delete c.reasons?.[k];
          } else {
            if (!Number.isInteger(v) || v < 1 || v > 5) throw new Bad('Analyst scores are whole numbers from 1 to 5');
            const reason = String(b.reason ?? '').trim();
            if (!reason) throw new Bad('A reason is required for an analyst score');
            (c.desk ??= {})[k as 'rules'] = v;
            (c.reasons ??= {})[k] = reason.slice(0, 300);
          }
        }
      }
      if (b.humanGate !== undefined) {
        if (b.humanGate === null) delete c.humanGate;
        else {
          const reason = String(b.humanGate.reason ?? '').trim();
          if (!reason) throw new Bad('A reason is required for a gate call');
          c.humanGate = { fail: !!b.humanGate.fail, reason: reason.slice(0, 300) };
        }
      }
      break;
    }

    case 'competitor': {
      const domain = cleanDomain(String(b.domain ?? ''));
      if (b.op === 'add') {
        const name = String(b.name ?? '').trim().slice(0, 80);
        if (!name || !domain) throw new Bad('A name and a valid website are required');
        if (list.some((c) => c.domain === domain)) throw new Bad(`${domain} is already in the list`);
        list.push({ name, domain, status: 'accepted' });
        break;
      }
      const i = list.findIndex((c) => c.domain === domain);
      if (i < 0) throw new Bad('Unknown competitor');
      if (b.op === 'remove') list.splice(i, 1);
      else if (b.op === 'accept') list[i].status = 'accepted';
      else if (b.op === 'analyse') {
        needGemini();
        list[i] = await analyse(list[i], {
          company: p.company,
          countries: Object.entries(countryNames(p)).map(([iso3, name]) => ({ iso3, name })),
          ask: geminiJson,
          scrape: async (d) => {
            const site = await scrapeSite(d, { maxSubpages: 6, deep: true });
            return { pages: site.pages.map((x) => ({ url: x.url, text: x.text, full: x.full })), failures: site.failures.map((f) => `${f.code}: ${f.url} (${f.detail})`) };
          },
        });
      } else throw new Bad('Unknown competitor action');
      break;
    }

    case 'discover': {
      needGemini();
      const { data } = await geminiSearchJson(
        `Using Google Search, find up to 12 companies that compete with or could partner with ${p.company}. About ${p.company}: ${p.context || p.website}\nAlready known (exclude): ${list.map((c) => c.name).join(', ') || 'none'}\nReturn {"candidates":[{"name":"...","domain":"example.com","why":"one short sentence"}]}`,
      );
      let added = 0;
      for (const c of ((data as any)?.candidates ?? []) as { name?: string; domain?: string; why?: string }[]) {
        const d = cleanDomain(String(c.domain ?? ''));
        if (!c.name || !d || list.some((x) => x.domain === d)) continue;
        list.push({ name: String(c.name).slice(0, 80), domain: d, status: 'suggested', note: String(c.why ?? '').slice(0, 200) });
        added++;
      }
      await saveProject(ws, p);
      return { ok: true, added };
    }

    default:
      throw new Bad('Unknown action', 404);
  }
  await saveProject(ws, p);
  return { ok: true };
}
