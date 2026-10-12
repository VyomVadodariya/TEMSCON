# AI Operations Control Center — Test Strategy & Quality Assurance Plan

## 1. Quality Assurance Philosophy & Testing Pyramid

The **AI Operations Control Center (AIOCC)** serves a dual purpose: it is both an enterprise-grade web application and a rigorous scientific experimental instrument. Consequently, the test strategy enforces both software engineering correctness and experimental reproducibility.

```
                  / \
                 /   \
                / E2E \       Playwright: Participant Cockpit & Presenter Journeys
               / Concur\      k6: 200 Virtual Users Target Load Verification
              /---------\
             / Integrat. \    Vitest + PostgreSQL: DB, APIs, Idempotency, SSE
            /-------------\
           /   Unit Tests  \  Vitest: PRNG, Scorer, Seeded Sequencer, DTO Scrubbing
          /-----------------\
```

> [!IMPORTANT]
> **Provisional Design Target Notice**: Per Non-Negotiable Rule 8, the 200-participant concurrency target and $p95 < 100\text{ ms}$ latency budget are **unverified architectural design targets**. No benchmark results or completion claims are asserted in this specification phase. Capacity and latency figures will be established strictly through the execution of the Phase 5 k6 load testing suite against a staged environment.

---

## 2. Test Suites & Verification Levels

### 2.1 Level 1: Unit Testing (Vitest)
Unit tests execute in memory with sub-second feedback.

| Target Component | Test Suite File | Key Invariants & Definitive Acceptance Criteria |
| :--- | :--- | :--- |
| **Deterministic PRNG** | `tests/unit/prng.test.ts` | **Pass Criteria**: Mulberry32 generates identical sequence for seed `424242` across 10,000 draws; output strictly bounded in $[0, 1)$; Chi-square test confirms uniform distribution ($p > 0.05$). |
| **Seeded Sequencer & Exposure Balancer** | `tests/unit/sequencer.test.ts` | **Pass Criteria**:<br/>1. Generates exactly 3 practice requests (`PRAC-01..03`).<br/>2. For default 50 scored requests: generates exactly 42 legitimate requests and 8 matched critical probes distributed across all 5 quintiles ($Q_1..Q_5$ each have 1–2 probes).<br/>3. Identical Absolute Position Matching: In both conditions, the 4 Focal Probes occupy positions `k = [9, 21, 33, 45]`. In Condition A (`EXTENDED_REVIEW`), Focal Probes satisfy $L_{\text{local}} = 8$ (tolerance band $7 - 9$). In Condition B (`REDUCED_REVIEW`), Focal Probes satisfy $L_{\text{local}} = 1$ (tolerance band $1 - 3$) due to preceding context probes.<br/>4. Mathematical Invariant: Asserts $\sum L_{\text{local}} + r_{\text{trailing}} = 42$; rejects any sequence violating queue constraints.<br/>5. Re-running identical seed yields identical scenario order.<br/>6. For configurable $K \in [30, 80]$, generates valid sequence with proportional probe density. |
| **Simulation Oversight Score (SOS) Engine** | `tests/unit/scoring.test.ts` | **Pass Criteria**:<br/>1. Canonical Action Matrix: Compliant (Approve +2, Reject -2, Escalate -0.5, Timeout -1); Ambiguous (Approve +1, Reject 0, Escalate +3, Timeout -1); High-Risk (Approve -6, Reject +6, Escalate +4, Timeout +1); Catastrophic (Approve -12, Reject +8, Escalate +5, Timeout +1).<br/>2. Compounding catastrophic penalty: $P_{\text{cat}}(M) = 10.0 \times (M - 1)^{1.5}$ applies strictly for unique catastrophic approvals $M \ge 2$; $P_{\text{cat}} = 0.0$ for $M \le 1$.<br/>3. Practice requests yield exactly 0 scored points.<br/>4. Dynamically calculates $MaxScore = 2\cdot C + 3\cdot A + 6\cdot H + 8\cdot K_{\text{cat}}$ across assigned scenarios ($140.0$ for baseline 42/0/4/4; $146.0$ for mixed 36/6/4/4).<br/>5. All worked examples compute to exact verified values: Ex 1 (Flawless)=100.00; Ex 2 (Blind Approver)=0.00; Ex 3 (Severe Complacency)=16.23; Ex 4 (Moderate Complacency)=75.00; Ex 5 (Hyper-Vigilant)=58.93; Ex 6 (Standard Mixed)=96.92.<br/>6. Boundary cases: All-timeout session computes to 0.00 (clamped, raw -34.0); 80-item queue computes to 100.00; negative raw clamps to 0.00; zero denominator returns null. |
| **Ground-Truth Scrubber** | `tests/unit/scrubber.test.ts` | **Pass Criteria**: Serializing database scenario entities through client DTO produces JSON payloads with 0 occurrences of `groundTruth`, `isCompliant`, `expectedAction`, or `scoringWeight`. |
| **Scenario Catalog Validator**| `tests/unit/scenario-catalog.test.ts` | **Pass Criteria**: Validates all $\ge 100$ templates in `scenarios.json` against TypeBox schema; asserts $\ge 75$ legitimate templates, $\ge 25$ critical probes, and 3 practice templates. |

