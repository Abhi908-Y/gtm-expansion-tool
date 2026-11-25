import type { viewFor } from '@/actions';

export type State = Awaited<ReturnType<typeof viewFor>>;
export type Run = (label: string, fn: () => Promise<unknown>) => Promise<void>;
export type Tab = 'overview' | 'company' | 'countries' | 'competitors' | 'outreach' | 'strategy';
export type Auto = { phases: import('./plan/autopilot').Phase[]; running: boolean; start: () => void; stop: () => void };
export type TabProps = { auto: Auto; st: State; post: (action: string, body?: object) => Promise<any>; run: Run; busy: string; ro: boolean; go: (t: Tab) => void };

const VERDICT_TONE: Record<string, string> = { Beachhead: 'good', 'Second wave': 'info', 'Fix coverage first': 'bad', 'Check coverage': 'warn', Watch: '', Deprioritise: '' };
export const verdictTone = (v?: string) => VERDICT_TONE[v ?? ''] ?? '';
export const TYPE_LABEL: Record<string, string> = { platform: 'Platform (CPaaS)', telco: 'Telco', ai_platform: 'AI platform', wholesaler: 'Wholesaler', other: 'Other', unclassified: 'Unclassified' };
export const TYPE_TONE: Record<string, string> = { platform: 'accent', telco: 'info', ai_platform: 'warn', wholesaler: 'good', other: '', unclassified: '' };

export async function call(path: string, body?: object) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
