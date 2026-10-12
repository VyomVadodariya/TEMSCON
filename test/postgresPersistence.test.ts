import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresSessionStore } from '../server/src/services/postgresSessionStore.js';
import { buildServer } from '../server/src/server.js';
import pg from 'pg';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/aiocc';

describe('PostgreSQL Persistence & Serverless Durability Suite', () => {
  let store: PostgresSessionStore;
  let testSessionCode: string;
  let isDbAvailable = false;

  before(async () => {
    testSessionCode = `PG-TEST-${Date.now()}`;
    const testPool = new pg.Pool({ connectionString: TEST_DB_URL, connectionTimeoutMillis: 1500 });
    try {
      await testPool.query('SELECT 1');
      isDbAvailable = true;
      store = new PostgresSessionStore({ connectionString: TEST_DB_URL });
      await store.init();
    } catch {
      isDbAvailable = false;
    } finally {
      await testPool.end();
    }
  });

  after(async () => {
    if (store && isDbAvailable) {
      await store.close();
    }
  });

  it('Schema Migrations: creates aiocc tables, indexes, and default session', async (t) => {
    if (!isDbAvailable) {
      t.skip(`PostgreSQL test database not available at ${TEST_DB_URL}; skipping integration check.`);
      return;
    }
    const pool = new pg.Pool({ connectionString: TEST_DB_URL });
    try {
      const tablesRes = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE 'aiocc_%'
        ORDER BY table_name;
      `);
      const tables = tablesRes.rows.map(r => r.table_name);
      assert.ok(tables.includes('aiocc_sessions'), 'aiocc_sessions must exist');
      assert.ok(tables.includes('aiocc_participants'), 'aiocc_participants must exist');
      assert.ok(tables.includes('aiocc_decisions'), 'aiocc_decisions must exist');

      const defaultSess = await store.getSession('DEMO-2026');
      assert.ok(defaultSess, 'Default DEMO-2026 session must be seeded');
      assert.equal(defaultSess.sessionCode, 'DEMO-2026');
    } finally {
      await pool.end();
    }
  });

  it('Participant Enrollment & Balanced Allocation: persists queue and assigns conditions', async (t) => {
    if (!isDbAvailable) {
      t.skip('Database unavailable');
      return;
    }
    await store.createSession(testSessionCode, 50);

    const { participant: p1 } = await store.joinParticipant(testSessionCode, 'Operator-1');
    const { participant: p2 } = await store.joinParticipant(testSessionCode, 'Operator-2');

    assert.equal(p1.condition, 'EXTENDED_REVIEW');
    assert.equal(p2.condition, 'REDUCED_REVIEW');
    assert.equal(p1.totalRequests, 53); // 3 practice + 50 scored
    assert.equal(p2.totalRequests, 53);
    assert.equal(p1.currentQueueIndex, 1);

    // Verify current scenario scrubbing
    const current = await store.getCurrentScenario(testSessionCode, p1.id);
    assert.ok(current.queueItem);
    assert.equal(current.queueItem.isPractice, true);
    assert.equal((current.queueItem.scenario as any).optimalAction, undefined, 'optimalAction must be scrubbed');
  });

  it('Decision Recording & Sequence Advancement: updates state atomically in transaction', async (t) => {
    if (!isDbAvailable) {
      t.skip('Database unavailable');
      return;
    }
    const { participant } = await store.joinParticipant(testSessionCode, 'Operator-Decisions');

    // Submit Decision 1 (Practice 1)
    const res1 = await store.submitDecision({
      sessionCode: testSessionCode,
      participantId: participant.id,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'APPROVE',
      dwellTimeMs: 2500,
      clientTimestamp: Date.now(),
      idempotencyKey: `idem-${participant.id}-1`
    });

    assert.equal(res1.success, true);
    assert.equal(res1.isDuplicate, false);
    assert.equal(res1.nextScenario.progress.current, 2);

    const updated = await store.getParticipant(testSessionCode, participant.id);
    assert.ok(updated);
    assert.equal(updated.currentQueueIndex, 2);
    assert.equal(updated.decisions.size, 1);
    assert.equal(updated.decisions.get('assign-1')?.decision, 'APPROVE');
  });

  it('Idempotency & Duplicate Submission: duplicate assignmentId does not duplicate scoring', async (t) => {
    if (!isDbAvailable) {
      t.skip('Database unavailable');
      return;
    }
    const { participant } = await store.joinParticipant(testSessionCode, 'Operator-Idempotent');

    // First submission
    const res1 = await store.submitDecision({
      sessionCode: testSessionCode,
      participantId: participant.id,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: `idem-${participant.id}-1`
    });
    assert.equal(res1.isDuplicate, false);

    // Duplicate submission with same assignmentId
    const res2 = await store.submitDecision({
      sessionCode: testSessionCode,
      participantId: participant.id,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'REJECT', // Attempting to change decision
      dwellTimeMs: 3000,
      clientTimestamp: Date.now(),
      idempotencyKey: `idem-${participant.id}-1-retry`
    });
    assert.equal(res2.success, true);
    assert.equal(res2.isDuplicate, true);

    const check = await store.getParticipant(testSessionCode, participant.id);
    assert.equal(check?.decisions.size, 1);
    assert.equal(check?.decisions.get('assign-1')?.decision, 'APPROVE', 'Original decision must remain unchanged');
  });

  it('Restoration Across Serverless Instances: new store instance rehydrates state from database', async (t) => {
    if (!isDbAvailable) {
      t.skip('Database unavailable');
      return;
    }
    const storeInstanceB = new PostgresSessionStore({ connectionString: TEST_DB_URL });
    try {
      const recoveredSession = await storeInstanceB.getSession(testSessionCode);
      assert.ok(recoveredSession, 'Session must be retrieved from database');
      assert.equal(recoveredSession.sessionCode, testSessionCode);
      assert.ok(recoveredSession.participants.size >= 3);

      const summary = await storeInstanceB.getPresenterSummary(testSessionCode);
      assert.ok(summary);
      assert.ok(summary.totalEnrolled >= 3);
    } finally {
      await storeInstanceB.close();
    }
  });

  it('Hypothesis Privacy Masking: hides condition breakdown until explicit reveal', async (t) => {
    if (!isDbAvailable) {
      t.skip('Database unavailable');
      return;
    }
    const summaryBefore = await store.getPresenterSummary(testSessionCode);
    assert.equal(summaryBefore.revealUnlocked, false);
    assert.equal(summaryBefore.conditionAMetrics, null);
    assert.equal(summaryBefore.conditionBMetrics, null);
    assert.ok(summaryBefore.participantsList.every((p: any) => p.condition === 'MASKED'));

    // Unlock reveal
    await store.setRevealUnlocked(testSessionCode, true);
    const summaryAfter = await store.getPresenterSummary(testSessionCode);
    assert.equal(summaryAfter.revealUnlocked, true);
    assert.ok(summaryAfter.conditionAMetrics !== null);
    assert.ok(summaryAfter.conditionBMetrics !== null);
    assert.ok(summaryAfter.participantsList.some((p: any) => p.condition === 'EXTENDED_REVIEW' || p.condition === 'REDUCED_REVIEW'));
  });

  it('Simulator Results from PostgreSQL: computes 5-card dashboard from database-persisted session', async (t) => {
    if (!isDbAvailable) {
      t.skip('Database unavailable');
      return;
    }
    const results = await store.getSimulatorResults(testSessionCode);
    assert.ok(results);
    assert.equal(results.sessionCode, testSessionCode);
    assert.ok(results.cards.totalApprovals);
    assert.ok(results.cards.correctDecisions);
    assert.ok(results.cards.unsafeApprovals);
    assert.ok(results.cards.medianDecisionTime);
    assert.ok(results.cards.earlyVsLateReview);
    assert.equal(results.metadata.practiceExcluded, true);
    assert.equal(results.metadata.serverAuthoritative, true);
  });

  it('Production Fail-Closed Persistence: server throws when DATABASE_URL is missing in production/Vercel', () => {
    const savedVercel = process.env.VERCEL;
    const savedDbUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      process.env.VERCEL = '1';

      assert.throws(
        () => {
          buildServer({ presenterKey: 'valid-test-key-99', isProduction: true });
        },
        /FATAL PERSISTENCE ERROR: DATABASE_URL environment variable is required in production on Vercel/
      );
    } finally {
      if (savedVercel) process.env.VERCEL = savedVercel; else delete process.env.VERCEL;
      if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
    }
  });
});
