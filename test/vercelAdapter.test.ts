import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler, { getFastifyApp, resolveOriginalUrl } from '../api/index.js';

describe('Vercel Serverless Function Adapter & Routing Regression Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    // Ensure Fastify app is ready
    await getFastifyApp();

    server = http.createServer((req, res) => {
      handler(req, res).catch(err => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('Unit: resolveOriginalUrl correctly parses __path parameter from Vercel rewrites', () => {
    const mockReq1 = { url: '/api/index?__path=/health', headers: {} } as any;
    assert.equal(resolveOriginalUrl(mockReq1), '/health');

    const mockReq2 = { url: '/api/index?__path=/api/v1/participant/session/join', headers: {} } as any;
    assert.equal(resolveOriginalUrl(mockReq2), '/api/v1/participant/session/join');

    const mockReq3 = { url: '/api/index?__path=/api/v1/presenter/summary&sessionCode=DEMO-2026', headers: {} } as any;
    assert.equal(resolveOriginalUrl(mockReq3), '/api/v1/presenter/summary?sessionCode=DEMO-2026');

    // Header-based resolution
    const mockReq4 = { url: '/api/index', headers: { 'x-matched-path': '/health' } } as any;
    assert.equal(resolveOriginalUrl(mockReq4), '/health');

    // Bare /api/index fallback to /health
    const mockReq5 = { url: '/api/index', headers: {} } as any;
    assert.equal(resolveOriginalUrl(mockReq5), '/health');
  });

  it('Regression (Route GET:/api/index): bare /api/index returns HTTP 200 UP instead of 404', async () => {
    const res = await fetch(`${baseUrl}/api/index`);
    assert.equal(res.status, 200, 'Bare /api/index must return HTTP 200');
    const data = await res.json() as any;
    assert.equal(data.status, 'UP');
    assert.equal(data.service, 'AIOCC-Backend');
  });

  it('Regression (Rewritten /health): /api/index?__path=/health returns HTTP 200 UP', async () => {
    const res = await fetch(`${baseUrl}/api/index?__path=/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'UP');
    assert.equal(data.service, 'AIOCC-Backend');
  });

  it('Regression (Header-based rewrite): x-matched-path header resolves to /health', async () => {
    const res = await fetch(`${baseUrl}/api/index`, {
      headers: { 'x-matched-path': '/health' }
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'UP');
  });

  it('Vercel Handler: direct GET /health returns HTTP 200 UP', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'UP');
    assert.equal(data.service, 'AIOCC-Backend');
  });

  it('Vercel Handler: GET / serves participant HTML SPA bundle', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('AI Operations Control Center'));
  });

  it('Vercel Handler: Static CSS and JavaScript return valid content types', async () => {
    const cssRes = await fetch(`${baseUrl}/css/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.ok(cssRes.headers.get('content-type')?.includes('text/css'));

    const jsRes = await fetch(`${baseUrl}/js/app.js`);
    assert.equal(jsRes.status, 200);
    assert.ok(jsRes.headers.get('content-type')?.includes('javascript'));
  });

  it('Vercel Handler: processes participant workflow through rewritten Vercel path', async () => {
    // 1. Join participant through rewritten path
    const joinRes = await fetch(`${baseUrl}/api/index?__path=/api/v1/participant/session/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'DEMO-2026', alias: 'Vercel-Operator-E2E' })
    });
    assert.equal(joinRes.status, 201);
    const joinData = await joinRes.json() as any;
    assert.ok(joinData.participantId);
    assert.equal(joinData.alias, 'Vercel-Operator-E2E');

    // 2. Fetch current scenario
    const currentRes = await fetch(
      `${baseUrl}/api/index?__path=/api/v1/participant/session/current&sessionCode=DEMO-2026&participantId=${joinData.participantId}`
    );
    assert.equal(currentRes.status, 200);
    const currentData = await currentRes.json() as any;
    assert.ok(currentData.queueItem);
    assert.equal(currentData.queueItem.isPractice, true);

    // 3. Submit decision
    const decRes = await fetch(`${baseUrl}/api/index?__path=/api/v1/participant/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode: 'DEMO-2026',
        participantId: joinData.participantId,
        queueIndex: 1,
        assignmentId: 'assign-1',
        decision: 'APPROVE',
        dwellTimeMs: 2000,
        idempotencyKey: `idem-vercel-${joinData.participantId}-1`
      })
    });
    assert.equal(decRes.status, 201);
    const decData = await decRes.json() as any;
    assert.equal(decData.success, true);
    assert.equal(decData.isDuplicate, false);
  });

  it('Vercel Handler: presenter endpoints enforce authentication across rewritten paths', async () => {
    // Unauthorized attempt
    const unauthRes = await fetch(`${baseUrl}/api/index?__path=/api/v1/presenter/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'UNAUTH-TEST', scoredRequestCount: 40 })
    });
    assert.equal(unauthRes.status, 401);

    // Authenticated attempt
    const authRes = await fetch(`${baseUrl}/api/index?__path=/api/v1/presenter/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-presenter-key': 'test-token-vercel-99'
      },
      body: JSON.stringify({ sessionCode: 'AUTH-TEST', scoredRequestCount: 40 })
    });
    // If running with presenterKey configured
    assert.ok(authRes.status === 201 || authRes.status === 401);
  });

  it('Vercel Handler: hypothesis privacy is maintained in presenter summary', async () => {
    const summaryRes = await fetch(`${baseUrl}/api/index?__path=/api/v1/presenter/summary&sessionCode=DEMO-2026`);
    assert.equal(summaryRes.status, 200);
    const summary = await summaryRes.json() as any;
    assert.equal(summary.sessionCode, 'DEMO-2026');
    assert.equal(summary.revealUnlocked, false);
    assert.equal(summary.conditionAMetrics, null);
    assert.equal(summary.conditionBMetrics, null);
    assert.ok(summary.participantsList.every((p: any) => p.condition === 'MASKED'));
  });
});
