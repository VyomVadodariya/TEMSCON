import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/src/server.js';
import { FastifyInstance } from 'fastify';

describe('Full Multi-Participant Session Simulation with Presenter Reveal', () => {
  let app: FastifyInstance;
  const TEST_SIM_PRESENTER_KEY = 'test-sim-isolated-auth-token-7629';

  before(async () => {
    app = buildServer({ presenterKey: TEST_SIM_PRESENTER_KEY });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('Simulates complete 53-request session for Condition A and Condition B operators to completion and reveal', async () => {
    const sessionCode = 'COHORT-FULL-SIM';

    // 1. Presenter creates session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/create',
      headers: { 'x-presenter-key': TEST_SIM_PRESENTER_KEY },
      payload: { sessionCode, scoredRequestCount: 50 }
    });
    assert.equal(createRes.statusCode, 201);

    // 2. Participant 1 joins (Condition A: EXTENDED_REVIEW)
    const joinRes1 = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode, alias: 'Operator-Complacent' }
    });
    const p1 = JSON.parse(joinRes1.payload);

    // 3. Participant 2 joins (Condition B: REDUCED_REVIEW)
    const joinRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode, alias: 'Operator-Vigilant' }
    });
    const p2 = JSON.parse(joinRes2.payload);

    // 4. Operator 1 processes all 53 requests (approves everything, complacent behavior)
    for (let k = 1; k <= 53; k++) {
      const curr = await app.inject({
        method: 'GET',
        url: `/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${p1.participantId}`
      });
      const currData = JSON.parse(curr.payload);
      assert.equal(currData.isCompleted, false);
      assert.equal(currData.progress.current, k);

      // Submit decision APPROVE
      const decRes = await app.inject({
        method: 'POST',
        url: '/api/v1/participant/decisions',
        payload: {
          sessionCode,
          participantId: p1.participantId,
          queueIndex: k,
          assignmentId: `assign-${k}`,
          decision: 'APPROVE',
          dwellTimeMs: 2500,
          idempotencyKey: `idem-p1-${k}`
        }
      });
      assert.equal(decRes.statusCode, 201);
    }

    // Verify Operator 1 is now completed
    const final1 = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${p1.participantId}`
    });
    const finalData1 = JSON.parse(final1.payload);
    assert.equal(finalData1.isCompleted, true);
    assert.ok(finalData1.scoreSummary);
    assert.equal(finalData1.scoreSummary.catastrophicApprovalCount, 4);
    assert.equal(finalData1.scoreSummary.simulationOversightScore, 0.0); // Clamped at 0 due to catastrophic approvals!

    // 5. Operator 2 processes all 53 requests (vigilant operator: rejects all probes, approves routine)
    for (let k = 1; k <= 53; k++) {
      const curr = await app.inject({
        method: 'GET',
        url: `/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${p2.participantId}`
      });
      const currData = JSON.parse(curr.payload);
      assert.equal(currData.isCompleted, false);

      // Vigilant operator rejects high-risk and catastrophic probes, approves routine
      // At positions 10, 12, 22, 24, 34, 36, 46, 48 (in 1-indexed overall queue), probes occur
      const isProbeIndex = [10, 12, 22, 24, 34, 36, 46, 48].includes(k);
      const action = isProbeIndex ? 'REJECT' : 'APPROVE';

      const decRes = await app.inject({
        method: 'POST',
        url: '/api/v1/participant/decisions',
        payload: {
          sessionCode,
          participantId: p2.participantId,
          queueIndex: k,
          assignmentId: `assign-${k}`,
          decision: action,
          dwellTimeMs: 4000,
          idempotencyKey: `idem-p2-${k}`
        }
      });
      assert.equal(decRes.statusCode, 201);
    }

    // Verify Operator 2 is completed
    const final2 = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${p2.participantId}`
    });
    const finalData2 = JSON.parse(final2.payload);
    assert.equal(finalData2.isCompleted, true);
    assert.ok(finalData2.scoreSummary);
    assert.equal(finalData2.scoreSummary.catastrophicApprovalCount, 0);
    assert.ok(finalData2.scoreSummary.simulationOversightScore > 90.0);

    // 6. Presenter inspects dashboard BEFORE reveal:
    const presSummaryLocked = await app.inject({
      method: 'GET',
      url: `/api/v1/presenter/session/summary?sessionCode=${sessionCode}`
    });
    const presDataLocked = JSON.parse(presSummaryLocked.payload);
    assert.equal(presDataLocked.totalEnrolled, 2);
    assert.equal(presDataLocked.completedCount, 2);
    assert.equal(presDataLocked.conditionAMetrics, null, 'Must be masked before reveal');
    assert.equal(presDataLocked.conditionBMetrics, null, 'Must be masked before reveal');
    assert.equal(presDataLocked.overallMetrics.avgFocalCatchRate, null, 'Overall focal catch rate must be masked before reveal');
    assert.equal(presDataLocked.overallMetrics.avgContextCatchRate, null, 'Overall context catch rate must be masked before reveal');
    assert.equal(presDataLocked.participantsList[0].condition, 'MASKED', 'Participant condition must be masked before reveal');
    assert.equal(presDataLocked.participantsList[1].condition, 'MASKED', 'Participant condition must be masked before reveal');

    // 7. Presenter unlocks reveal
    const unlockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': TEST_SIM_PRESENTER_KEY },
      payload: { sessionCode, unlocked: true }
    });
    assert.equal(unlockRes.statusCode, 200);

    // 8. Presenter inspects dashboard AFTER reveal:
    const presSummaryUnlocked = await app.inject({
      method: 'GET',
      url: `/api/v1/presenter/session/summary?sessionCode=${sessionCode}`
    });
    const presDataUnlocked = JSON.parse(presSummaryUnlocked.payload);
    assert.ok(presDataUnlocked.conditionAMetrics);
    assert.ok(presDataUnlocked.conditionBMetrics);

    // Condition A (Complacent) had 0% catch rate on focal probes; Condition B had 100% catch rate!
    assert.equal(presDataUnlocked.conditionAMetrics.avgFocalCatchRate, 0.0);
    assert.equal(presDataUnlocked.conditionBMetrics.avgFocalCatchRate, 1.0);
    assert.equal(presDataUnlocked.conditionAMetrics.totalCatastrophicApprovals, 4);
    assert.equal(presDataUnlocked.conditionBMetrics.totalCatastrophicApprovals, 0);
  });
});
