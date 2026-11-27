import type { Kind } from '@/crm/model';
import { call } from '../shared';

export const crmApi = (action: string, body: object = {}) => call(`/api/crm/${action}`, body);
export type Gmail = { configured: boolean; connected: boolean; email: string };
export type Known = Record<string, { sector?: string; country?: string }>;
export type Prefill = { kind: Kind; region: string; sector: string; company: string; country: string; website?: string };
export const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the visitor's own time zone
