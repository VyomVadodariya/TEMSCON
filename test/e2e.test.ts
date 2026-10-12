import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/src/server.js';
import { FastifyInstance } from 'fastify';

describe('AIOCC End-to-End API Integration Suite', () => {
  let app: FastifyInstance;

  before(async () => {
    app = buildServer();
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('GET /health returns 200 UP', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'UP');
  });

  it('POST /api/v1/participant/session/join enrolls participant with balanced condition without leaking condition to client', async () => {
    // Join Participant 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'E2E-TEST', alias: 'Operator-Alpha' }
    });
    assert.equal(res1.statusCode, 201);
    const body1 = JSON.parse(res1.payload);
    assert.ok(body1.participantId);
    assert.equal(body1.alias, 'Operator-Alpha');
    assert.equal(body1.condition, undefined, 'Client must not receive condition metadata');
    assert.equal(body1.totalRequests, 53); // 3 practice + 50 scored

    // Join Participant 2
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'E2E-TEST', alias: 'Operator-Beta' }
    });
    assert.equal(res2.statusCode, 201);
    const body2 = JSON.parse(res2.payload);
    assert.equal(body2.condition, undefined);
  });

  it('GET /api/v1/participant/session/current returns scrubbed scenario and correct progress', async () => {
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'E2E-TEST', alias: 'Operator-Gamma' }
    });
    const joinBody = JSON.parse(joinRes.payload);

    const currRes = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/session/current?sessionCode=E2E-TEST&participantId=${joinBody.participantId}`
    });
    assert.equal(currRes.statusCode, 200);
    const currBody = JSON.parse(currRes.payload);

    assert.equal(currBody.isCompleted, false);
    assert.equal(currBody.progress.current, 1);
    assert.equal(currBody.progress.practiceRemaining, 3);
    assert.equal(currBody.queueItem.isPractice, true);

    // Verify ground-truth answers are strictly scrubbed
    assert.equal(currBody.queueItem.scenario.optimalAction, undefined);
    assert.equal(currBody.queueItem.scenario.policyNotes, undefined);
  });

  it('POST /api/v1/participant/decisions handles decisions and enforces idempotency', async () => {
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode: 'E2E-TEST', alias: 'Operator-Delta' }
    });
    const { participantId } = JSON.parse(joinRes.payload);

    // Submit Decision 1
    const subRes1 = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/decisions',
      payload: {
        sessionCode: 'E2E-TEST',
        participantId,
        queueIndex: 1,
        assignmentId: 'assign-1',
        decision: 'APPROVE',
        dwellTimeMs: 4200,
        idempotencyKey: 'key-assign-1'
      }
    });
    assert.equal(subRes1.statusCode, 201);
    const subBody1 = JSON.parse(subRes1.payload);
    assert.equal(subBody1.success, true);
    assert.equal(subBody1.isDuplicate, false);
    assert.equal(subBody1.nextScenario.progress.current, 2);

    // Retry Decision 1 with same assignmentId (Idempotent replay)
    const subResRetry = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/decisions',
      payload: {
        sessionCode: 'E2E-TEST',
        participantId,
        queueIndex: 1,
        assignmentId: 'assign-1',
        decision: 'APPROVE',
        dwellTimeMs: 4200,
        idempotencyKey: 'key-assign-1'
      }
    });
    assert.equal(subResRetry.statusCode, 200); // 200 OK for idempotent duplicate
    const subBodyRetry = JSON.parse(subResRetry.payload);
    assert.equal(subBodyRetry.isDuplicate, true);
  });

  it('Presenter Workflow: create session, aggregate summary, reveal control', async () => {
    const PRESENTER_KEY = 'AIOCC_PRESENTER_SECRET_2026';

    // 1. Create Session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/create',
      headers: { 'x-presenter-key': PRESENTER_KEY },
      payload: { sessionCode: 'COHORT-88', scoredRequestCount: 40 }
    });
    assert.equal(createRes.statusCode, 201);
    const createBody = JSON.parse(createRes.payload);
    assert.equal(createBody.sessionCode, 'COHORT-88');
    assert.equal(createBody.scoredRequestCount, 40);

    // 2. Fetch Summary
    const sumRes = await app.inject({
      method: 'GET',
      url: '/api/v1/presenter/session/summary?sessionCode=COHORT-88'
    });
    assert.equal(sumRes.statusCode, 200);
    const sumBody = JSON.parse(sumRes.payload);
    assert.equal(sumBody.sessionCode, 'COHORT-88');
    assert.equal(sumBody.revealUnlocked, false);

    // 3. Unlock Reveal
    const revRes = await app.inject({
      method: 'POST',
      url: '/api/v1/presenter/session/reveal',
      headers: { 'x-presenter-key': PRESENTER_KEY },
      payload: { sessionCode: 'COHORT-88', unlocked: true }
    });
    assert.equal(revRes.statusCode, 200);
    const revBody = JSON.parse(revRes.payload);
    assert.equal(revBody.revealUnlocked, true);
  });
});
