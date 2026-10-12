import http from 'k6/http';
import { check, sleep } from 'k6';

// ============================================================================
// AIOCC 200-PARTICIPANT DISTRIBUTED CONCURRENCY TARGET (PHASE 5 LOAD SPECIFICATION)
// Note: Provisional target pending empirical execution across real networks.
// ============================================================================

export const options = {
  stages: [
    { duration: '20s', target: 50 },   // Warm-up ramp
    { duration: '30s', target: 200 },  // Ramp to 200 concurrent operators
    { duration: '60s', target: 200 },  // Sustained 200-operator steady state
    { duration: '20s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Under 1% failures
    http_req_duration: ['p(95)<100'],  // 95% of requests under 100ms
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';
const SESSION_CODE = __ENV.SESSION_CODE || 'K6-COHORT-2026';

export function setup() {
  // Ensure health check passes before launching distributed load
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'Health check is 200 UP': (r) => r.status === 200,
  });
  return { startTime: Date.now() };
}

export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const alias = `Load-Op-VU${vuId}-Iter${iterId}`;

  // 1. Participant Join
  const joinPayload = JSON.stringify({
    sessionCode: SESSION_CODE,
    alias: alias,
  });

  const joinRes = http.post(`${BASE_URL}/api/v1/participant/session/join`, joinPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const joinOk = check(joinRes, {
    'Join status 201': (r) => r.status === 201,
    'Condition not leaked': (r) => JSON.parse(r.body).condition === undefined,
  });

  if (!joinOk) {
    sleep(1);
    return;
  }

  const { participantId } = JSON.parse(joinRes.body);

  // 2. Fetch current scenario
  const currRes = http.get(
    `${BASE_URL}/api/v1/participant/session/current?sessionCode=${SESSION_CODE}&participantId=${participantId}`
  );

  check(currRes, {
    'Fetch scenario 200': (r) => r.status === 200,
    'Ground truth scrubbed': (r) => {
      const b = JSON.parse(r.body);
      return b.queueItem.scenario.optimalAction === undefined;
    },
  });

  // 3. Submit decision
  const decisionPayload = JSON.stringify({
    sessionCode: SESSION_CODE,
    participantId: participantId,
    queueIndex: 1,
    assignmentId: 'assign-1',
    decision: 'APPROVE',
    dwellTimeMs: 2500,
  });

  const decRes = http.post(`${BASE_URL}/api/v1/participant/decisions`, decisionPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(decRes, {
    'Decision accepted 200 or 201': (r) => r.status === 201 || r.status === 200,
  });

  // 4. Operator think time / pacing
  sleep(1);
}
