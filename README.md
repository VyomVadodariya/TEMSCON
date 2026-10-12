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
```bash
# Production Mode
npm start

# Development Mode (with hot-reload)
npm run dev
```

The application will start on `http://localhost:3000`:
- **Operator / Participant Workstation**: [`http://localhost:3000/`](http://localhost:3000/)
- **Presenter Command Center**: [`http://localhost:3000/#presenter`](http://localhost:3000/#presenter)

---

## 4. Test Suite Execution

All unit, sequence feasibility, scoring regression, and end-to-end integration tests run via:

```bash
# Execute entire test suite (24 tests across 6 suites)
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
- `test/scoringEngine.test.ts`: 7 tests passing (`SOS = 100.00` for flawless operator, `SOS = 0.00` for blind approver, compounding penalty progression $M=0 \dots 4$).
- `test/sequenceGenerator.test.ts`: 4 tests passing (exact 3 practice items, 50 scored items, $k = [9, 21, 33, 45]$ focal positions, $L_{\text{local}}=8$ vs $L_{\text{local}}=1$, configurable range 30–80).
- `test/e2e.test.ts`: 5 tests passing (health checks, balanced participant enrollment, client payload answer scrubbing, idempotent retry deduplication, presenter session creation and reveal toggling).
- `test/securityAndPrivacy.test.ts`: 4 tests passing (zero ground truth/probe flags leaked to client, mutating presenter endpoints protected by `x-presenter-key`, hypothesis privacy masking before reveal, sequence mismatch validation).
- `test/reliabilityAndPersistence.test.ts`: 3 tests passing (idempotent duplicate submission handling, uncompleted session timeouts, state serialization and restoration).
- `test/fullSessionSimulation.test.ts`: 1 test passing (53-request full lifecycle simulation of Complacent vs Vigilant operators, verifying condition-level contrast and educational reveal).
- `test/loadTest.ts`: Measured empirical load test (50 VUs, $p95 = 4.56\text{ ms}$, 0% error rate). Note: distributed 200-participant load target remains an unverified provisional target pending Phase 5 k6 testing.

---

## 5. Live Interactive Demonstration Workflow

1. **Open Presenter Command Center**:
   - Navigate to [`http://localhost:3000/#presenter`](http://localhost:3000/#presenter).
   - Session `DEMO-2026` is pre-seeded and active.
   - Observe the live metrics HUD: Enrolled Operators, Condition A vs B split, and the locked Educational Reveal card.

2. **Open Participant Console**:
   - In a second browser window, navigate to [`http://localhost:3000/`](http://localhost:3000/).
   - Join with session code `DEMO-2026` and alias `Operator-Alpha`.
   - Experience the 3 onboarding practice requests with the amber practice mode banner.
   - Advance through operational requests: inspect the Scenario Dossier, examine parameters and diagnostic system logs, evaluate the AI recommendation, and submit `APPROVE`, `REJECT`, or `ESCALATE` decisions.

3. **Demonstrate Automation Complacency**:
   - Notice how approving repeated compliant routine requests creates a natural tendency to trust high-confidence AI recommendations.
   - Intercept critical policy probes (such as unverified offshore banking switches or database drop cascades) that the AI soothingly recommends approving.

4. **Review Live Presenter Dashboard & Educational Reveal**:
   - Return to the Presenter window to see live participant progress and condition-level catch rate statistics updated in real-time.
   - Click **"Unlock Educational Reveal"** to reveal the research rationale, explaining how local exposure contrast ($L_{\text{local}}=8$ vs $L_{\text{local}}=1$) governs human oversight vigilance.

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
│   │   ├── index.ts                # Application server entry point
│   │   ├── server.ts               # Fastify routes, static asset serving, and middleware
│   │   ├── types.ts                # Domain models, scoring contracts, and session types
│   │   ├── scenarios/
│   │   │   └── scenarioBank.ts     # 106 reviewed synthetic enterprise scenario templates
│   │   └── services/
│   │       ├── sequenceGenerator.ts # Option A sequence allocation engine
│   │       ├── scoringEngine.ts     # Canonical Scoring Contract v1.0.0
│   │       └── sessionStore.ts      # Server-authoritative state store with idempotency
├── public/
│   ├── index.html                  # Responsive Single Page Application
│   ├── css/
│   │   └── styles.css              # Obsidian dark theme, glassmorphism, micro-animations
│   └── js/
│       └── app.js                  # Participant and Presenter client runtime
└── test/
    ├── scoringEngine.test.ts       # 7 canonical scoring verification tests
    ├── sequenceGenerator.test.ts   # 4 Option A sequence allocation tests
    └── e2e.test.ts                 # 5 end-to-end API integration tests
```

---

## 7. License & Compliance

MIT License. Designed strictly for research and simulation purposes. Contains zero external API connections, real financial transfers, or live external operations.
