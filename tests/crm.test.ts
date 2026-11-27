import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { raw: string }[] = [];
const drafts: string[] = [];
vi.mock('../src/google', async (orig) => ({
  ...(await orig<typeof import('../src/google')>()),
  accessFor: async () => 'token',
  gmailStatus: async () => ({ configured: true, connected: true, email: 'me@example.com' }),
  sendRaw: async (_: string, raw: string) => (sent.push({ raw }), { id: `m${sent.length}`, thread: `t${sent.length}` }),
  createDraft: async (_: string, raw: string) => (drafts.push(raw), 'd1'),
}));

import { crmAct } from '../src/crm/actions';
import { buildImport, defaultCrm, emptyLead, parseCsv, regionOf, render, tasksFor, unknownTokens } from '../src/crm/model';

const NOW = '2026-11-27T10:00:00.000Z';
// invented people and companies: no real contact data in the repo
const CONTACTS = `First Name,Last Name,Title,Company Name,Email,Email Status,Person Linkedin Url,Website,Company Country,Corporate Phone,Industry
Ada,Lovelace,CEO,Acme Voice,ada@acme.test,Verified,http://www.linkedin.com/in/ada-l,acme.test,Singapore,+65 6000 0000,Software
Bo,"Chen, Jr",CTO,"Beta, Calls",,Unavailable,http://www.linkedin.com/in/bo-c,beta.test,Malaysia,,Call centre
Cy,Dunn,Founder,Gamma AI,cy@gamma.test,Unverified,http://www.linkedin.com/in/cy-d,gamma.test,Netherlands,,
,NoFirst,x,Delta,d@delta.test,Verified,http://www.linkedin.com/in/x,,Singapore,,`;
const PARTNERS = `Company Name,Country,Website,Category #,Category Label,What They Sell,Employees,Funding
Acme Voice,Singapore,acme.test,1,AI Voice Agent / Voicebot Builder,voice agents,50,seed`;

const newWs = () => randomBytes(16).toString('hex');
let w = newWs();
const act = (a: string, b: any = {}) => crmAct(w, a, b) as Promise<any>;
beforeEach(() => {
  sent.length = 0;
  drafts.length = 0;
  rmSync(`data/plans/${w}`, { recursive: true, force: true });
  w = newWs();
});

describe('csv and import', () => {
  it('reads quotes, commas and line breaks inside cells', () => {
    expect(parseCsv('a,b\n"x, y","line1\nline2"\n')).toEqual([['a', 'b'], ['x, y', 'line1\nline2']]);
  });
  it('builds people from an Apollo contacts export, takes sector from the partner list, skips rows with no first name', () => {
    const r = buildImport([{ name: 'c.csv', text: CONTACTS }, { name: 'p.csv', text: PARTNERS }], { kind: 'partner' }, NOW);
    expect(r.leads).toHaveLength(3);
    const ada = r.leads.find((l) => l.name === 'Ada Lovelace')!;
    expect(ada).toMatchObject({ sector: 'AI Voice Agent / Voicebot Builder', region: 'Southeast Asia', emailStatus: 'Verified', kind: 'partner', stage: 'new' });
    expect(r.leads.find((l) => l.company === 'Beta, Calls')?.sector).toBe('Call centre'); // falls back to the Industry column
    expect(r.leads.find((l) => l.country === 'Netherlands')?.region).toBe('Europe');
    expect(r.warnings.join(' ')).toMatch(/1 rows had no first name/);
  });
  it('gives the same person the same id on every import', () => {
    const a = buildImport([{ name: 'c.csv', text: CONTACTS }], { kind: 'partner' }, NOW).leads.map((l) => l.id);
    const b = buildImport([{ name: 'c.csv', text: CONTACTS }], { kind: 'enterprise' }, NOW).leads.map((l) => l.id);
    expect(a).toEqual(b);
  });
  it('maps countries to regions', () => {
    expect(['Indonesia', 'UAE', 'Türkiye', 'United Kingdom', 'Brazil'].map(regionOf)).toEqual(['Southeast Asia', 'Middle East', 'Middle East', 'Europe', 'Other']);
  });
});

describe('templates and the day plan', () => {
  const lead = emptyLead({ company: 'Acme Voice', name: 'Ada Lovelace', country: 'Singapore' }, NOW);
  it('fills fields and reports anything empty instead of sending a blank', () => {
    expect(render('Hi {First Name} at {Company} in {Region}', lead, defaultCrm().settings).text).toBe('Hi Ada at Acme Voice in Southeast Asia');
    expect(render('From {Sender Name}', lead, defaultCrm().settings).missing).toEqual(['Sender Name']);
    expect(unknownTokens('Hi {First Name} {Nonsense}')).toEqual(['Nonsense']);
  });
  it('lists steps due by their day, only for people whose sequence is running and who have not had the step', () => {
    const seqs = defaultCrm().sequences;
    const a = { ...lead, startedAt: '2026-11-27', email: 'a@a.test' };
    expect(tasksFor([a], seqs, '2026-11-27').map((t) => t.step.id)).toEqual(['li-connect']);
    const later = tasksFor([{ ...a, done: { 'li-connect': { at: 'x', how: 'manual' as const } } }], seqs, '2026-12-02');
    expect(later.map((t) => t.step.id)).toEqual(['li-message', 'email-1', 'email-2']);
    expect(later.every((t) => t.overdue)).toBe(true);
    expect(tasksFor([{ ...a, stage: 'replied' as const }], seqs, '2026-12-30')).toEqual([]);
    expect(tasksFor([{ ...a, email: undefined }], seqs, '2026-11-30').find((t) => t.step.id === 'email-1')?.blocked).toBe('No email address');
  });
});

