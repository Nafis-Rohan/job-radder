import { prisma } from '../../shared/db/prisma.js';

// The free Postgres on Neon allows 0.5 GB. Change this if the host or plan changes.
export const DB_LIMIT_BYTES = 512 * 1024 * 1024;

const toMb = (bytes) => Math.round((bytes / (1024 * 1024)) * 100) / 100;

// Builds the answer from raw numbers (no database here, so it is easy to test).
export function buildDbSize({ totalBytes, tables, limitBytes = DB_LIMIT_BYTES }) {
  const sorted = [...tables]
    .sort((a, b) => b.bytes - a.bytes)
    .map((t) => ({ table: t.table, rows: t.rows, bytes: t.bytes, mb: toMb(t.bytes) }));
  return {
    totalBytes,
    totalMb: toMb(totalBytes),
    limitMb: toMb(limitBytes),
    percentUsed: Math.round((totalBytes / limitBytes) * 1000) / 10,
    tables: sorted,
  };
}

// Total database size + size and exact row count of every table (biggest first).
export async function getDbSize() {
  const [{ bytes: totalBytes }] = await prisma.$queryRaw`
    SELECT pg_database_size(current_database())::float8 AS bytes`;

  const found = await prisma.$queryRaw`
    SELECT c.relname AS name, pg_total_relation_size(c.oid)::float8 AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'`;

  const tables = [];
  for (const { name, bytes } of found) {
    // names come from the database catalog, but only plain names are ever put into the query
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${name}"`);
    tables.push({ table: name, rows: n, bytes });
  }

  return buildDbSize({ totalBytes, tables });
}
