import { describe, expect, it } from 'vitest';
import { cleanText, extractLinks } from '../src/scrape/clean';
import { fetchPage, isBlocked } from '../src/scrape/fetchPage';
import { isPathAllowed, parseRobots } from '../src/scrape/robots';

const para = 'This sentence has plenty of words so that it survives the short block filter easily.';

describe('cleanText', () => {
  it('drops scripts, nav, short blocks and duplicates', () => {
    const html = `<nav>Home About Contact</nav><script>var x=1</script><p>${para}</p><p>${para}</p><p>Buy now</p><footer>${para} footer</footer>`;
    expect(cleanText(html)).toBe(para);
  });
});

describe('extractLinks', () => {
  it('keeps same-site links only', () => {
    const html = '<a href="/pricing">Pricing</a><a href="https://other.com/x">Out</a><a href="#top">Top</a><a href="mailto:a@b.c">m</a>';
    expect(extractLinks(html, 'https://www.example.com').map((l) => l.url)).toEqual(['https://www.example.com/pricing']);
  });
});

describe('robots', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/open\n');
  it('uses longest match, allow wins ties', () => {
    expect(isPathAllowed(rules, '/pricing')).toBe(true);
    expect(isPathAllowed(rules, '/private/x')).toBe(false);
    expect(isPathAllowed(rules, '/private/open/a')).toBe(true);
  });
  it('prefers our own group over *', () => {
    expect(isPathAllowed(parseRobots('User-agent: GTMResearchBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n'), '/')).toBe(false);
  });
});

describe('blocked domains', () => {
  it('refuses LinkedIn without making a request', async () => {
    expect(isBlocked('www.linkedin.com')).toBe(true);
    expect(isBlocked('notlinkedin.com')).toBe(false);
    const r = await fetchPage('https://www.linkedin.com/company/vobiz', { cache: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('blocked_domain');
  });
});
