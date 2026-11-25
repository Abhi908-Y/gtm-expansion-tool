import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import type { Project } from './store';

// Storage for plans. With DATABASE_URL (Neon) plans are rows; without it they are JSON files, which is what local development uses.
// A "workspace" is one browser's private bucket, identified by a secret cookie. There are no accounts yet.
const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;
let ready: Promise<unknown> | null = null;
const ensure = () =>
  (ready ??= sql!`CREATE TABLE IF NOT EXISTS plans (workspace text NOT NULL, id text NOT NULL, doc jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace, id))`);

const dir = (ws: string) => `${process.env.VERCEL ? '/tmp/gtm' : 'data'}/plans/${ws}`;
const safe = (s: string) => s.replace(/[^a-z0-9_-]/gi, '');

export async function getPlan(ws: string, id: string): Promise<Project | null> {
  if (sql) {
    await ensure();
    const r = (await sql`SELECT doc FROM plans WHERE workspace = ${ws} AND id = ${id}`) as { doc: Project }[];
    return r[0]?.doc ?? null;
  }
  try {
    return JSON.parse(await readFile(`${dir(ws)}/${safe(id)}.json`, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function putPlan(ws: string, p: Project) {
  if (sql) {
    await ensure();
    await sql`INSERT INTO plans (workspace, id, doc) VALUES (${ws}, ${p.id}, ${JSON.stringify(p)}::jsonb) ON CONFLICT (workspace, id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`;
    return;
  }
  await mkdir(dir(ws), { recursive: true });
  await writeFile(`${dir(ws)}/${safe(p.id)}.json`, JSON.stringify(p));
}

export async function listPlans(ws: string): Promise<{ id: string; company: string; updated: string }[]> {
  if (sql) {
    await ensure();
    const r = (await sql`SELECT id, doc->>'company' AS company, updated_at FROM plans WHERE workspace = ${ws} ORDER BY updated_at DESC LIMIT 50`) as { id: string; company: string; updated_at: string }[];
    return r.map((x) => ({ id: x.id, company: x.company, updated: String(x.updated_at) }));
  }
  try {
    const out = await Promise.all((await readdir(dir(ws))).filter((f) => f.endsWith('.json')).map(async (f) => {
      const p = JSON.parse(await readFile(`${dir(ws)}/${f}`, 'utf8')) as Project;
      return { id: p.id, company: p.company, updated: p.ranAt ?? p.createdAt ?? '' };
    }));
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  } catch {
    return [];
  }
}

// ---------- per-workspace secrets (already encrypted by the caller) ----------
let readySecrets: Promise<unknown> | null = null;
const ensureSecrets = () => (readySecrets ??= sql!`CREATE TABLE IF NOT EXISTS secrets (workspace text NOT NULL, name text NOT NULL, value text NOT NULL, PRIMARY KEY (workspace, name))`);
const secretFile = (ws: string, name: string) => `${dir(ws)}/.secret-${safe(name)}`;

export async function getSecret(ws: string, name: string): Promise<string | null> {
  if (sql) {
    await ensureSecrets();
    const r = (await sql`SELECT value FROM secrets WHERE workspace = ${ws} AND name = ${name}`) as { value: string }[];
    return r[0]?.value ?? null;
  }
  try {
    return await readFile(secretFile(ws, name), 'utf8');
  } catch {
    return null;
  }
}

export async function putSecret(ws: string, name: string, value: string) {
  if (sql) {
    await ensureSecrets();
    await sql`INSERT INTO secrets (workspace, name, value) VALUES (${ws}, ${name}, ${value}) ON CONFLICT (workspace, name) DO UPDATE SET value = EXCLUDED.value`;
    return;
  }
  await mkdir(dir(ws), { recursive: true });
  await writeFile(secretFile(ws, name), value);
}

export async function deleteSecret(ws: string, name: string) {
  if (sql) {
    await ensureSecrets();
    await sql`DELETE FROM secrets WHERE workspace = ${ws} AND name = ${name}`;
    return;
  }
  await writeFile(secretFile(ws, name), '').catch(() => {});
}
