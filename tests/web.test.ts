import { describe, expect, it } from 'vitest';
import { PRESETS, TZ, validTz } from '../src/data/regions';
import { isPrivateIp, safeFetch } from '../src/scrape/safeFetch';

describe('isPrivateIp', () => {
  it('flags internal addresses and allows public ones', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.1.1', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

describe('safeFetch', () => {
  it('refuses localhost, metadata and private literals before connecting', async () => {
    for (const u of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'ftp://example.com/'])
      await expect(safeFetch(u)).rejects.toThrow();
  });
});

describe('region presets', () => {
  it('have unique countries, valid time zones and a zone for every country', () => {
    const all = PRESETS.flatMap((p) => p.countries);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((c) => !TZ[c])).toEqual([]);
    expect(Object.entries(TZ).filter(([, z]) => !validTz(z))).toEqual([]);
  });
});
