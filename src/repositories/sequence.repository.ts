import { prisma } from '../config/prisma';

/** Atomically increments and returns the counter for `scope` (e.g. "INVOICE:2026"),
 * creating the row on first use. Relies on a single UPDATE...OUTPUT statement for
 * atomicity under SQL Server's default READ COMMITTED isolation (row locking within
 * one UPDATE is enough — no explicit transaction needed). */
export async function incrementAndGet(scope: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ currentValue: number }[]>`
    UPDATE dbo.NumberSequence SET currentValue = currentValue + 1
    OUTPUT INSERTED.currentValue
    WHERE scope = ${scope}`;

  if (rows.length > 0) return rows[0]!.currentValue;

  try {
    const created = await prisma.numberSequence.create({ data: { scope, currentValue: 1 } });
    return created.currentValue;
  } catch {
    // Lost the race to create the row — someone else created it first; retry the update.
    const retry = await prisma.$queryRaw<{ currentValue: number }[]>`
      UPDATE dbo.NumberSequence SET currentValue = currentValue + 1
      OUTPUT INSERTED.currentValue
      WHERE scope = ${scope}`;
    return retry[0]!.currentValue;
  }
}