async function seed() {
  const leads = buildImport([{ name: 'c.csv', text: CONTACTS }], { kind: 'partner' }, NOW).leads;
  await act('import', { leads });
  await act('settings', { senderName: 'Sam Seller', cc: 'boss@example.com', signature: '', whatsapp: '' });
  return (await act('load', {})).crm.leads as typeof leads;
}

describe('crm actions', () => {
  it('imports without duplicating, and a re-import keeps progress', async () => {
    const leads = await seed();
    const ada = leads.find((l) => l.name === 'Ada Lovelace')!;
    await act('done', { ids: [ada.id], step: 'li-connect' });
    const again = await act('import', { leads: buildImport([{ name: 'c.csv', text: CONTACTS }], { kind: 'partner' }, NOW).leads });
    expect(again).toMatchObject({ added: 0, updated: 3, total: 3 });
    const after = (await act('load', {})).crm.leads.find((l: any) => l.id === ada.id);
    expect(after.done['li-connect']).toBeTruthy();
    expect(after.stage).toBe('contacted');
  });
  it('refuses to send without confirmation or a sender name', async () => {
    const leads = await seed();
    await expect(act('send', { ids: [leads[0].id], step: 'email-1', mode: 'send' })).rejects.toThrow(/Confirm/);
    await act('settings', { senderName: '', cc: '' });
    await expect(act('send', { ids: [leads[0].id], step: 'email-1', mode: 'send', confirm: true })).rejects.toThrow(/name/);
  });
  it('sends only to verified emails, copies the CC, fills the sign-off, and never sends the same step twice', async () => {
    const leads = await seed();
    const r = await act('send', { ids: leads.map((l) => l.id), step: 'email-1', mode: 'send', confirm: true });
    const by = Object.fromEntries(r.results.map((x: any) => [x.name, x]));
    expect(by['Ada Lovelace'].status).toBe('sent');
    expect(by['Bo Chen, Jr'].note).toMatch(/No email/);
    expect(by['Cy Dunn'].note).toMatch(/not verified/);
    expect(sent).toHaveLength(1);
    const text = Buffer.from(sent[0].raw, 'base64url').toString();
    expect(text).toMatch(/^To: ada@acme.test/m);
    expect(text).toMatch(/^Cc: boss@example.com/m);
    const again = await act('send', { ids: [leads[0].id], step: 'email-1', mode: 'send', confirm: true });
    expect(again.results[0].note).toMatch(/already done/);
    expect(sent).toHaveLength(1);
    const ada = (await act('load', {})).crm.leads.find((l: any) => l.name === 'Ada Lovelace');
    expect(ada.done['email-1']).toMatchObject({ how: 'sent', ref: 'm1', thread: 't1' });
    expect(ada.log.at(-1).text).toMatch(/sent to ada@acme.test/);
  });
  it('a test email goes to your own address and records nothing; drafts do not copy anyone', async () => {
    const leads = await seed();
    const t = await act('send', { ids: [leads[0].id], step: 'email-1', mode: 'test' });
    expect(t.results[0].status).toBe('test');
    expect(Buffer.from(sent[0].raw, 'base64url').toString()).toMatch(/^To: me@example.com/m);
    expect((await act('load', {})).crm.leads[0].done).toEqual({});
    await act('send', { ids: [leads[0].id], step: 'email-1', mode: 'draft' });
    expect(drafts).toHaveLength(1);
  });
  it('stops the sequence once someone has replied, and will not email them', async () => {
    const leads = await seed();
    await act('update', { ids: [leads[0].id], patch: { stage: 'replied' } });
    const r = await act('send', { ids: [leads[0].id], step: 'email-2', mode: 'send', confirm: true });
    expect(r.results[0].note).toMatch(/replied or closed/);
    expect(sent).toHaveLength(0);
  });
  it('validates a changed sequence', async () => {
    await expect(act('sequence', { kind: 'partner', steps: [{ id: 'a1', day: 1, channel: 'email', title: 't', subject: 's', body: 'Hi {Nope}' }] })).rejects.toThrow(/Unknown field/);
    await expect(act('sequence', { kind: 'partner', steps: [{ id: 'a1', day: 1, channel: 'email', title: 't', subject: 's', body: '' }] })).rejects.toThrow(/message/);
    await act('sequence', { kind: 'partner', steps: [{ id: 'later', day: 9, channel: 'email', title: 'late', subject: 's', body: 'Hi {First Name}' }, { id: 'early', day: 2, channel: 'linkedin', title: 'early', body: 'x' }] });
    expect((await act('load', {})).crm.sequences.partner.map((s: any) => s.id)).toEqual(['early', 'later']);
  });
});
