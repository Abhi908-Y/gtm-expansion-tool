'use client';
import { useEffect, useRef, useState } from 'react';

// Speech to text with the browser's own recognition: no key, no audio leaves the page except through the browser's speech service.
// Chrome, Edge and Safari have it; where it is missing the button is not shown.
type Rec = { start(): void; stop(): void; lang: string; continuous: boolean; interimResults: boolean; onresult: (e: any) => void; onend: () => void; onerror: () => void };
const ctor = () => (typeof window === 'undefined' ? null : ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as (new () => Rec) | null);

export function Mic({ onText }: { onText: (t: string) => void }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => {
    setOk(!!ctor());
  }, []);
  useEffect(() => {
    return () => {
      rec.current?.stop();
    };
  }, []);
  if (!ok) return null;

  const toggle = () => {
    if (on) return rec.current?.stop();
    const R = ctor()!;
    const r = new R();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t.trim()) cb.current(t.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <button type="button" className={`mic ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={on ? 'Stop dictation' : 'Dictate with your voice'} title={on ? 'Listening… click to stop' : 'Speak instead of typing'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
      </svg>
    </button>
  );
}

/** An input or textarea with a mic button inside it. Spoken text is appended to what is already there. */
export function Dictate({ value, onChange, multiline, ...rest }: { value: string; onChange: (v: string) => void; multiline?: boolean } & Record<string, any>) {
  const latest = useRef(value);
  latest.current = value;
  const add = (t: string) => onChange((latest.current ? latest.current.replace(/\s+$/, '') + ' ' : '') + t);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className={`dictate ${multiline ? 'multi' : ''}`}>
      <Tag {...rest} value={value} onChange={(e: any) => onChange(e.target.value)} />
      <Mic onText={add} />
    </div>
  );
}
