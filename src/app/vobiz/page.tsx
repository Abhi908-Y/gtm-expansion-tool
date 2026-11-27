import type { Metadata } from 'next';
import { view } from '@/actions';
import Customers from '@/components/vobiz/Customers';
import HubShell from '@/components/vobiz/HubShell';
import { CompetitorPanel, PlaybookPanel, RegionPanel } from '@/components/vobiz/ToolPanel';
import type { Project } from '@/store';
import sample from '../../../data/sample/vobiz.json';
import accountsData from '../../../data/vobiz/accounts.json';
import checklist from '../../../data/vobiz/checklist.json';
import curated from '../../../data/vobiz/curated-accounts.json';
import partnerTypes from '../../../data/vobiz/partner-types.json';
import sections from '../../../data/vobiz/sections.json';
import toolAccountsData from '../../../data/vobiz/tool-accounts.json';
import './hub.css';
import './shell.css';

export const metadata: Metadata = {
  title: 'Vobiz AI International Expansion Strategy',
  description: 'Market research, target accounts, partners and a trackable outreach plan for Vobiz.ai across Southeast Asia, the Middle East and Europe.',
};

const st = view(sample as unknown as Project);
const html = sections.html as Record<string, string>;
const meta = sections.meta as Record<string, string>;
const Page = ({ id, children }: { id: string; children?: React.ReactNode }) => (
  <>
    <div className={`hb-content hb-view ${meta[id] ? `hb-${meta[id]}` : ''}`} dangerouslySetInnerHTML={{ __html: html[id] }} />
    {children}
  </>
);

// Records the tool found and verified itself (a quote from a fetched page). They are added to the manual research, labelled as the tool's.
const rawTool = toolAccountsData as unknown as { accounts?: unknown[]; records?: unknown[] } | unknown[];
const toolAccounts = ((Array.isArray(rawTool) ? rawTool : (rawTool.accounts ?? rawTool.records ?? [])) as any[]).map((r) => ({
  region: r.region, kind: r.kind, sector: r.sector, industry: r.sector, company: r.company, country: r.country, profile: r.what, website: r.website,
  signal: `Why it may fit (the tool’s inference, not from the source): ${r.signal ?? r.what}`, strength: 'medium' as const, strengthLabel: 'Tool-found', source: 'tool', sourceUrl: r.sourceUrl, quote: r.quote,
}));

export default function VobizHub() {
  const known = Object.fromEntries(Object.entries(partnerTypes).map(([k, v]) => [k, { sector: v.type, country: v.country }]));
  const nodes: Record<string, React.ReactNode> = Object.fromEntries(Object.keys(html).map((id) => [id, <Page key={id} id={id} />]));
  nodes['middle-east'] = <Page id="middle-east"><RegionPanel st={st} region="Middle East" /></Page>;
  nodes['europe'] = <Page id="europe"><RegionPanel st={st} region="Europe" /></Page>;
  nodes['southeast-asia'] = <Page id="southeast-asia"><RegionPanel st={st} region="Southeast Asia" /></Page>;
  nodes['competitors'] = <Page id="competitors"><CompetitorPanel st={st} /></Page>;
  nodes['playbook'] = <Page id="playbook"><PlaybookPanel st={st} /></Page>;
  nodes['customers'] = <Customers accounts={[...(accountsData.accounts as any[]), ...(curated.accounts as any[]), ...toolAccounts]} gaps={accountsData.gaps} known={known} />;
  return <HubShell nodes={nodes} checklist={checklist as any} />;
}
