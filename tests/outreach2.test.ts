import { describe, expect, it } from 'vitest';
import { buildRaw, validEmail } from '../src/google';
import { allContacts, contactRows, CONTACT_HEADER } from '../src/outreach/export';
import { seal, unseal } from '../src/secrets';
import { extractPhones } from '../src/scrape/clean';

process.env.APP_SECRET = 'test-secret';

const acc: any = {
  id: 'a1', name: 'Acme', region: 'Singapore', website: 'acme.com', phones: [{ phone: '+6561234567', url: 'u' }], doNotUse: [],
  company: { fit_assessment: 'good fit', trigger: 'raised a round' },
  people: {
    personas: [{ title: 'CTO', role_in_decision: 'holds_budget' }, { title: 'Voice engineer', role_in_decision: 'technical_checker' }, { title: 'CISO', role_in_decision: 'blocker' }],
    people: [
      { name: 'Zed Blocker', title: 'CISO', matches_persona: 'CISO', email: null },
      { name: 'Ann Cto', title: 'CTO', matches_persona: 'CTO', email: 'ann@acme.com', email_source: 'https://acme.com/team', linkedin_url: 'https://linkedin.com/in/ann' },
      { name: 'Eve Eng', title: 'Voice engineer', matches_persona: 'Voice engineer', email: null, linkedin_search_hint: 'Eve Eng Acme' },
    ],
  },
  outreach: { per_person: [{ person: 'Ann Cto', style_used: 'insight', emails: [{ subject: 'S1', body: 'B1' }, { subject: 'S2', body: 'B2' }, { subject: 'S3', body: 'B3' }], linkedin: { connect_request: 'hello', message_1: 'm1' }, issues: [] }] },
  messages: { per_person: [{ person: 'Ann Cto', verdict: 'strong', from_pack_pct: 80 }] },
};

describe('contact sheet', () => {
  it('lists people budget holder first, blocker last, with their drafts attached', () => {
    expect(allContacts([acc]).map((c) => c.person.name)).toEqual(['Ann Cto', 'Eve Eng', 'Zed Blocker']);
    expect(allContacts([acc])[0].draft?.style_used).toBe('insight');
  });
  it('writes one row per person under the company, in the documented columns', () => {
    const rows = contactRows([acc]);
    expect(rows[0]).toEqual(CONTACT_HEADER);
    expect(rows).toHaveLength(4);
    const ann = rows[1];
    expect(ann.slice(0, 3)).toEqual(['Acme', 'Singapore', 'acme.com']);
    expect(ann[CONTACT_HEADER.indexOf('Email')]).toBe('ann@acme.com');
    expect(ann[CONTACT_HEADER.indexOf('Email 2')]).toBe('B2');
    expect(ann[CONTACT_HEADER.indexOf('Company phone (published on its site)')]).toBe('+6561234567');
    expect(ann[CONTACT_HEADER.indexOf('Draft check')]).toBe('strong (80% from research)');
    expect(rows.every((r) => r.length === CONTACT_HEADER.length)).toBe(true);
  });
  it('limits the rows to the ticked contacts', () => {
    expect(contactRows([acc], new Set(['a1|Eve Eng']))).toHaveLength(2);
  });
  it('still lists an account that has no people yet', () => {
    expect(contactRows([{ ...acc, people: undefined }])).toHaveLength(2);
  });
});

describe('Gmail message', () => {
  const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
  it('builds an encoded message with the recipient, subject and body', () => {
    const msg = decode(buildRaw({ to: 'ann@acme.com', subject: 'Héllo — Series B', body: 'Hi Ann,\nLine two' }));
    expect(msg).toMatch(/^To: ann@acme\.com\r\n/);
    const subject = /Subject: =\?UTF-8\?B\?(.+?)\?=/.exec(msg)![1];
    expect(Buffer.from(subject, 'base64').toString('utf8')).toBe('Héllo — Series B');
    const body = msg.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('Hi Ann,\r\nLine two');
  });
  it('can make a draft with no recipient, and refuses bad addresses and header injection', () => {
    expect(decode(buildRaw({ subject: 'x', body: 'y' }))).not.toMatch(/^To:/);
    expect(() => buildRaw({ to: 'a@b.com\r\nBcc: evil@x.com', subject: 'x', body: 'y' })).toThrow();
    expect(() => buildRaw({ to: 'not an email', subject: 'x', body: 'y' })).toThrow();
    expect(decode(buildRaw({ subject: 'a\r\nBcc: evil@x.com', body: 'y' }))).not.toMatch(/\r\nBcc:/);
    expect(validEmail('a@b.co')).toBe(true);
  });
});

describe('secrets', () => {
  it('round-trips and refuses tampering', () => {
    const s = seal('{"refresh":"tok"}');
    expect(s).not.toContain('tok');
    expect(unseal(s)).toBe('{"refresh":"tok"}');
    expect(() => unseal(s.slice(0, -4) + 'AAAA')).toThrow();
  });
});

describe('extractPhones', () => {
  it('reads tel links and international numbers, ignores short or repeated digits', () => {
    const html = '<a href="tel:+65 6123 4567">call</a> Office: +1 (415) 555-0188. Ref 12345 and +0000000000';
    expect(extractPhones(html)).toEqual(['+6561234567', '+14155550188']);
  });
});
