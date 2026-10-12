import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalSessionStore } from './services/sessionStore.js';
import { DecisionAction } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  presenterKey?: string;
  isProduction?: boolean;
}

export function buildServer(options?: ServerOptions) {
  const isProduction = options?.isProduction !== undefined
    ? options.isProduction
    : process.env.NODE_ENV === 'production';

  const presenterKey = options?.presenterKey !== undefined
    ? options.presenterKey
    : (process.env.PRESENTER_KEY || '');

  if (isProduction && (!presenterKey || presenterKey.trim() === '')) {
    throw new Error('FATAL SECURITY ERROR: PRESENTER_KEY environment variable is required in production. Application will not start without a configured presenter credential.');
  }

  const app = fastify({
    logger: false, // Clean console output for tests
    trustProxy: true
  });

  // Enable CORS for testing flexibility
  app.register(cors, { origin: true });

  // Serve static assets from public directory
  const publicPath = path.resolve(__dirname, '../../public');
  app.register(fastifyStatic, {
    root: publicPath,
    prefix: '/'
  });

  // Health check endpoint
  app.get('/health', async () => ({ status: 'UP', service: 'AIOCC-Backend', timestamp: Date.now() }));

  // ==========================================
  // PARTICIPANT ROUTES
  // ==========================================

  // Join Session
  app.post('/api/v1/participant/session/join', async (request, reply) => {
    const body = request.body as { sessionCode?: string; alias?: string };
    const sessionCode = body.sessionCode || 'DEMO-2026';
    const alias = body.alias || 'Operator';

    try {
      const { participant, session } = globalSessionStore.joinParticipant(sessionCode, alias);
      return reply.code(201).send({
        participantId: participant.id,
        alias: participant.alias,
        sessionCode: session.sessionCode,
        totalRequests: participant.totalRequests,
        practiceCount: participant.practiceCount,
        scoredCount: participant.scoredCount
      });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Get Current Scenario
  app.get('/api/v1/participant/session/current', async (request, reply) => {
    const query = request.query as { sessionCode?: string; participantId?: string };
    if (!query.sessionCode || !query.participantId) {
      return reply.code(400).send({ error: 'Missing sessionCode or participantId' });
    }

    try {
      const current = globalSessionStore.getCurrentScenario(query.sessionCode, query.participantId);
      return reply.send(current);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  });

  // Submit Decision (Server-Side Authoritative & Idempotent)
  app.post('/api/v1/participant/decisions', async (request, reply) => {
    const body = request.body as {
      sessionCode: string;
      participantId: string;
      queueIndex: number;
      assignmentId: string;
      decision: DecisionAction;
      dwellTimeMs?: number;
      idempotencyKey?: string;
    };

    if (!body.sessionCode || !body.participantId || !body.assignmentId || !body.decision) {
      return reply.code(400).send({ error: 'Missing required decision fields' });
    }

    const validActions: DecisionAction[] = ['APPROVE', 'REJECT', 'ESCALATE', 'TIMEOUT'];
    if (!validActions.includes(body.decision)) {
      return reply.code(400).send({ error: `Invalid action: ${body.decision}` });
    }

    try {
      const result = globalSessionStore.submitDecision({
        sessionId: body.sessionCode,
        sessionCode: body.sessionCode,
        participantId: body.participantId,
        queueIndex: body.queueIndex,
        assignmentId: body.assignmentId,
        decision: body.decision,
        dwellTimeMs: body.dwellTimeMs || 3000,
        clientTimestamp: Date.now(),
        idempotencyKey: body.idempotencyKey || `idem-${body.assignmentId}`
      } as any);

      return reply.code(result.isDuplicate ? 200 : 201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Participant Withdraw (IRB-mandated Tombstoning)
  app.post('/api/v1/participant/session/withdraw', async (request, reply) => {
    const body = request.body as { sessionCode: string; participantId: string };
    if (!body.sessionCode || !body.participantId) {
      return reply.code(400).send({ error: 'Missing sessionCode or participantId' });
    }
    const success = globalSessionStore.withdrawParticipant(body.sessionCode, body.participantId);
    return reply.send({ success, withdrawn: true });
  });

  // Telemetry Batch Ingestion
  app.post('/api/v1/participant/telemetry', async (request, reply) => {
    const body = request.body as { sessionCode: string; participantId: string; events?: any[] };
    return reply.send({ success: true, ingested: body.events ? body.events.length : 0 });
  });

  // Participant Heartbeat
  app.post('/api/v1/participant/heartbeat', async () => {
    return { status: 'ACTIVE', timestamp: Date.now() };
  });

  // ==========================================
  // PRESENTER / ADMIN ROUTES
  // ==========================================

  const verifyPresenterAuth = (request: any, reply: any): boolean => {
    if (!presenterKey || presenterKey.trim() === '') {
      reply.code(401).send({ error: 'Unauthorized: Presenter authentication is disabled because PRESENTER_KEY is not configured on this server.' });
      return false;
    }
    const rawHeader = request.headers['x-presenter-key'] || request.headers['authorization'];
    const key = typeof rawHeader === 'string' ? rawHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (!key || key !== presenterKey) {
      reply.code(401).send({ error: 'Unauthorized: Valid presenter key required' });
      return false;
    }
    return true;
  };

  // Create New Session (Presenter Protected)
  app.post('/api/v1/presenter/session/create', async (request, reply) => {
    if (!verifyPresenterAuth(request, reply)) return;

    const body = request.body as { sessionCode: string; scoredRequestCount?: number };
    if (!body.sessionCode) {
      return reply.code(400).send({ error: 'Session code is required' });
    }
    const count = body.scoredRequestCount || 50;
    if (count < 30 || count > 80) {
      return reply.code(400).send({ error: 'scoredRequestCount must be between 30 and 80' });
    }
    const session = globalSessionStore.createSession(body.sessionCode, count);
    return reply.code(201).send({
      sessionCode: session.sessionCode,
      status: session.status,
      scoredRequestCount: session.scoredRequestCount
    });
  });

  // Get Presenter Aggregate Summary (Public/Presenter Read)
  app.get('/api/v1/presenter/session/summary', async (request, reply) => {
    const query = request.query as { sessionCode?: string };
    const sessionCode = query.sessionCode || 'DEMO-2026';
    try {
      const summary = globalSessionStore.getPresenterSummary(sessionCode);
      return reply.send(summary);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  });

  // Toggle Educational Reveal (Presenter Protected)
  app.post('/api/v1/presenter/session/reveal', async (request, reply) => {
    if (!verifyPresenterAuth(request, reply)) return;

    const body = request.body as { sessionCode: string; unlocked: boolean };
    if (!body.sessionCode || typeof body.unlocked !== 'boolean') {
      return reply.code(400).send({ error: 'Missing sessionCode or unlocked boolean flag' });
    }
    const success = globalSessionStore.setRevealUnlocked(body.sessionCode, body.unlocked);
    return reply.send({ success, revealUnlocked: body.unlocked });
  });

  // Update Session Lifecycle Status (Presenter Protected)
  app.post('/api/v1/presenter/session/status', async (request, reply) => {
    if (!verifyPresenterAuth(request, reply)) return;

    const body = request.body as { sessionCode: string; status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CONCLUDED' };
    if (!body.sessionCode || !body.status) {
      return reply.code(400).send({ error: 'Missing sessionCode or status' });
    }
    const success = globalSessionStore.setSessionStatus(body.sessionCode, body.status);
    return reply.send({ success, status: body.status });
  });

  return app;
}