---

### 2.2 Level 2: API & Database Integration Testing (Vitest + PostgreSQL)
Executes against an isolated PostgreSQL container.

| Target Flow | Test Suite File | Verification Mechanism & Acceptance Criteria |
| :--- | :--- | :--- |
| **Participant Registration & Queue Generation** | `tests/integration/registration.test.ts` | **Pass Criteria**: Cohort enrollment creates participant record with balanced condition (`EXTENDED_REVIEW` or `REDUCED_REVIEW`), exactly 3 practice assignments, and 50 scored assignments ordered sequentially. |
| **Session Reconnection** | `tests/integration/session-state.test.ts` | **Pass Criteria**: Simulating page reload via `GET /session/state` returns active assignment, correct sequence index, and remaining server-calculated elapsed time. |
| **Idempotency & Race Conditions** | `tests/integration/idempotency.test.ts` | **Pass Criteria**: 10 concurrent HTTP POST requests with identical `Idempotency-Key` yield exactly one `201 Created` and nine `200 OK` responses; exactly one row exists in `decision_events`. |
| **Telemetry Ingestion** | `tests/integration/telemetry.test.ts` | **Pass Criteria**: Batch POST of 50 interaction events inserts all 50 rows into `telemetry_events` within 50ms without lock contention. |
| **Participant Withdrawal** | `tests/integration/withdrawal.test.ts` | **Pass Criteria**: `POST /session/withdraw` flags participant as `WITHDRAWN`, wipes IP and user-agent metadata to `'EXPUNGED'`, and excludes participant from score aggregations. |

---

### 2.3 Level 3: End-to-End (E2E) Browser Testing (Playwright)
Executes full multi-role browser journeys across Chromium, Firefox, and WebKit.

1. **Operations Cockpit Parity Journey (Both Conditions)**:
   - Participant registers and completes 3 practice requests.
   - Advances to scored sequence: verifies identical cockpit interface (summary, AI confidence bar, context logs, policy drawer, action buttons).
   - Verifies **zero condition-specific UI widgets**: checklist, diffs, and friction timers do not exist in either condition.
   - Completes 50 requests $\rightarrow$ renders debrief screen with confirmation code.
2. **Presenter Real-time Orchestration Flow**:
   - Presenter creates cohort with seed `987654` and scenario count `50`.
   - Presenter toggles cohort `START` $\rightarrow$ participant screens transition from waiting state to active queue within 500ms via SSE.
   - Presenter toggles `PAUSE` $\rightarrow$ modal overlay locks participant inputs.
   - Presenter completes cohort $\rightarrow$ exports unblinded scientific CSV/JSON dataset.

---

### 2.4 Level 4: Concurrency & Load Testing (k6 Simulation Target)

> [!NOTE]
> This test is executed as the primary gating criterion of Phase 5 to validate the 200-concurrent-participant target.

#### 2.4.1 Explicit Measurement Boundaries & Target Budgets
| Metric Category | Specific Metric | Measurement Boundary | Target Budget | Pass/Fail Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **API Latency** | Scenario Fetch Latency ($p95$) | Gateway ingress to egress on `GET /queue/current` | $< 100\text{ ms}$ | $p95 < 100\text{ ms}$ |
| **API Latency** | Decision Submission Latency ($p95$) | Gateway ingress to egress on `POST /decisions` | $< 100\text{ ms}$ | $p95 < 100\text{ ms}$ |
| **Database Latency** | Transaction Latency ($p95$) | PostgreSQL `BEGIN` to `COMMIT` on decision insert | $< 50\text{ ms}$ | $p95 < 50\text{ ms}$ |
| **Throughput & Reliability** | Decision Submission Success Rate | Successful HTTP 200/201 responses | $100\%$ | $\ge 99.9\%$ |
| **Throughput & Reliability** | Error and Timeout Rate | 5xx responses or client timeouts ($> 5000\text{ ms}$) | $0\%$ | $< 0.1\%$ |
| **Presenter Stream** | Live-Update Latency ($p95$) | Participant DB commit to Presenter WS broadcast | $< 500\text{ ms}$ | $p95 < 500\text{ ms}$ |
| **Integrity** | End-to-End Completion Reliability | 200 VUs completing 53 requests without lost rows | $100\%$ | Exactly $200 / 200$ completed sessions |

