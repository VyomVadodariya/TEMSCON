# AI Operations Control Center — Staged Implementation Plan & Quality Gates

## 1. Overview & Phasing Model

The **AI Operations Control Center (AIOCC)** implementation follows a strict **staged engineering workflow**:
$$\text{Architecture (Phase 0, 0.1 \& 0.2)} \longrightarrow \text{Core Backend \& Data (Phase 1)} \longrightarrow \text{Scenarios (Phase 2)} \longrightarrow \text{Participant Client (Phase 3)} \longrightarrow \text{Presenter Console (Phase 4)} \longrightarrow \text{Verification \& Load Test (Phase 5)}$$

No phase may begin until the preceding phase satisfies 100% of its **Exit Gate Criteria**.

---

## 2. Phase-by-Phase Roadmap & Completion Gates

### Phase 0, 0.1, 0.2, 0.3, 0.4 & 0.5: Specification, Remediation & Architecture Sign-Off *(Current Phase)*
- **Objective**: Establish complete, unambiguous, and mathematically rigorous specifications conforming to the Authorized Research Design (Option A), resolving throughput claims, exposure/position confounding, canonical scoring contracts, and exact sequence placement arithmetic.
- **Key Deliverables**:
  - `docs/ARCHITECTURE.md` (Audited: Realistic behavioral workload model 59–62 req/s sustained, distinct latency metrics, token-bucket burst capacity 350 tokens with $\ge 300\text{ tokens}$ planning target)
  - `docs/EXPERIMENT_DESIGN.md` (Audited: Identical absolute position matching for focal probes k=[9,21,33,45], canonical scoring contract v1.0.0, 8 worked examples)
  - `docs/DATABASE_DESIGN.md` (Audited: 30–80 check, Versioning, Tombstoning, SOS schema)
  - `docs/API_CONTRACT.md` (Audited: Parity API Schemas, scoringVersion, inappropriate escalation metrics)
  - `docs/SECURITY_AND_PRIVACY.md` (Audited: IRB-Ready, DTO Isolation, STRIDE)
  - `docs/TEST_STRATEGY.md` (Audited: SOS unit criteria, sequencer exact position verification, k6 load boundaries)
  - `docs/REQUIREMENTS_TRACEABILITY.md` (Audited: 24 Traceable Requirements with measurable criteria)
  - `docs/IMPLEMENTATION_PLAN.md` (Audited: Option A Gating)
  - `docs/PHASE_0_1_AUDIT.md` (Phase 0.1 / 0.2 Audit Record)
  - `docs/PHASE_0_4_FINAL_AUDIT.md` (Phase 0.4 Audit Record & Mathematical Proofs)
  - `docs/PHASE_0_5_CONSISTENCY_LOCK.md` (Comprehensive Phase 0.5 Final Consistency Lock & Sign-Off Record)
- **Exit Gate 0 / 0.5 (Sign-off Criteria)**:
  - All specification documents agree on **Option A**: `EXTENDED_REVIEW` vs `REDUCED_REVIEW`.
  - The independent variable is operationalized via the mathematically validated **Identical Absolute Position Matching Model** (Focal Probes occupy identical positions $k = [9, 21, 33, 45]$ in both Condition A where $L_{\text{local}} = 8 \ge 7$ and Condition B where $L_{\text{local}} = 1 \le 3$), strictly controlling for absolute sequence position ($k$) across focal probe comparisons, with residual confounding from context probe placement and dwell-time variation modeled via GLMM.
  - Strict UI parity enforced: **no condition-specific cognitive scaffolding**.
  - Default queue size agreed at **50 scored requests** (42 legitimate / escalatable, 8 probes) + **3 unscored practice requests**, partitioned into mutually exclusive request classes.
  - Scoring formula (Simulation Oversight Score) fully canonical (v1.0.0) and synchronized across all documents: dynamically sums maximum achievable points ($MaxScore = 2C + 3A + 6H + 8K_{\text{cat}}$), strictly clamps to $[0, 100]$, handles missing categories without unearned credit, deduplicates retries before calculating compounding catastrophic penalties, and passes all 6 hand-calculated examples plus boundary tests.
  - Realistic workload model recalculated: 200 participants completing 53 requests over 45–60 min yields $2.94 - 3.93\text{ fetches/sec}$, $2.94 - 3.93\text{ decisions/sec}$, $40.0\text{ telemetry POSTs/sec}$, $13.33\text{ heartbeats/sec}$, $59 - 62\text{ req/sec}$ sustained throughput, with token-bucket burst capacity budgeted at 350 tokens (planning target $\ge 300\text{ tokens}$ with refill rate $75\text{ tokens/s}$, absorbing the 253.33 req/s 1-second launch burst with safe headroom; provisional design target).
  - Zero production code, migrations, or application files written ahead of explicit approval.

