# AI Operations Control Center (AIOCC)

An enterprise simulation and experimental research platform designed to measure human-in-the-loop oversight effectiveness and automation complacency in high-stakes operational environments.

---

## 1. Executive Summary & Research Foundation

When human operators supervise autonomous artificial intelligence systems, routine compliance often induces **automation complacency**—a cognitive failure state where operators passively rubber-stamp recommendations rather than actively verifying policy compliance.

AIOCC implements the rigorously validated **Option A Research Design**:
- **Condition A (`EXTENDED_REVIEW`)**: Operators evaluate matched focal probes after long uninterrupted runs of compliant routine tasks ($L_{\text{local}} = 8 \ge 7$), inducing behavioral habituation.
- **Condition B (`REDUCED_REVIEW`)**: Operators evaluate matched focal probes immediately after recent vigilance reset probes ($L_{\text{local}} = 1 \le 3$), restoring active scrutiny.
- **Identical User Interface**: Strict UI parity across conditions. Zero condition-specific warnings, scaffolding, or highlighting.
- **Matched Sequence Position**: Focal probes are placed at identical absolute sequence positions ($k = [9, 21, 33, 45]$) in both conditions, controlling ordinal queue position and completed task count as direct between-condition confounds.
- **Practice Phase**: 3 initial unscored onboarding requests familiarize participants with the interface before the 50 scored requests begin.
- **Canonical Scoring Contract (v1.0.0)**: Dynamic theoretical maximum ($MaxScore = 2C + 3A + 6H + 8K_{\text{cat}}$), discrete action rewards (+2 compliant approval, +3 ambiguous escalation, +6 high-risk rejection, +8 catastrophic rejection, -12 catastrophic approval), compounding catastrophic miss penalties ($P_{\text{cat}}(M) = 10(M-1)^{1.5}$ for $M \ge 2$), and clamped Simulation Oversight Score ($SOS \in [0.0, 100.0]$).

> **Note on Performance Targets**: The 200-concurrent-participant capacity and $<100\text{ ms}$ latency targets remain explicitly designated as provisional design targets pending empirical validation during Phase 5 load testing.

---

## 2. Architecture & Technical Stack

- **Runtime**: Node.js (v20+ LTS / v24 LTS)
- **Language**: TypeScript 5.7+ (Strict Mode, native ESM)
- **Backend Framework**: Fastify 5.x (compiled schema validation, sub-millisecond route dispatch, native static asset delivery)
- **Persistence & State**: Transactional in-memory and file-backed SessionStore with deterministic seed sequences, atomic progress advancement, and cryptographic idempotency deduplication.
- **Frontend Client**: High-performance Single Page Application (SPA) with sleek dark obsidian HUD aesthetics, glassmorphic cards, micro-animations, and responsive layouts.
- **Testing**: Built-in `node:test` runner with zero external runner overhead.

---

## 3. Quickstart & Launch Instructions

### Prerequisites
- Node.js (v20.0.0 or later)
- npm (v10.0.0 or later)

### Installation & Build
```bash
# Clone repository
git clone https://github.com/VyomVadodariya/TEMSCON.git
cd TEMSCON

# Install dependencies
npm install

# Build TypeScript production bundle
npm run build
```

### Start the Application

The server requires a presenter key for all administrative and reveal operations. The server fails closed on startup in production if `PRESENTER_KEY` is not provided.

```bash
# Configure presenter secret key in your environment
# Linux / macOS:
export PRESENTER_KEY="your-secure-presenter-token"

# Windows (PowerShell):
$env:PRESENTER_KEY="your-secure-presenter-token"

# Windows (CMD):
set PRESENTER_KEY="your-secure-presenter-token"

# Production Mode
npm start

# Development Mode (with hot-reload)
npm run dev
```

> **Security & Credential Rotation Notice**: The application obtains presenter authentication strictly from the `PRESENTER_KEY` environment variable and never ships known default credentials. The literal `AIOCC_PRESENTER_SECRET_2026` was an insecure temporary test fixture from Phase 2; it is completely deprecated and rejected by the server. If this literal was ever used on any host, it must be rotated immediately.