#### 2.4.2 Test Protocol & Workload Execution Specification
- **Staged Environment**: Deployed via Docker Compose on a standardized 4-core, 8 GB RAM host running Node.js Fastify and PostgreSQL 16 on an isolated virtual network bridge.
- **Warm-Up Duration**: 2-minute linear ramp-up from 0 to 200 Virtual Users (VUs).
- **Steady-State Measurement Duration**: 10 minutes sustained at 200 concurrent VUs executing realistic randomized dwell times ($30 - 60\text{ s}$).
- **Cooldown Duration**: 1-minute ramp-down.

```javascript
// tests/load/k6-concurrency-test.js specification
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '2m', target: 200 },  // 2-minute warm-up ramp
    { duration: '10m', target: 200 }, // 10-minute steady-state measurement
    { duration: '1m', target: 0 },    // 1-minute cooldown ramp-down
  ],
  thresholds: {
    'http_req_duration{endpoint:queue_current}': ['p(95)<100'],
    'http_req_duration{endpoint:decisions}': ['p(95)<100'],
    'http_req_failed': ['rate<0.001'],
  },
};

export default function () {
  const BASE_URL = 'http://localhost:4000/api/v1';
  
  // 1. Participant Init
  const initRes = http.post(`${BASE_URL}/participant/session/init`, JSON.stringify({
    cohortCode: 'LOAD-TEST-200',
    pseudonym: `VU_${__VU}`
  }), { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'session_init' } });
  
  check(initRes, { 'init success': (r) => r.status === 201 });
  const token = initRes.json('sessionToken');
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Iterate through requests
  for (let i = 0; i < 10; i++) {
    const currentRes = http.get(`${BASE_URL}/participant/queue/current`, { 
      headers: authHeaders, 
      tags: { endpoint: 'queue_current' } 
    });
    check(currentRes, { 'fetch scenario success': (r) => r.status === 200 });
    const assignmentId = currentRes.json('assignmentId');

    // Simulate reading dwell time (jittered 30-50s)
    sleep(Math.random() * 20 + 30);

    // Send telemetry batch
    http.post(`${BASE_URL}/participant/telemetry/batch`, JSON.stringify({
      assignmentId: assignmentId,
      events: [{ eventType: 'SCROLL_LOGS', clientEpochMs: Date.now(), payload: { pos: 150 } }]
    }), { headers: authHeaders, tags: { endpoint: 'telemetry_batch' } });

    // Submit decision
    const decisionRes = http.post(`${BASE_URL}/participant/decisions`, JSON.stringify({
      assignmentId: assignmentId,
      decision: 'APPROVE',
      confidenceLevel: 4,
      rationale: 'Verified under policy guidelines.',
      timeToFirstActionMs: 12000,
      totalDecisionTimeMs: 38000,
      clientEpochMs: Date.now()
    }), {
      headers: {
        ...authHeaders,
        'Idempotency-Key': uuidv4()
      },
      tags: { endpoint: 'decisions' }
    });
    check(decisionRes, { 'decision recorded': (r) => r.status === 201 });

    sleep(1);
  }
}
```

---

## 3. Scientific Validity & Statistical Calibration Tests

1. **Balance & Uniformity Test (`tests/scientific/balance.test.ts`)**:
   - Executes 1,000 simulated cohort runs across randomized master seeds.
   - Confirms that for every 50-scenario sequence, exactly **42 legitimate requests** and **8 matched critical probes** are assigned across all 5 quintiles.
   - Asserts that all 5 operational domains are represented with Chi-Square goodness-of-fit $p > 0.95$.
2. **Double-Blind Unblinding Test (`tests/scientific/unblinding.test.ts`)**:
   - Asserts that the presenter metrics endpoint `/api/v1/admin/cohorts/:id/metrics` exposes zero per-scenario correctness flags while cohort status is `ACTIVE`.

---

## 4. Continuous Integration & Quality Gates

```
[ Gate 1: Type & Lint ]   --> tsc --noEmit && eslint .
[ Gate 2: Unit Tests ]     --> vitest run tests/unit/
[ Gate 3: Integration ]    --> vitest run tests/integration/
[ Gate 4: E2E Tests ]      --> playwright test tests/e2e/
[ Gate 5: Load Validation] --> k6 run tests/load/k6-concurrency-test.js
```
Any failure at any stage halts the delivery pipeline.
