'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PRESETS } from '@/data/regions';
import { Dictate } from './Mic';

async function send(body: object): Promise<{ id: string }> {
  const res = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not create the plan');
  return data;
}

function useGo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (body: object) => {
    setBusy(true);
    setErr('');
    try {
      const auto = (body as { op?: string }).op === 'create' ? '?auto=1' : '';
      router.push(`/p/${(await send(body)).id}${auto}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return { busy, err, go };
}

export function SampleButton() {
  const { busy, err, go } = useGo();
  return (
    <div>
      <button className="btn" disabled={busy} onClick={() => go({ op: 'sample' })}>{busy ? 'Opening…' : 'Open example'}</button>
      {err && <p className="note bad" style={{ marginTop: 8 }}>{err}</p>}
    </div>
  );
}

export default function NewPlan() {
  const { busy, err, go } = useGo();
  const [tz, setTz] = useState('Asia/Kolkata');
  const [company, setCompany] = useState('');
  const [context, setContext] = useState('');
  const [picked, setPicked] = useState<string[]>(['sea', 'me', 'eu']);
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  }, []);
  const n = PRESETS.filter((r) => picked.includes(r.id)).reduce((t, r) => t + r.countries.length, 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        go({ op: 'create', company, website: f.get('website'), context, baseTz: tz, regions: picked, extraCountries: f.get('extra') });
      }}
    >
      <div className="grid2" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="company">Company</label><Dictate id="company" required maxLength={100} placeholder="Acme Voice" autoComplete="organization" value={company} onChange={setCompany} /></div>
        <div className="field"><label htmlFor="website">Website</label><input id="website" name="website" required placeholder="acme.com" inputMode="url" /></div>
      </div>
      <div className="field"><label htmlFor="context">What they sell, and to whom <span className="faint">(optional)</span></label><Dictate multiline id="context" maxLength={1500} placeholder="Telephony APIs for voice AI agents. Mostly AI builders, some enterprises." value={context} onChange={setContext} /></div>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend className="legend" style={{ marginBottom: 6 }}>Regions to consider · {n} countries</legend>
        <div className="chips">
          {PRESETS.map((r) => {
            const on = picked.includes(r.id);
            return (
              <label key={r.id} className={`chip ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
                {r.name}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid2" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="extra">Other countries <span className="faint">(ISO codes)</span></label><input id="extra" name="extra" placeholder="NZL, ZAF" /></div>
        <div className="field"><label htmlFor="tz">Your sales team’s time zone</label><input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} /></div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create plan'}</button>
        {err && <p className="note bad">{err}</p>}
      </div>
    </form>
  );
}
