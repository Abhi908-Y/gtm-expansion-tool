import { toCsv } from '../strategy/strategy';

/** Save text as a file. The BOM makes Excel read accents and non-Latin names correctly. */
export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadCsv = (name: string, rows: unknown[][]) => downloadText(name, toCsv(rows));

export const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';

/** Save a built file (text or bytes) from the browser. */
export function saveFile(f: { name: string; type: string; data: string | Uint8Array }) {
  const url = URL.createObjectURL(new Blob([f.data as BlobPart], { type: f.type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  URL.revokeObjectURL(url);
}
