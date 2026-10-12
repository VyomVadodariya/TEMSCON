import { buildServer } from './server.js';
const isProduction = process.env.NODE_ENV === 'production';
const configuredPresenterKey = process.env.PRESENTER_KEY || '';

if (!configuredPresenterKey) {
  if (isProduction) {
    console.error('FATAL: PRESENTER_KEY environment variable is required in production mode. Refusing to start.');
    process.exit(1);
  } else {
    console.warn('[SECURITY NOTICE] PRESENTER_KEY environment variable is not set. Presenter actions will fail closed (401 Unauthorized) until a key is configured.');
  }
}

const server = buildServer();
const PORT = Number(process.env.PORT) || 3000;

server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Failed to start AIOCC server:', err);
    process.exit(1);
  }
  console.log(`\n================================================================`);
  console.log(`  AI OPERATIONS CONTROL CENTER (AIOCC) PLATFORM RUNNING`);
  console.log(`  URL:                   ${address}`);
  console.log(`  Participant Interface: ${address}/`);
  console.log(`  Presenter Interface:   ${address}/#presenter`);
  console.log(`================================================================\n`);
});