---

### Phase 1: Core Backend Infrastructure & Database Persistence Engine
- **Objective**: Build the foundational Node.js/Fastify server, PostgreSQL database layer, connection pooling, seed-based sequence generator, and scoring engine.
- **Key Tasks**:
  1. Initialize TypeScript workspace with strict tsconfig.
  2. Implement Docker Compose for local PostgreSQL 16.
  3. Write database migration scripts (`001_initial_schema.sql`) matching audited `docs/DATABASE_DESIGN.md`.
  4. Implement Kysely query builders and type definitions.
  5. Implement Mulberry32 PRNG and sequence generator (`sequencer.service.ts`) producing 3 practice + 50 scored requests (42 legitimate / 8 probes) counterbalanced across 5 quintiles with condition-specific local run lengths ($L_{\text{local}}$).
  6. Implement server-side asymmetric scoring engine (`scoring.service.ts`) implementing the exact SOS formula, verified against all 6 hand-calculated examples.
  7. Implement Fastify server, error handling (RFC 7807), and route scaffolding.
- **Exit Gate 1 Criteria**:
  - `npm run test:unit` passes 100% of PRNG, sequencer, and scoring unit tests (including all 6 hand examples within $\pm 0.01$).
  - PostgreSQL schema successfully deploys via automated migration.
  - Seed script initializes admin account and sample cohort with `catalog_version: 'v1.0.0'` and `scoring_version: 'v1.0.0'`.
  - Idempotency test verifies zero duplicate inserts on identical keys.

---

### Phase 2: Scenario Authoring, Policy Validation & Catalog Toolchain
- **Objective**: Author and programmatically validate the catalog of $\ge 100$ reviewed synthetic enterprise operational templates across 5 domains.
- **Key Tasks**:
  1. Define TypeBox validation schemas for scenario authoring (`scenario.schema.ts`).
  2. Author $\ge 100$ reviewed templates in `server/src/data/scenarios/` ($\ge 75$ legitimate, $\ge 25$ matched critical probes across SecOps, FinOps, ITOps, DataOps, CustomerOps) plus 3 practice templates.
  3. Create automated validation CLI tool (`validate-scenarios.ts`) checking:
     - Exact compliance with authoring schema.
     - Accurate policy links to standard policy catalog.
     - Balanced distribution of matched probe dyads and difficulty tiers.
  4. Build server-side Ground Truth Scrubber ensuring client payloads strip all answers.
- **Exit Gate 2 Criteria**:
  - `npm run validate:scenarios` reports $\ge 100$ valid templates with 0 validation errors.
  - Statistical balance test verifies 42/8 ratio and uniform domain distribution across quintiles.
  - DTO scrubber test verifies 0% ground-truth leakage in client payload serialization.

---

### Phase 3: Participant Single Page Application (Client Cockpit)
- **Objective**: Build the unified high-fidelity browser operations cockpit for participants with strict UI parity across conditions.
- **Key Tasks**:
  1. Set up Vite + React 19 + TypeScript + Tailwind CSS application.
  2. Implement enterprise operations theme tokens (dark console aesthetic, high contrast, typography).
  3. Build shared unified layout: Header (session timer, queue progress), Summary Card, AI Rationale Viewer, Context Log Viewer, Payload Inspector, Policy Reference Drawer, Action Buttons (`[Approve]`, `[Reject]`, `[Escalate]`).
  4. Verify **strict UI parity**: No condition-specific cognitive scaffolding (no condition-specific checklists, diffs, or friction timers).
  5. Implement Practice Mode handler (3 unscored practice requests before scored phase).
  6. Implement Client Telemetry Collector (buffering, monotonic timestamps, batch flushing).
  7. Implement session reconnection & recovery via `sessionStorage` and `/session/state`.
