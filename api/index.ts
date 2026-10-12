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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getFastifyApp();
  app.server.emit('request', req, res);
}
