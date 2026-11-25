import { describe, expect, it } from 'vitest';
import { extractJson, escapeStrayControlChars } from '../src/research/gemini';
import { extractEmails } from '../src/scrape/clean';
import { applyVerification, draftIssues, finalizeOutreach, sanitizePeople, scoreMessages } from '../src/outreach/checks';

describe('extractJson', () => {
  it('reads fenced JSON, JSON with prose around it, and raw newlines inside strings', () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":"b"} Hope that helps')).toEqual({ a: 'b' });
    expect(extractJson('{"a":"line1\nline2"}')).toEqual({ a: 'line1\nline2' });
    expect(escapeStrayControlChars('{"a":"x\ty"}')).toBe('{"a":"x\\ty"}');
  });
});

describe('extractEmails', () => {
  it('keeps personal-looking addresses and drops role addresses and images', () => {
    const html = '<a href="mailto:Jane.Doe@acme.com">Jane</a> info@acme.com press@acme.com logo@2x.png sales@acme.com bob@acme.co.uk';
    expect(extractEmails(html)).toEqual(['jane.doe@acme.com', 'bob@acme.co.uk']);
  });
});

describe('sanitizePeople', () => {
  const scraped = [{ email: 'jane@acme.com', url: 'https://acme.com/team' }];
  it('keeps only emails published on the company pages and only real LinkedIn profile URLs', () => {
    const out = sanitizePeople(
      { people: [
        { name: 'Jane', email: 'Jane@acme.com', linkedin_url: 'https://www.linkedin.com/in/jane', status: 'verified' },
        { name: 'Bob', email: 'bob@acme.com', linkedin_url: 'https://linkedin.com/company/acme', status: 'assertion' },
      ] },
      scraped,
    );
    expect(out.people[0]).toMatchObject({ email: 'jane@acme.com', email_source: 'https://acme.com/team', linkedin_url: 'https://www.linkedin.com/in/jane' });
    expect(out.people[1]).toMatchObject({ email: null, email_dropped: 'bob@acme.com', linkedin_url: null });
    expect(out).toMatchObject({ verified_count: 1, assertion_count: 1, total_count: 2 });
  });
});

describe('applyVerification', () => {
  it('removes the items the grader found to have no real source', () => {
    const section = { latest_news: [{ headline: 'A' }, { headline: 'B' }, { headline: 'C' }], trigger: 'x' };
    const r = applyVerification(section, [{ ref: 'latest_news[1]', a: false }, { ref: 'latest_news[0]', a: true }, { ref: 'nonsense', a: false }]);
    expect(r.section.latest_news.map((n: any) => n.headline)).toEqual(['A', 'C']);
    expect(r.removed).toEqual(['B']);
    expect(r.section.trigger).toBe('x');
  });
});

describe('draftIssues and finalizeOutreach', () => {
  const long = Array(130).fill('word').join(' ');
  const entry = {
    person: 'Jane Doe',
    emails: [
      { subject: 'One two three four five six seven eight nine', hook_pain: 'Circling back on your launch.', value: 'v', cta: 'c' },
      { subject: 'Short', hook_pain: long, value: 'v', cta: 'c' },
    ],
    linkedin: { connect_request: 'x'.repeat(301) },
  };
  it('counts words and characters itself and flags banned phrases', () => {
    const issues = draftIssues(entry);
    expect(issues.join('|')).toMatch(/subject is 9 words/);
    expect(issues.join('|')).toMatch(/banned phrase “circling back”/);
    expect(issues.join('|')).toMatch(/is 132 words/);
    expect(issues.join('|')).toMatch(/301 characters/);
  });
  it('takes contact details from the people list and adds greeting, sign-off and opt-out', () => {
    const r = finalizeOutreach({ per_person: [{ ...entry, send_to_email: 'made-up@evil.com' }] }, [{ name: 'Jane Doe', email: 'jane@acme.com', linkedin_url: null }], 'Vobiz');
    const p = (r.per_person as any[])[0];
    expect(p.send_to_email).toBe('jane@acme.com');
    expect(p.emails[0].body.startsWith('Hi Jane,')).toBe(true);
    expect(p.emails[0].body).toMatch(/P\.S\. If this is not relevant/);
    expect(p.issues.length).toBeGreaterThan(0);
  });
});

describe('scoreMessages', () => {
  it('recounts from the sentence list and blocks made-up or banned content', () => {
    expect(scoreMessages([{ label: 'FROM_PACK' }, { label: 'MADE_UP' }]).verdict).toBe('blocked');
    expect(scoreMessages([{ label: 'FROM_PACK' }, { label: 'FROM_PACK' }, { label: 'FROM_PACK' }, { label: 'GENERIC' }]).verdict).toBe('strong');
    expect(scoreMessages([{ label: 'FROM_PACK' }, { label: 'GENERIC' }]).verdict).toBe('weak');
    expect(scoreMessages([{ label: 'FROM_PACK' }, { label: 'FROM_PACK' }, { label: 'GENERIC' }, { label: 'what' }]).counts).toMatchObject({ from_pack: 2, generic: 2 });
  });
});
