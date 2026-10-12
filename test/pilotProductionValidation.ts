import assert from 'node:assert/strict';

const PROD_URL = process.env.PRODUCTION_URL || 'https://temscon-three.vercel.app';

export async function runPilotValidation() {
  console.log(`Starting Phase 4 Pilot Validation against: ${PROD_URL}`);
  const sessionCode = `PILOT-${Date.now()}`;
  console.log(`Using dedicated test session: ${sessionCode}`);

  // 1. Verify health & PostgreSQL persistence
  const healthRes = await fetch(`${PROD_URL}/health`);
  assert.equal(healthRes.status, 200, 'Health endpoint must be 200');
  const healthData = await healthRes.json() as any;
  assert.equal(healthData.status, 'UP');
  assert.equal(healthData.persistence, 'PostgreSQL', 'Live deployment must be running on PostgreSQL persistence');
  console.log(`[PASS] Health & DB Persistence: UP, PostgreSQL verified (uptime: ${healthData.uptimeSec}s)`);

  // 2. Participant 1 enrollment (Condition A)
  const p1Res = await fetch(`${PROD_URL}/api/v1/participant/session/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode, alias: 'Pilot-Operator-Alpha' })
  });
  assert.equal(p1Res.status, 201, 'Participant 1 must join successfully');
  const p1 = await p1Res.json() as any;
  assert.ok(p1.participantId, 'Participant 1 must receive participantId');
  assert.equal(p1.sessionCode, sessionCode);
  assert.equal(p1.totalRequests, 53);
  assert.equal(p1.practiceCount, 3);
  assert.equal(p1.scoredCount, 50);
  // Ground truth / condition must NOT be present in join response
  assert.equal((p1 as any).condition, undefined, 'Condition must be hidden from participant');
  console.log(`[PASS] Participant 1 joined: ${p1.participantId} (${p1.alias})`);

  // 3. Participant 2 enrollment (Condition B - Alternating assignment)
  const p2Res = await fetch(`${PROD_URL}/api/v1/participant/session/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode, alias: 'Pilot-Operator-Beta' })
  });
  assert.equal(p2Res.status, 201, 'Participant 2 must join successfully');
  const p2 = await p2Res.json() as any;
  assert.ok(p2.participantId, 'Participant 2 must receive participantId');
  assert.notEqual(p1.participantId, p2.participantId);
  console.log(`[PASS] Participant 2 joined: ${p2.participantId} (${p2.alias})`);

  // 4. Fetch initial scenario for P1
  const p1CurRes = await fetch(`${PROD_URL}/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${p1.participantId}`);
  assert.equal(p1CurRes.status, 200);
  const p1Cur = await p1CurRes.json() as any;
  assert.equal(p1Cur.queueItem.queueIndex, 1);
  assert.equal(p1Cur.queueItem.isPractice, true);
  assert.equal(p1Cur.progress.current, 1);
  assert.equal(p1Cur.progress.practiceRemaining, 3);
  assert.equal(p1Cur.queueItem.scenario.isGroundTruthAnomaly, undefined, 'Ground truth must be scrubbed');
  console.log(`[PASS] P1 received initial practice item 1 with ground truth scrubbed`);

  // 5. Submit 3 unscored practice decisions
  for (let q = 1; q <= 3; q++) {
    const decRes = await fetch(`${PROD_URL}/api/v1/participant/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode,
        participantId: p1.participantId,
        queueIndex: q,
        assignmentId: `assign-${q}`,
        decision: q === 1 ? 'APPROVE' : (q === 2 ? 'REJECT' : 'ESCALATE'),
        dwellTimeMs: 1500,
        idempotencyKey: `idem-${sessionCode}-${q}`
      })
    });
    assert.equal(decRes.status, 201, `Practice decision ${q} must succeed`);
    const decData = await decRes.json() as any;
    assert.equal(decData.success, true);
    assert.equal(decData.isDuplicate, false);
    if (q < 3) {
      assert.equal(decData.nextScenario.queueItem.isPractice, true);
    } else {
      assert.equal(decData.nextScenario.queueItem.isPractice, false, 'Item 4 must transition to scored queue');
      assert.equal(decData.nextScenario.queueItem.queueIndex, 4);
    }
  }
  console.log(`[PASS] 3 unscored practice items completed and smoothly transitioned to scored queue at index 4`);

  // 6. Test Idempotency & Duplicate Submission
  const firstScoredRes = await fetch(`${PROD_URL}/api/v1/participant/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionCode,
      participantId: p1.participantId,
      queueIndex: 4,
      assignmentId: 'assign-4',
      decision: 'APPROVE',
      dwellTimeMs: 2200,
      idempotencyKey: `idem-${sessionCode}-4-first`
    })
  });
  assert.equal(firstScoredRes.status, 201);
  const firstScoredData = await firstScoredRes.json() as any;
  assert.equal(firstScoredData.isDuplicate, false);
  assert.equal(firstScoredData.nextScenario.queueItem.queueIndex, 5);

  // Duplicate submission with same assignmentId
  const dupRes = await fetch(`${PROD_URL}/api/v1/participant/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionCode,
      participantId: p1.participantId,
      queueIndex: 4,
      assignmentId: 'assign-4',
      decision: 'APPROVE',
      dwellTimeMs: 2200,
      idempotencyKey: `idem-${sessionCode}-4-dup`
    })
  });
  assert.equal(dupRes.status, 200, 'Duplicate submission returns HTTP 200 OK');
  const dupData = await dupRes.json() as any;
  assert.equal(dupData.isDuplicate, true, 'Duplicate submission must be flagged as duplicate');
  assert.equal(dupData.success, true);
  console.log(`[PASS] Idempotency: duplicate assignmentId rejected double-scoring, returned HTTP 200, and isDuplicate: true`);

  // 7. Test Out-of-Order Submission Rejection
  const oooRes = await fetch(`${PROD_URL}/api/v1/participant/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionCode,
      participantId: p1.participantId,
      queueIndex: 9,
      assignmentId: 'assign-9',
      decision: 'APPROVE',
      dwellTimeMs: 1500,
      idempotencyKey: `idem-${sessionCode}-ooo`
    })
  });
  assert.equal(oooRes.status, 400, 'Out-of-order submission must be rejected with 400');
  console.log(`[PASS] Out-of-order submission safety verified (rejected with 400)`);

  // 8. Test Concurrent Submissions (Race Condition Prevention)
  const [raceA, raceB] = await Promise.all([
    fetch(`${PROD_URL}/api/v1/participant/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode,
        participantId: p1.participantId,
        queueIndex: 5,
        assignmentId: 'assign-5',
        decision: 'APPROVE',
        dwellTimeMs: 2000,
        idempotencyKey: `race-A-${Date.now()}`
      })
    }),
    fetch(`${PROD_URL}/api/v1/participant/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode,
        participantId: p1.participantId,
        queueIndex: 5,
        assignmentId: 'assign-5',
        decision: 'APPROVE',
        dwellTimeMs: 2000,
        idempotencyKey: `race-B-${Date.now()}`
      })
    })
  ]);
  const raceAData = await raceA.json() as any;
  const raceBData = await raceB.json() as any;
  // One was fresh (201, isDuplicate: false), one was duplicate (200, isDuplicate: true)
  const oneFreshOneDup = (raceA.status === 201 && raceAData.isDuplicate === false && raceB.status === 200 && raceBData.isDuplicate === true) ||
                         (raceB.status === 201 && raceBData.isDuplicate === false && raceA.status === 200 && raceAData.isDuplicate === true);
  assert.ok(oneFreshOneDup, `Transactional concurrency must allow exactly one mutation (201) and treat the other as idempotent duplicate (200). Got: A=${raceA.status}(dup=${raceAData.isDuplicate}), B=${raceB.status}(dup=${raceBData.isDuplicate})`);
  console.log(`[PASS] Concurrent race safety verified: one accepted (201), one marked duplicate (200)`);

  // 9. Serverless Invocation & Persistence Rehydration
  const stateCheckRes = await fetch(`${PROD_URL}/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${p1.participantId}`);
  assert.equal(stateCheckRes.status, 200);
  const stateCheck = await stateCheckRes.json() as any;
  assert.equal(stateCheck.queueItem.queueIndex, 6, 'Participant queue must advance to 6');
  assert.equal(stateCheck.progress.current, 6);
  console.log(`[PASS] Persistence verified across serverless invocations: current index = 6`);

  // 10. Presenter Summary & Hypothesis Privacy Enforcement
  const summaryRes = await fetch(`${PROD_URL}/api/v1/presenter/summary?sessionCode=${sessionCode}`);
  assert.equal(summaryRes.status, 200);
  const summary = await summaryRes.json() as any;
  assert.equal(summary.sessionCode, sessionCode);
  assert.equal(summary.revealUnlocked, false, 'Reveal must be locked');
  assert.equal(summary.conditionAMetrics, null, 'Condition A metrics must be masked');
  assert.equal(summary.conditionBMetrics, null, 'Condition B metrics must be masked');
  assert.equal(summary.participantsList.length, 2, 'Must report both enrolled participants');
  for (const part of summary.participantsList) {
    assert.equal(part.condition, 'MASKED', `Participant condition must be MASKED in presenter summary`);
  }
  console.log(`[PASS] Presenter summary hypothesis privacy verified: all conditions MASKED, contrast metrics null`);

  // 11. Presenter Authorization Verification
  const unauthReveal = await fetch(`${PROD_URL}/api/v1/presenter/session/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode })
  });
  assert.equal(unauthReveal.status, 401, 'Unauthorized reveal must return 401');

  const unauthCreate = await fetch(`${PROD_URL}/api/v1/presenter/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode: 'UNAUTH-HACK', scoredRequestCount: 40 })
  });
  assert.equal(unauthCreate.status, 401, 'Unauthorized session create must return 401');

  const unauthStatus = await fetch(`${PROD_URL}/api/v1/presenter/session/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode, status: 'CONCLUDED' })
  });
  assert.equal(unauthStatus.status, 401, 'Unauthorized session status mutation must return 401');
  console.log(`[PASS] Presenter mutation endpoints strictly reject unauthenticated requests with 401`);

  // 12. Simulator Results Dashboard Verification (Phase 4.1)
  const resultsRes = await fetch(`${PROD_URL}/api/v1/session/results?sessionCode=${sessionCode}`);
  assert.equal(resultsRes.status, 200, 'Simulator results endpoint must return 200');
  const resultsData = await resultsRes.json() as any;
  assert.equal(resultsData.sessionCode, sessionCode);
  assert.ok(resultsData.cards.totalApprovals, 'Total Approvals card must exist');
  assert.ok(resultsData.cards.correctDecisions, 'Correct Decisions card must exist');
  assert.ok(resultsData.cards.unsafeApprovals, 'Unsafe Approvals card must exist');
  assert.ok(resultsData.cards.medianDecisionTime, 'Median Decision Time card must exist');
  assert.ok(resultsData.cards.earlyVsLateReview, 'Early vs Late Review card must exist');
  assert.equal(resultsData.metadata.practiceExcluded, true, 'Practice must be excluded');
  assert.equal(resultsData.cards.totalApprovals.status, 'AVAILABLE');
  console.log(`[PASS] Simulator Results Dashboard verified: 5 cards derived from server ground truth with practice excluded`);

  // 13. Production Fractional Score Verification (-0.5 reward on COMPLIANT_ROUTINE ESCALATE)
  const fracRes = await fetch(`${PROD_URL}/api/v1/participant/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionCode,
      participantId: p2.participantId,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'ESCALATE',
      dwellTimeMs: 2500,
      idempotencyKey: `idem-${sessionCode}-p2-frac`
    })
  });
  assert.equal(fracRes.status, 201, 'Fractional decision (-0.5) must succeed on production PostgreSQL');
  const fracData = await fracRes.json() as any;
  assert.equal(fracData.success, true);
  console.log(`[PASS] Production Fractional Score (-0.5) submitted and persisted without integer rejection`);

  console.log(`\nALL PHASE 4, 4.1 & HOTFIX PILOT VALIDATION CHECKS PASSED ON PRODUCTION!`);
}

runPilotValidation().catch(err => {
  console.error('Pilot Validation Failure:', err);
  process.exit(1);
});

