/** @jest-environment node */
import { query } from '@/lib/db';

describe('DB – podstawowa łączność', () => {
  it('połączenie z DB działa (zapytanie raw SELECT 1)', async () => {
    // Działa dla MySQL/MariaDB
    const res = await query<{ ok: number }>('SELECT 1 AS ok');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].ok).toBe(1);
  });
});
