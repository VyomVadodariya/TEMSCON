import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/src/server.js';
import { FastifyInstance } from 'fastify';

describe('Security, Privacy & Experimental Integrity Tests', () => {
  let app: FastifyInstance;

  before(async () => {
    app = buildServer();
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

  it('Presenter Authorization: mutating endpoints require x-presenter-key header', async () => {
    // Attempt reveal without header -> should be 401
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      payload: { sessionCode: 'SEC-TEST', unlocked: true }
    });
    assert.equal(unauthRes.statusCode, 401, 'Mutating presenter endpoint without key must return 401');

    // Attempt reveal with valid key -> should be 200
    const authRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': process.env.PRESENTER_KEY || 'AIOCC_PRESENTER_SECRET_2026' },
      payload: { sessionCode: 'SEC-TEST', unlocked: true }
    });
    assert.equal(authRes.statusCode, 200, 'Valid presenter key must succeed');
  });

  it('Hypothesis Privacy: presenter summary masks condition disaggregation until reveal is unlocked', async () => {
    // Create new locked session
    await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/create',
      headers: { 'x-presenter-key': process.env.PRESENTER_KEY || 'AIOCC_PRESENTER_SECRET_2026' },
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
    assert.equal(lockedBody.participantsList[0].condition, 'MASKED', 'Participant condition must be masked when reveal is locked');

    // Unlock reveal
    await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': process.env.PRESENTER_KEY || 'AIOCC_PRESENTER_SECRET_2026' },
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
});
