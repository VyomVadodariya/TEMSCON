import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PRESENTER_KEY = process.env.PRESENTER_KEY || 'smoke-presenter-token-9988';

async function runDeploymentSmokeTest() {
  console.log(`\n=== RUNNING DEPLOYMENT & PRODUCTION SMOKE TEST ===`);
  console.log(`Target URL: ${BASE_URL}`);

  // 1. Health Endpoint
  console.log('1. Checking GET /health...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert.equal(healthRes.status, 200, 'Health endpoint must return 200');
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'UP');
  assert.equal(healthData.service, 'AIOCC-Backend');
  console.log('   -> PASS: Server is UP, uptime:', healthData.uptimeSec, 's');

  // 2. Static Asset Delivery
  console.log('2. Checking Static Assets (SPA Bundle)...');
  const indexRes = await fetch(`${BASE_URL}/`);
  assert.equal(indexRes.status, 200);
  const html = await indexRes.text();
  assert.ok(html.includes('AI Operations Control Center'), 'HTML title verification');
  assert.ok(html.includes('id="conditions-contrast-locked-banner"'), 'Locked banner must be in HTML');
  assert.ok(html.includes('class="conditions-contrast-grid hidden"'), 'Contrast grid must be hidden by default');
  console.log('   -> PASS: HTML served with masked hypothesis structure');

  const cssRes = await fetch(`${BASE_URL}/css/styles.css`);
  assert.equal(cssRes.status, 200);
  const css = await cssRes.text();
  assert.ok(css.includes('.hidden'), '.hidden class must be in CSS');

  const jsRes = await fetch(`${BASE_URL}/js/app.js`);
  assert.equal(jsRes.status, 200);
  const js = await jsRes.text();
  assert.ok(!js.includes('AIOCC_PRESENTER_SECRET_2026'), 'Client JS must not contain hardcoded secret');
  console.log('   -> PASS: Static assets verified, zero hardcoded secrets in bundle');

  // 3. Presenter Protected Endpoints Fail Closed without Key
  console.log('3. Checking Presenter Authorization & Fail-Closed Behavior...');
  const unauthRes = await fetch(`${BASE_URL}/api/v1/presenter/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode: 'SMOKE-COHORT' })
  });
  assert.equal(unauthRes.status, 401, 'Must reject unauthenticated presenter requests');

  const badKeyRes = await fetch(`${BASE_URL}/api/v1/presenter/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-presenter-key': 'WRONG_KEY_12345'
    },
    body: JSON.stringify({ sessionCode: 'SMOKE-COHORT' })
  });
  assert.equal(badKeyRes.status, 401, 'Must reject invalid presenter key');

  // Create session with valid presenter key
  const authRes = await fetch(`${BASE_URL}/api/v1/presenter/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-presenter-key': PRESENTER_KEY
    },
    body: JSON.stringify({ sessionCode: 'SMOKE-COHORT', scoredRequestCount: 50 })
  });
  assert.equal(authRes.status, 201, 'Valid presenter key must succeed in session creation');
  console.log('   -> PASS: Presenter mutating routes strictly protected by x-presenter-key');

  // 4. Participant Join and Workflow
  console.log('4. Checking Participant Enrollment & Workflow...');
  const joinRes1 = await fetch(`${BASE_URL}/api/v1/participant/session/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode: 'SMOKE-COHORT', alias: 'Operator-Smoke-1' })
  });
  assert.equal(joinRes1.status, 201);
  const part1 = await joinRes1.json();
  assert.equal(part1.condition, undefined, 'Join response must not leak experimental condition');
  assert.equal(part1.totalRequests, 53, 'Default queue is 3 practice + 50 scored = 53 total');

  // Enroll second participant (balanced assignment)
  const joinRes2 = await fetch(`${BASE_URL}/api/v1/participant/session/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode: 'SMOKE-COHORT', alias: 'Operator-Smoke-2' })
  });
  assert.equal(joinRes2.status, 201);
  const part2 = await joinRes2.json();

  // Participant queries current scenario
  const currRes = await fetch(
    `${BASE_URL}/api/v1/participant/session/current?sessionCode=SMOKE-COHORT&participantId=${part1.participantId}`
  );
  assert.equal(currRes.status, 200);
  const currData = await currRes.json();
  assert.equal(currData.queueItem.scenario.optimalAction, undefined, 'Ground truth must be scrubbed');
  assert.equal(currData.queueItem.scenario.isProbe, undefined, 'Probe flag must be scrubbed');
  assert.equal(currData.queueItem.isPractice, true, 'Item 1 is practice');
  console.log('   -> PASS: Scenario scrubbed, practice mode active');

  // Participant submits decisions for practice items 1, 2, 3
  for (let idx = 1; idx <= 3; idx++) {
    const decRes = await fetch(`${BASE_URL}/api/v1/participant/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode: 'SMOKE-COHORT',
        participantId: part1.participantId,
        queueIndex: idx,
        assignmentId: `assign-${idx}`,
        decision: 'APPROVE',
        dwellTimeMs: 1500
      })
    });
    assert.ok(decRes.status === 200 || decRes.status === 201);
  }

  // Idempotency check: repeat assignment 3
  const dupRes = await fetch(`${BASE_URL}/api/v1/participant/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionCode: 'SMOKE-COHORT',
      participantId: part1.participantId,
      queueIndex: 3,
      assignmentId: 'assign-3',
      decision: 'APPROVE',
      dwellTimeMs: 1500
    })
  });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.equal(dupData.isDuplicate, true, 'Duplicate assignment must return isDuplicate: true');
  console.log('   -> PASS: Idempotency deduplication verified');

  // 5. Presenter Summary and Hypothesis Privacy
  console.log('5. Checking Hypothesis Privacy before Reveal...');
  const presResLocked = await fetch(`${BASE_URL}/api/v1/presenter/session/summary?sessionCode=SMOKE-COHORT`);
  assert.equal(presResLocked.status, 200);
  const presDataLocked = await presResLocked.json();
  assert.equal(presDataLocked.revealUnlocked, false);
  assert.equal(presDataLocked.conditionAMetrics, null, 'Condition A metrics must be masked');
  assert.equal(presDataLocked.conditionBMetrics, null, 'Condition B metrics must be masked');
  assert.equal(presDataLocked.overallMetrics.avgFocalCatchRate, null, 'Overall focal catch rate must be masked');
  assert.equal(presDataLocked.participantsList[0].condition, 'MASKED');
  assert.equal(presDataLocked.participantsList[1].condition, 'MASKED');
  console.log('   -> PASS: Hypothesis privacy strictly maintained');

  // 6. Presenter Unlocks Reveal
  console.log('6. Unlocking Educational Reveal...');
  const revealRes = await fetch(`${BASE_URL}/api/v1/presenter/session/reveal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-presenter-key': PRESENTER_KEY
    },
    body: JSON.stringify({ sessionCode: 'SMOKE-COHORT', unlocked: true })
  });
  assert.equal(revealRes.status, 200);

  const presResUnlocked = await fetch(`${BASE_URL}/api/v1/presenter/session/summary?sessionCode=SMOKE-COHORT`);
  const presDataUnlocked = await presResUnlocked.json();
  assert.equal(presDataUnlocked.revealUnlocked, true);
  assert.ok(presDataUnlocked.conditionAMetrics, 'Condition A metrics unmasked');
  assert.ok(presDataUnlocked.conditionBMetrics, 'Condition B metrics unmasked');
  assert.notEqual(presDataUnlocked.participantsList[0].condition, 'MASKED');
  console.log('   -> PASS: Debrief unlocked, condition metrics exposed correctly');

  console.log(`=== DEPLOYMENT SMOKE TEST SUCCESSFUL ===\n`);
  return { success: true };
}

runDeploymentSmokeTest().catch((err) => {
  console.error('\nSMOKE TEST FAILED:', err);
  process.exit(1);
});