The application will start on `http://localhost:3000`:
- **Operator / Participant Workstation**: [`http://localhost:3000/`](http://localhost:3000/)
- **Presenter Command Center**: [`http://localhost:3000/#presenter`](http://localhost:3000/#presenter)

---

## 4. Test Suite Execution

All unit, sequence feasibility, scoring regression, security, privacy, and end-to-end integration tests run via:

```bash
# Execute entire test suite (26 tests across 6 suites)
npm test

# Run scoring regression tests (all 6 canonical worked examples + boundary cases)
npm run test:scoring

# Run Option A sequence generator feasibility tests (30, 50, 80 queue lengths)
npm run test:sequence

# Run end-to-end API integration tests
npm run test:e2e

# Run measured in-process load test
npm run test:load
```

### Verified Test Results Summary
- `test/scoringEngine.test.ts` (7 tests passing): Canonical Scoring Contract v1.0.0 (`SOS = 100.00` for flawless operator, `SOS = 0.00` for blind approver, compounding catastrophic penalty progression $M=0 \dots 4$).
- `test/sequenceGenerator.test.ts` (4 tests passing): Option A sequence allocation (exact 3 practice items, 50 scored items, $k = [9, 21, 33, 45]$ focal probe positions, $L_{\text{local}}=8$ vs $L_{\text{local}}=1$, configurable range 30–80).
- `test/e2e.test.ts` (5 tests passing): Health checks, balanced participant enrollment, client payload answer scrubbing, idempotent retry deduplication, presenter session creation and reveal toggling.
- `test/securityAndPrivacy.test.ts` (6 tests passing): Zero ground truth/probe flags leaked to client, mutating presenter endpoints protected by `x-presenter-key`, fail-closed credential behavior in missing key/production states, hypothesis privacy masking before reveal (even when session status is CONCLUDED), sequence mismatch validation, and UI template hardening.
- `test/reliabilityAndPersistence.test.ts` (3 tests passing): Idempotent duplicate submission handling, uncompleted session timeouts, state serialization and restoration.
- `test/fullSessionSimulation.test.ts` (1 test passing): 53-request full lifecycle simulation of Complacent vs Vigilant operators, verifying condition-level contrast and educational reveal.
- `test/loadTest.ts`: Measured empirical load test (25 VUs $\times$ 20 decisions = 500 requests at 4,098 req/sec, $p95 = 13\text{ ms}$, 0% error rate). Distributed 200-participant load target across real networks remains an unverified provisional target pending Phase 5 k6 testing.

---

## 5. Live Interactive Demonstration Workflow

1. **Open Presenter Command Center**:
   - Navigate to [`http://localhost:3000/#presenter`](http://localhost:3000/#presenter).
   - Enter your configured `PRESENTER_KEY` into the Presenter Secret Key field and click **Authorize**.
   - Session `DEMO-2026` is pre-seeded and active.
   - Observe the live metrics HUD: Enrolled Operators, Completed Sessions, Cohort Average SOS, and Catastrophic Passes.
   - **Hypothesis Privacy Safeguard**: Condition contrast cards, condition labels, and focal probe catch rates are strictly masked behind a locked banner during active operations to protect experimental double-blind integrity.

2. **Open Participant Console**:
   - In a second browser window, navigate to [`http://localhost:3000/`](http://localhost:3000/).
   - Join with session code `DEMO-2026` and alias `Operator-Alpha`.
   - Experience the 3 onboarding practice requests with the amber practice mode banner.
   - Advance through operational requests: inspect the Scenario Dossier, examine parameters and diagnostic system logs, evaluate the AI recommendation, and submit `APPROVE`, `REJECT`, or `ESCALATE` decisions.

3. **Demonstrate Automation Complacency**:
   - Notice how approving repeated compliant routine requests creates cognitive habituation to trust high-confidence AI recommendations.
   - Intercept critical policy probes (such as unverified offshore banking switches or database drop cascades) that the AI recommendation incorrectly marks as safe.

4. **Review Live Presenter Dashboard & Unlock Educational Reveal**:
   - Return to the Presenter window to see live cohort progress and completed request counts. Notice that condition assignments in the operator roster remain masked as `Blind Assignment (Active)`.
   - Once all participant sessions are concluded, click **"Unlock Educational Reveal"**.
   - The dashboard dynamically unlocks the Condition A (`EXTENDED_REVIEW`, $L_{\text{local}}=8$) vs Condition B (`REDUCED_REVIEW`, $L_{\text{local}}=1$) contrast cards, displays condition-disaggregated focal catch rates, unmasks operator assignments, and opens the scientific debriefing panel explaining human vigilance decay.

---

## 6. Repository Structure

```
├── .gitignore                      # Safeguards against secrets, credentials, node_modules
├── package.json                    # Dependencies, scripts, and ESM configuration
├── tsconfig.json                   # Strict TypeScript compiler configuration
├── docs/                           # Phase 0.1 - 0.5 Authoritative Specifications
│   ├── PHASE_0_5_CONSISTENCY_LOCK.md # Canonical specification source of truth
│   ├── ARCHITECTURE.md             # System architecture & workload model
│   ├── EXPERIMENT_DESIGN.md        # Option A experimental design
│   ├── DATABASE_DESIGN.md          # Schema & data persistence design
│   ├── API_CONTRACT.md             # REST API specifications
│   ├── SECURITY_AND_PRIVACY.md     # IRB & security protocols
│   └── TEST_STRATEGY.md            # Test planning & acceptance criteria
├── server/
│   ├── src/
│   │   ├── index.ts                # Application server entry point with fail-closed key validation
│   │   ├── server.ts               # Fastify routes, static asset serving, and presenter auth
│   │   ├── types.ts                # Domain models, scoring contracts, and session types
│   │   ├── scenarios/
│   │   │   └── scenarioBank.ts     # 106 reviewed synthetic enterprise scenario templates
│   │   └── services/
│   │       ├── sequenceGenerator.ts # Option A sequence allocation engine
│   │       ├── scoringEngine.ts     # Canonical Scoring Contract v1.0.0
│   │       └── sessionStore.ts      # Server-authoritative state store with hypothesis privacy
├── public/
│   ├── index.html                  # Responsive Single Page Application with masked contrast view
│   ├── css/
│   │   └── styles.css              # Obsidian dark theme, glassmorphism, micro-animations
│   └── js/
│       └── app.js                  # Participant and Presenter client runtime with credential management
└── test/
    ├── scoringEngine.test.ts       # 7 canonical scoring verification tests
    ├── sequenceGenerator.test.ts   # 4 Option A sequence allocation tests
    ├── e2e.test.ts                 # 5 end-to-end API integration tests
    ├── securityAndPrivacy.test.ts  # 6 security, privacy, and hypothesis protection tests
    ├── reliabilityAndPersistence.test.ts # 3 reliability, deduplication, and persistence tests
    ├── fullSessionSimulation.test.ts # 1 complete multi-participant end-to-end simulation
    └── loadTest.ts                 # Measured empirical in-process load test
```

---

## 7. License & Compliance

MIT License. Designed strictly for research and simulation purposes. Contains zero external API connections, real financial transfers, or live external operations.
