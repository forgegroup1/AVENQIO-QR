import { NextResponse } from 'next/server';
import { dbConfig, getReadyDb } from '@/server/db';

/** Liveness + database readiness. Safe to expose: no secrets, no counts. */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getReadyDb();
    await db.query('select 1');
    return NextResponse.json(
      {
        status: 'ok',
        driver: dbConfig().driver,
        database: 'reachable',
        latencyMs: Date.now() - started,
        time: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[health] database check failed', error);
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
