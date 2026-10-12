import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../server/src/server.js';
import { FastifyInstance } from 'fastify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Security, Privacy & Experimental Integrity Tests', () => {
  let app: FastifyInstance;
  const TEST_SEC_PRESENTER_KEY = 'test-security-suite-token-8921';

  before(async () => {
    app = buildServer({ presenterKey: TEST_SEC_PRESENTER_KEY });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('Scrubbing: participant current scenario payload scrubs ground truth, probe flags, and class', async () => {
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'SEC-TEST', alias: 'Operator-Sec' }
    });
    const joinBody = JSON.parse(joinRes.payload);

    // Participant join should NOT leak assigned condition
    assert.equal(joinBody.condition, undefined, 'Participant join response must not leak assigned experimental condition');

    const currRes = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/session/current?sessionCode=SEC-TEST&participantId=${joinBody.participantId}`
    });
    const currBody = JSON.parse(currRes.payload);
    const sc = currBody.queueItem.scenario;

    // Ground truth and probe metadata must be scrubbed
    assert.equal(sc.optimalAction, undefined, 'optimalAction must be scrubbed');
    assert.equal(sc.policyNotes, undefined, 'policyNotes must be scrubbed');
    assert.equal(sc.isProbe, undefined, 'isProbe must be scrubbed');
    assert.equal(sc.probeType, undefined, 'probeType must be scrubbed');
    assert.equal(sc.dyadId, undefined, 'dyadId must be scrubbed');
    assert.equal(sc.scenarioClass, undefined, 'scenarioClass must be scrubbed');
  });

  it('Presenter Authorization: mutating endpoints require valid x-presenter-key and reject invalid keys', async () => {
    // Attempt reveal without header -> should be 401
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      payload: { sessionCode: 'SEC-TEST', unlocked: true }
    });
    assert.equal(unauthRes.statusCode, 401, 'Mutating presenter endpoint without key must return 401');

    // Attempt reveal with old deprecated fixture literal -> should be 401
    const oldKeyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': 'AIOCC_PRESENTER_SECRET_2026' },
      payload: { sessionCode: 'SEC-TEST', unlocked: true }
    });
    assert.equal(oldKeyRes.statusCode, 401, 'Deprecated hardcoded key literal must be rejected when not configured');

    // Attempt reveal with valid key -> should be 200
    const authRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': TEST_SEC_PRESENTER_KEY },
      payload: { sessionCode: 'SEC-TEST', unlocked: true }
    });
    assert.equal(authRes.statusCode, 200, 'Valid presenter key must succeed');
  });

  it('Presenter Credential: fail closed when PRESENTER_KEY is not configured or in production mode without key', async () => {
    // 1. Unconfigured server fails closed for mutating presenter operations
    const unconfiguredApp = buildServer({ presenterKey: '' });
    await unconfiguredApp.ready();

    const failClosedRes = await unconfiguredApp.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/create',
      headers: { 'x-presenter-key': 'any-token' },
      payload: { sessionCode: 'FAIL-CLOSED-TEST', scoredRequestCount: 50 }
    });
    assert.equal(failClosedRes.statusCode, 401, 'Unconfigured server must fail closed with 401');
    const errBody = JSON.parse(failClosedRes.payload);
    assert.match(errBody.error, /disabled because PRESENTER_KEY is not configured/i);

    await unconfiguredApp.close();

    // 2. Production startup throws fatal error when key is empty
    assert.throws(
      () => buildServer({ presenterKey: '', isProduction: true }),
      /FATAL SECURITY ERROR: PRESENTER_KEY environment variable is required in production/
    );
  });

  it('Hypothesis Privacy: presenter summary masks condition disaggregation and probe rates until reveal is unlocked', async () => {
    // Create new locked session
    await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/create',
      headers: { 'x-presenter-key': TEST_SEC_PRESENTER_KEY },
      payload: { sessionCode: 'MASK-TEST', scoredRequestCount: 50 }
    });

    // Enroll participant
    await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'MASK-TEST', alias: 'Operator-Mask' }
    });

    // Summary while locked
    const lockedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/presenter/session/summary?sessionCode=MASK-TEST'
    });
    const lockedBody = JSON.parse(lockedRes.payload);

    assert.equal(lockedBody.revealUnlocked, false);
    assert.equal(lockedBody.conditionAMetrics, null, 'Condition A metrics must be masked when reveal is locked');
    assert.equal(lockedBody.conditionBMetrics, null, 'Condition B metrics must be masked when reveal is locked');
    assert.equal(lockedBody.overallMetrics.avgFocalCatchRate, null, 'Overall focal catch rate must be masked when reveal is locked');
    assert.equal(lockedBody.overallMetrics.avgContextCatchRate, null, 'Overall context catch rate must be masked when reveal is locked');
    assert.equal(lockedBody.participantsList[0].condition, 'MASKED', 'Participant condition must be masked when reveal is locked');

    // Concluding the session without unlocking reveal must STILL preserve hypothesis privacy
    await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/status',
      headers: { 'x-presenter-key': TEST_SEC_PRESENTER_KEY },
      payload: { sessionCode: 'MASK-TEST', status: 'CONCLUDED' }
    });

    const concludedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/presenter/session/summary?sessionCode=MASK-TEST'
    });
    const concludedBody = JSON.parse(concludedRes.payload);
    assert.equal(concludedBody.revealUnlocked, false);
    assert.equal(concludedBody.conditionAMetrics, null, 'Concluded session must not leak Condition A metrics before reveal');
    assert.equal(concludedBody.conditionBMetrics, null, 'Concluded session must not leak Condition B metrics before reveal');
    assert.equal(concludedBody.overallMetrics.avgFocalCatchRate, null, 'Concluded session must not leak focal catch rate before reveal');
    assert.equal(concludedBody.participantsList[0].condition, 'MASKED', 'Concluded session must not unmask participant condition before reveal');

    // Explicitly unlock reveal
    await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': TEST_SEC_PRESENTER_KEY },
      payload: { sessionCode: 'MASK-TEST', unlocked: true }
    });

    // Summary after unlock
    const unmaskedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/presenter/session/summary?sessionCode=MASK-TEST'
    });
    const unmaskedBody = JSON.parse(unmaskedRes.payload);
    assert.equal(unmaskedBody.revealUnlocked, true);
    assert.ok(unmaskedBody.conditionAMetrics, 'Condition A metrics unmasked after reveal unlock');
    assert.ok(unmaskedBody.conditionBMetrics, 'Condition B metrics unmasked after reveal unlock');
    assert.notEqual(unmaskedBody.overallMetrics.avgFocalCatchRate, null);
    assert.notEqual(unmaskedBody.participantsList[0].condition, 'MASKED');
  });

  it('Input Validation: rejects decision submissions with sequence mismatch', async () => {
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'INPUT-VAL', alias: 'Operator-Val' }
    });
    const { participantId } = JSON.parse(joinRes.payload);

    // Participant is currently on queueIndex 1. Sending queueIndex 10 must fail!
    const badSeqRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/decisions',
      payload: {
        sessionCode: 'INPUT-VAL',
        participantId,
        queueIndex: 10,
        assignmentId: 'assign-10',
        decision: 'APPROVE',
        dwellTimeMs: 2500
      }
    });
    assert.equal(badSeqRes.statusCode, 400, 'Mismatched sequence index must return 400');
    const errBody = JSON.parse(badSeqRes.payload);
    assert.match(errBody.error, /Sequence mismatch/i);
  });

  it('UI & Client Hardening: verifies index.html and app.js enforce hypothesis privacy and lack hardcoded secrets', () => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    const jsPath = path.resolve(__dirname, '../public/js/app.js');
    const cssPath = path.resolve(__dirname, '../public/css/styles.css');

    const htmlContent = readFileSync(htmlPath, 'utf8');
    const jsContent = readFileSync(jsPath, 'utf8');
    const cssContent = readFileSync(cssPath, 'utf8');

    // 1. Contrast cards must have id conditions-contrast-grid and class hidden by default
    assert.match(htmlContent, /id="conditions-contrast-grid"[^>]*class="[^"]*hidden[^"]*"/);

    // 2. Locked banner placeholder must exist
    assert.match(htmlContent, /id="conditions-contrast-locked-banner"/);

    // 3. Presenter key authorization input must exist
    assert.match(htmlContent, /id="presenter-auth-key-input"/);

    // 4. .hidden class must be explicitly defined in styles.css
    assert.match(cssContent, /\.hidden\s*\{[^}]*display:\s*none\s*!important/);

    // 5. No hardcoded AIOCC_PRESENTER_SECRET_2026 literal in client code
    assert.doesNotMatch(htmlContent, /AIOCC_PRESENTER_SECRET_2026/);
    assert.doesNotMatch(jsContent, /AIOCC_PRESENTER_SECRET_2026/);
  });

  it('Gateway Rate Limiting: throttles requests exceeding token-bucket capacity and exempts health and static routes', async () => {
    const rateLimitedApp = buildServer({ presenterKey: 'test-rate-limit-token', rateLimitEnabled: true });
    await rateLimitedApp.ready();

    // Health route is exempt from token bucket rate limiting
    const healthRes = await rateLimitedApp.inject({ method: 'GET', url: '/health' });
    assert.equal(healthRes.statusCode, 200);

    // Exhaust 350-token burst capacity on API route
    let throttled = false;
    for (let i = 0; i < 355; i++) {
      const res = await rateLimitedApp.inject({
        method: 'POST',
        url: '/api/v1/participant/heartbeat'
      });
      if (res.statusCode === 429) {
        throttled = true;
        assert.ok(res.headers['retry-after'], 'Retry-After header must be set on 429 response');
        break;
      }
    }
    assert.ok(throttled, 'Exceeding token bucket burst capacity must trigger 429 Too Many Requests');

    await rateLimitedApp.close();
  });
});
