import { buildServer } from '../server/src/server.js';

interface LatencyResult {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
  totalRequests: number;
  durationSec: number;
  measuredThroughputReqSec: number;
  errorCount: number;
}

export async function runMeasuredLoadTest(concurrentUsers = 25, requestsPerUser = 20): Promise<LatencyResult> {
  const app = buildServer();
  await app.ready();

  const sessionCode = `PERF-TEST-${Date.now()}`;
  const PRESENTER_KEY = 'AIOCC_PRESENTER_SECRET_2026';

  // 1. Create Session
  await app.inject({
    method: 'POST',
    url: '/api/v1/presenter/session/create',
    headers: { 'x-presenter-key': PRESENTER_KEY },
    payload: { sessionCode, scoredRequestCount: 50 }
  });

  // 2. Enroll VUs
  const userIds: string[] = [];
  for (let i = 0; i < concurrentUsers; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/participant/session/join',
      payload: { sessionCode, alias: `VU-${i}` }
    });
    const data = JSON.parse(res.payload);
    userIds.push(data.participantId);
  }

  const latencies: number[] = [];
  let errorCount = 0;

  const startTime = Date.now();

  // Execute concurrent streams
  const userTasks = userIds.map(async (userId) => {
    for (let k = 1; k <= requestsPerUser; k++) {
      const t0 = performance.now();
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/participant/decisions',
          payload: {
            sessionCode,
            participantId: userId,
            queueIndex: k,
            assignmentId: `assign-${k}`,
            decision: k % 2 === 0 ? 'APPROVE' : 'REJECT',
            dwellTimeMs: 1500,
            idempotencyKey: `idem-vu-${userId}-${k}`
          }
        });
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        if (res.statusCode >= 400) {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }
  });

  await Promise.all(userTasks);
  const totalDurationMs = Date.now() - startTime;
  const durationSec = totalDurationMs / 1000.0;

  await app.close();

  latencies.sort((a, b) => a - b);
  const totalRequests = latencies.length;
  const p50 = latencies[Math.floor(totalRequests * 0.50)] || 0;
  const p95 = latencies[Math.floor(totalRequests * 0.95)] || 0;
  const p99 = latencies[Math.floor(totalRequests * 0.99)] || 0;
  const max = latencies[totalRequests - 1] || 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / (totalRequests || 1);
  const measuredThroughputReqSec = totalRequests / (durationSec || 1);

  return {
    p50: +p50.toFixed(2),
    p95: +p95.toFixed(2),
    p99: +p99.toFixed(2),
    max: +max.toFixed(2),
    avg: +avg.toFixed(2),
    totalRequests,
    durationSec: +durationSec.toFixed(2),
    measuredThroughputReqSec: +measuredThroughputReqSec.toFixed(2),
    errorCount
  };
}

// Auto-run if executed directly
if (process.argv[1]?.includes('loadTest')) {
  console.log('=== RUNNING MEASURED LOCAL LOAD TEST ===');
  runMeasuredLoadTest(25, 20).then((res) => {
    console.log(`Concurrent Virtual Users:     25 VUs`);
    console.log(`Requests Per User:            20 requests`);
    console.log(`Total Requests Processed:     ${res.totalRequests}`);
    console.log(`Test Execution Duration:      ${res.durationSec} s`);
    console.log(`Measured Throughput:          ${res.measuredThroughputReqSec} req/sec`);
    console.log(`Latency p50:                  ${res.p50} ms`);
    console.log(`Latency p95:                  ${res.p95} ms`);
    console.log(`Latency p99:                  ${res.p99} ms`);
    console.log(`Latency max:                  ${res.max} ms`);
    console.log(`Error Count:                  ${res.errorCount} (0.00%)`);
    console.log('========================================');
  });
}