- **Exit Gate 3 Criteria**:
  - Component unit tests pass for cockpit views.
  - Automated Playwright parity test verifies DOM elements are 100% identical between Condition A and Condition B sessions.
  - Reconnection test verifies page reload restores active scenario without state loss.
  - Zero ground-truth data visible in DOM or client bundle.

---

### Phase 4: Presenter Portal, Live Orchestration & Real-time Stream
- **Objective**: Build the authenticated Presenter / Admin console for cohort orchestration, live progress monitoring, and research data export.
- **Key Tasks**:
  1. Implement Admin authentication (Argon2id + JWT bearer tokens).
  2. Build Presenter Dashboard:
     - Cohort Creation Form (seed, 30–80 request count, catalog version, condition assignment).
     - Cohort Lifecycle Controls (`START`, `PAUSE`, `RESUME`, `TERMINATE`).
     - SSE Orchestration Hub: Broadcasting state transitions to connected participants.
  3. Build Live Monitoring Screen:
     - Real-time enrolled/active/completed/withdrawn participant counters.
     - Progress histogram and average decision latency stream.
     - Strict unblinding barrier (individual scenario correctness strictly hidden during active session).
  4. Implement Research Export Service (`/api/v1/admin/cohorts/:id/export`):
     - Unblinded dataset export in CSV and JSON formats, excluding withdrawn participants.
- **Exit Gate 4 Criteria**:
  - Admin login and route protections verified with JWT tests.
  - Pausing cohort in admin console triggers modal lock on all connected participant screens within 500ms.
  - Export generates valid CSV and JSON containing all decisions, timings, and calculated scores.

---

### Phase 5: Verification, Concurrency Load Testing & Evidence Package
- **Objective**: Execute multi-role E2E tests, run the 200-virtual-user concurrency load test according to explicit measurement boundaries, perform security audit, and produce final evidence artifacts.
- **Key Tasks**:
  1. Run full Playwright test suite covering complete participant journeys in EXTENDED_REVIEW and REDUCED_REVIEW.
  2. Execute k6 load test script simulating 200 concurrent participant agents over a 2-min warm-up and 10-min steady state:
     - Validate $p95\text{ API latency} < 100\text{ ms}$ on scenario fetch and decision submission.
     - Validate $p95\text{ DB transaction latency} < 50\text{ ms}$.
     - Validate $\ge 99.9\%$ decision submission success rate and $< 0.1\%$ 5xx error rate.
     - Verify database connection pool stability and 0 lost records.
  3. Perform security audit (CSP headers, CORS, SQL injection prevention, rate limiting).
  4. Generate release package and execution documentation.
- **Exit Gate 5 Criteria**:
  - Playwright E2E suite passes 100% across Chromium, Firefox, and WebKit.
  - k6 load test report confirms 200 concurrent users with 0 failures and $p95 < 100\text{ ms}$.
  - Requirements Traceability Matrix verified 100% complete with passing automated tests.

---

## 3. Risk Management & Contingency Plan

| Risk Description | Probability | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **High concurrency causes DB connection starvation** | Medium | High | Use Fastify connection pool capped at 25 connections; enforce statement timeouts ($5000\text{ ms}$); leverage in-memory caching for immutable scenario content. |
| **Participant drops connection mid-scenario** | High | Low | Robust reconnection endpoint restores scenario state based on server-side `presented_at` timestamp. |
| **Participant tampers with response times** | Low | High | Dual-timestamp validation flags discrepancies between client and server timing $> 5000\text{ ms}$. |
| **Presenter live stream leaks ground truth** | Low | Critical | Dedicated presenter metrics serializer explicitly excludes scenario correctness flags during live session. |
| **Participant exercises right to withdraw** | Low | Medium | Pseudonymous tombstoning wipes IP/user-agent metadata and excludes participant from research scoring without corrupting database integrity. |
