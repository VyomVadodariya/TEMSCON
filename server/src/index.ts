import { buildServer } from './server.js';

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
