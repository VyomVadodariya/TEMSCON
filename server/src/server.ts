import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalSessionStore, SessionStore } from './services/sessionStore.js';
import { PostgresSessionStore } from './services/postgresSessionStore.js';
import { DecisionAction, ISessionStore } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  presenterKey?: string;
  isProduction?: boolean;
  corsOrigin?: string | string[];
  sessionStore?: ISessionStore;
  rateLimitEnabled?: boolean;
  databaseUrl?: string;
}

/**
 * Resolves the original requested URL before Vercel proxy rewrites.
 * Used by Fastify's native rewriteUrl option and serverless adapters.
 */
export function resolveOriginalUrl(req: { url?: string; headers: Record<string, any> }): string {
  const currentUrl = req.url || '/';

  // 1. Check if Vercel passed query parameter __path from rewrite rule
  try {
    const parsed = new URL(currentUrl, 'http://localhost');
    const pathParam = parsed.searchParams.get('__path');
    if (pathParam) {
      parsed.searchParams.delete('__path');
      parsed.searchParams.delete('match'); // Strip Vercel wildcard artifact
      const search = parsed.search; // preserves remaining query string e.g. "?sessionCode=DEMO-2026"
      return `${pathParam}${search}`;
    }
  } catch {
    // ignore URL parse errors and fall through
  }

  // 2. Check Vercel/proxy routing headers
  const matchedPath = (req.headers['x-matched-path'] as string) ||
                      (req.headers['x-forwarded-url'] as string) ||
                      (req.headers['x-original-url'] as string) ||
                      (req.headers['x-rewrite-url'] as string);

  if (matchedPath && matchedPath !== '/api/index' && matchedPath !== '/api') {
    if (!matchedPath.includes('?') && currentUrl.includes('?')) {
      const search = currentUrl.slice(currentUrl.indexOf('?'));
      return `${matchedPath}${search}`;
    }
    return matchedPath;
  }

  // 3. Fallback: If Vercel rewrote /health or root to bare /api/index without params
  if (currentUrl === '/api/index' || currentUrl === '/api' || currentUrl === '/api/') {
    return '/health';
  }

  return currentUrl;
}

