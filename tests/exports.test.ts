import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import sample from '../data/sample/vobiz.json';
import { fileFor, sheetsFor } from '../src/components/exports';
import { makeXlsx, sheetName } from '../src/components/xlsx';
import { view } from '../src/actions';
import type { Project } from '../src/store';

const st = { ...view(sample as unknown as Project), gmail: { configured: false, connected: false, email: '' } } as any;

describe('makeXlsx', () => {
  it('writes a valid workbook: parts present, header bold, numbers numeric, text escaped, sheet names safe and unique', () => {
    const files = unzipSync(makeXlsx([{ name: 'A/B:C', rows: [['Name', 'Score'], ['R&D <x>', 12.5]] }, { name: 'a/b:c', rows: [['x']] }]));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('R&amp;D &lt;x&gt;');
    expect(sheet).toContain('<v>12.5</v>');
    expect(sheet).toMatch(/t="inlineStr" s="1"><is><t xml:space="preserve">Name/);
    const wb = strFromU8(files['xl/workbook.xml']);
    expect(wb).toContain('name="A B C"');
    expect(wb).toContain('name="a b c 2"');
    expect(sheetName('x'.repeat(50), [])).toHaveLength(31);
  });
});

describe('exports', () => {
  it('lists every accepted competitor with its website', () => {
    const [s] = sheetsFor(st, 'competitors');
    const n = (sample as any).competitors.filter((c: any) => c.status === 'accepted').length;
    expect(s.rows).toHaveLength(n + 1);
    expect(s.rows[1][1]).toMatch(/\./);
  });
  it('lists scored and ruled-out countries with the reason', () => {
    const [s] = sheetsFor(st, 'countries');
    const out = s.rows.filter((r) => r[2] === 'Ruled out');
    expect(out.length).toBeGreaterThan(0);
    expect(String(out[0][11])).not.toBe('');
  });
  it('builds an Excel file by default and a CSV when asked for a single table; everything is always Excel', () => {
    expect(fileFor(st, 'competitors', 'xlsx').name).toMatch(/-competitors\.xlsx$/);
    expect(fileFor(st, 'competitors', 'csv').name).toMatch(/-competitors\.csv$/);
    expect(fileFor(st, 'everything', 'csv').name).toMatch(/\.xlsx$/);
    expect(sheetsFor(st, 'everything').map((s) => s.name)).toEqual(['Competitors', 'Countries', 'Outreach contacts', 'Weekly KPIs']);
  });
});
