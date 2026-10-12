import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer } from '../server/src/server.js';
import type { FastifyInstance } from 'fastify';

let fastifyApp: FastifyInstance | null = null;
let initPromise: Promise<FastifyInstance> | null = null;

export async function getFastifyApp(): Promise<FastifyInstance> {
  if (fastifyApp) return fastifyApp;
  if (!initPromise) {
    initPromise = (async () => {
      const app = buildServer();
      await app.ready();
      fastifyApp = app;
      return app;
    })();
  }
  return initPromise;
}

/**
 * Resolves the original requested URL before Vercel rewrites.
 * Handles:
 * 1. __path query parameter forwarded by vercel.json rewrite rules
 * 2. Vercel routing headers (x-matched-path, x-forwarded-url, x-original-url)
 * 3. Rewritten /api/index fallback to /health
 */
export function resolveOriginalUrl(req: IncomingMessage): string {
  const currentUrl = req.url || '/';

  // 1. Check if Vercel passed query parameter __path from rewrite rule
  try {
    const parsed = new URL(currentUrl, 'http://localhost');
    const pathParam = parsed.searchParams.get('__path');
    if (pathParam) {
      parsed.searchParams.delete('__path');
      const search = parsed.search; // preserves remaining query string e.g. "?sessionCode=DEMO-2026"
      return `${pathParam}${search}`;
    }
  } catch {
    // ignore URL parse errors and fall through
  }

  // 2. Check Vercel routing headers
  const matchedPath = (req.headers['x-matched-path'] as string) ||
                      (req.headers['x-forwarded-url'] as string) ||
                      (req.headers['x-original-url'] as string) ||
                      (req.headers['x-rewrite-url'] as string);

  if (matchedPath && matchedPath !== '/api/index' && matchedPath !== '/api') {
    // If matchedPath has no query string, but currentUrl does, preserve query string
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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  req.url = resolveOriginalUrl(req);
  const app = await getFastifyApp();
  app.server.emit('request', req, res);
}