export function buildServer(options?: ServerOptions) {
  const isVercel = process.env.VERCEL === '1';
  const isProduction = options?.isProduction !== undefined
    ? options.isProduction
    : (process.env.NODE_ENV === 'production' || isVercel);

  const presenterKey = options?.presenterKey !== undefined
    ? options.presenterKey
    : (process.env.PRESENTER_KEY || '');

  if (isProduction && (!presenterKey || presenterKey.trim() === '')) {
    throw new Error('FATAL SECURITY ERROR: PRESENTER_KEY environment variable is required in production. Application will not start without a configured presenter credential.');
  }

  const databaseUrl = options?.databaseUrl || process.env.DATABASE_URL;

  let sessionStore: ISessionStore;
  if (options?.sessionStore) {
    sessionStore = options.sessionStore;
  } else if (databaseUrl) {
    sessionStore = new PostgresSessionStore({ connectionString: databaseUrl });
  } else if (isProduction || isVercel) {
    throw new Error('FATAL PERSISTENCE ERROR: DATABASE_URL environment variable is required in production on Vercel. Serverless environments cannot use ephemeral local file storage. Please configure a managed PostgreSQL database connection URL.');
  } else {
    sessionStore = globalSessionStore;
  }

  const app = fastify({
    logger: false, // Clean console output for tests
    trustProxy: true,
    rewriteUrl: (req) => resolveOriginalUrl(req)
  });

  // Support both standard Node streaming and serverless pre-parsed JSON bodies
  app.addContentTypeParser('application/json', {}, (request, payload, done) => {
    const rawReq = request.raw as any;
    if (rawReq.body && typeof rawReq.body === 'object') {
      return done(null, rawReq.body);
    }
    if (typeof rawReq.body === 'string') {
      try {
        return done(null, JSON.parse(rawReq.body));
      } catch (err: any) {
        return done(err, undefined);
      }
    }
    let data = '';
    payload.on('data', chunk => { data += chunk; });
    payload.on('end', () => {
      try {
        const parsed = data ? JSON.parse(data) : {};
        done(null, parsed);
      } catch (err: any) {
        done(err, undefined);
      }
    });
  });

  // Gateway Token Bucket Rate Limiting (Phase 0.5 Spec: Burst B=350, Refill r=75 tokens/s)
  // In serverless environments (Vercel), this operates per function instance.
  const rateLimitEnabled = options?.rateLimitEnabled !== false;
  if (rateLimitEnabled) {
    interface TokenBucket {
      tokens: number;
      lastRefill: number;
    }
    const tokenBuckets = new Map<string, TokenBucket>();
    const B_BURST = 350;
    const R_REFILL = 75; // tokens/second

    app.addHook('onRequest', async (request, reply) => {
      // Rate limit API endpoints; static assets and health check are exempt
      if (request.url.startsWith('/api/')) {
        const ip = request.ip || '127.0.0.1';
        const now = Date.now();
        let bucket = tokenBuckets.get(ip);
        if (!bucket) {
          bucket = { tokens: B_BURST - 1, lastRefill: now };
          tokenBuckets.set(ip, bucket);
        } else {
          const elapsedSec = (now - bucket.lastRefill) / 1000;
          bucket.tokens = Math.min(B_BURST, bucket.tokens + elapsedSec * R_REFILL);
          bucket.lastRefill = now;
          if (bucket.tokens < 1) {
            reply.header('Retry-After', '1');
            return reply.code(429).send({ error: 'Too Many Requests: Rate limit exceeded. Please throttle requests.' });
          }
          bucket.tokens -= 1;
        }
      }
    });
  }

  // Automatic schema migrations & store initialization hook
  app.addHook('onReady', async () => {
    if (sessionStore.init) {
      await sessionStore.init();
    }
  });

  // CORS Configuration
  const configuredCors = options?.corsOrigin || process.env.CORS_ORIGIN;
  const originSetting = (isProduction && configuredCors)
    ? (typeof configuredCors === 'string' ? configuredCors.split(',').map(s => s.trim()) : configuredCors)
    : true;
  app.register(cors, { origin: originSetting });

  // Serve static assets from public directory (for local node and standalone docker)
  const publicPath = path.resolve(__dirname, '../../public');
  app.register(fastifyStatic, {
    root: publicPath,
    prefix: '/'
  });

  // Health check endpoint (accessible via /health, /api/health, and serverless /api/index)
  const healthHandler = async () => ({
    status: 'UP',
    service: 'AIOCC-Backend',
    persistence: databaseUrl ? 'PostgreSQL' : 'File/Memory',
    uptimeSec: Math.floor(process.uptime()),
    timestamp: Date.now()
  });

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/api/index', healthHandler);

  // ==========================================
  // PARTICIPANT ROUTES
  // ==========================================

  // Join Session
  app.post('/api/v1/participant/session/join', async (request, reply) => {
    const body = request.body as { sessionCode?: string; alias?: string };
    const sessionCode = body.sessionCode || 'DEMO-2026';
    const alias = body.alias || 'Operator';

    try {
      const { participant, session } = await sessionStore.joinParticipant(sessionCode, alias);
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
      const current = await sessionStore.getCurrentScenario(query.sessionCode, query.participantId);
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
      const result = await sessionStore.submitDecision({
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
    const success = await sessionStore.withdrawParticipant(body.sessionCode, body.participantId);
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
    const session = await sessionStore.createSession(body.sessionCode, count);
    return reply.code(201).send({
      sessionCode: session.sessionCode,
      status: session.status,
      scoredRequestCount: session.scoredRequestCount
    });
  });

  // Presenter Summary Handler (Dual Route: /session/summary and /summary)
  const handlePresenterSummary = async (request: any, reply: any) => {
    const query = request.query as { sessionCode?: string };
    const sessionCode = query.sessionCode || 'DEMO-2026';
    try {
      const summary = await sessionStore.getPresenterSummary(sessionCode);
      return reply.send(summary);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  };

  app.get('/api/v1/presenter/session/summary', handlePresenterSummary);
  app.get('/api/v1/presenter/summary', handlePresenterSummary);

  // Simulator Results Dashboard Handler (Public Aggregate Activity Results)
  const handleSimulatorResults = async (request: any, reply: any) => {
    const query = request.query as { sessionCode?: string };
    const sessionCode = query.sessionCode || 'DEMO-2026';
    try {
      const results = await sessionStore.getSimulatorResults(sessionCode);
      return reply.send(results);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  };

  app.get('/api/v1/session/results', handleSimulatorResults);
  app.get('/api/v1/results', handleSimulatorResults);
  app.get('/api/v1/presenter/session/results', handleSimulatorResults);

  // Toggle Educational Reveal (Presenter Protected)
  app.post('/api/v1/presenter/session/reveal', async (request, reply) => {
    if (!verifyPresenterAuth(request, reply)) return;

    const body = request.body as { sessionCode: string; unlocked: boolean };
    if (!body.sessionCode || typeof body.unlocked !== 'boolean') {
      return reply.code(400).send({ error: 'Missing sessionCode or unlocked boolean flag' });
    }
    const success = await sessionStore.setRevealUnlocked(body.sessionCode, body.unlocked);
    return reply.send({ success, revealUnlocked: body.unlocked });
  });

  // Update Session Lifecycle Status (Presenter Protected)
  app.post('/api/v1/presenter/session/status', async (request, reply) => {
    if (!verifyPresenterAuth(request, reply)) return;

    const body = request.body as { sessionCode: string; status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CONCLUDED' };
    if (!body.sessionCode || !body.status) {
      return reply.code(400).send({ error: 'Missing sessionCode or status' });
    }
    const success = await sessionStore.setSessionStatus(body.sessionCode, body.status);
    return reply.send({ success, status: body.status });
  });

  return app;
}
