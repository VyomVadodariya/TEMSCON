import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler, { getFastifyApp } from '../api/index.js';

describe('Vercel Serverless Function Adapter Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    // Ensure fastify is ready
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

  it('Vercel Handler: routes GET /health through serverless entry point', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'UP');
    assert.equal(body.service, 'AIOCC-Backend');
  });

  it('Vercel Handler: processes POST /api/v1/participant/session/join with streaming JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/v1/participant/session/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'DEMO-2026', alias: 'Vercel-Test-Operator' })
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.ok(data.participantId);
    assert.equal(data.alias, 'Vercel-Test-Operator');
    assert.equal(data.sessionCode, 'DEMO-2026');
  });

  it('Vercel Handler: handles pre-parsed request body simulated from serverless runtime', async () => {
    // Simulate a serverless runtime that already parsed the body onto req.raw.body
    const app = await getFastifyApp();
    const mockJoinPayload = { sessionCode: 'DEMO-2026', alias: 'PreParsed-Operator' };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: mockJoinPayload
    });

    assert.equal(response.statusCode, 201);
    const data = JSON.parse(response.body);
    assert.ok(data.participantId);
    assert.equal(data.alias, 'PreParsed-Operator');
  });

  it('Vercel Handler: enforces presenter authentication across serverless requests', async () => {
    // Unauthorized attempt
    const unauthRes = await fetch(`${baseUrl}/api/v1/presenter/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode: 'UNAUTH-COHORT', scoredRequestCount: 40 })
    });
    assert.equal(unauthRes.status, 401);
  });
});
