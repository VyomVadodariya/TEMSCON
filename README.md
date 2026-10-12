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

> **Note on Performance Targets**: The 200-concurrent-participant capacity and $<100\text{ ms}$ latency targets remain explicitly designated as provisional design targets pending empirical validation during Phase 5 load testing. In-process benchmarking demonstrates $>4,000\text{ req/s}$ with $p95 = 13\text{ ms}$.

---

## 2. Architecture & Technical Stack

- **Runtime**: Node.js (v20+ LTS / v22 Alpine Container / Vercel Serverless Function)
- **Language**: TypeScript 5.7+ (Strict Mode, native ESM)
- **Backend Framework**: Fastify 5.x (compiled schema validation, sub-millisecond route dispatch, native static asset delivery)
- **Serverless Adapter**: Native Node HTTP bridge (`api/index.ts`) forwarding requests to Fastify via warm-instance singletons without background listener overhead.
- **Traffic Protection**: Gateway Token Bucket Rate Limiting ($B = 350\text{ tokens}$, refill $r = 75\text{ tokens/s}$) protecting all `/api/v1/*` routes while exempting static assets and `/health`. *(Note: on serverless platforms like Vercel, rate limiting enforces burst safety per instance)*.
- **Persistence & State**: 
  - **Managed PostgreSQL (Production / Vercel)**: `PostgresSessionStore` with connection pooling, transactional row-locking (`FOR UPDATE`), database-enforced idempotency (`UNIQUE` constraints), and automated schema migrations. Survives serverless function cold starts and container recycling.
  - **Durable File Snapshot (Local / Docker)**: `SessionStore` with atomic file-backed disk snapshotting (`STORAGE_FILE`).
- **Frontend Client**: High-performance Single Page Application (SPA) with sleek dark obsidian HUD aesthetics, glassmorphic cards, micro-animations, and responsive layouts.
- **Deployment**: Vercel Serverless (`vercel.json`), multi-stage lightweight Docker image (`Dockerfile`), Docker Compose (`docker-compose.yml`), and cloud manifests (`render.yaml`).
- **Testing**: Built-in `node:test` runner (39 tests across 8 suites), PostgreSQL integration tests, Vercel adapter tests, and k6 load testing scripts.

---

## 3. Quickstart & Deployment Instructions

### Prerequisites
- Node.js (v20.0.0 or later) and npm (v10.0.0 or later), OR
- Docker / Docker Compose, OR
- Vercel Account + Managed PostgreSQL (Neon / Supabase / Vercel Postgres)

### Environment Variables

| Variable | Description | Default | Required in Production / Vercel? |
| :--- | :--- | :--- | :--- |
| `PRESENTER_KEY` | Secret token for presenter authorization | *None* | **Yes** (fails closed if missing) |
| `DATABASE_URL` | PostgreSQL connection string | *None* | **Yes on Vercel** (fails closed to prevent ephemeral loss) |
| `DATABASE_SSL` | Enable/disable SSL for database connection | `true` in prod | No (defaults to SSL with `rejectUnauthorized: false` for cloud DBs) |
| `PORT` | HTTP port to listen on (standalone Node/Docker) | `3000` | No |
| `HOST` | Interface IP binding | `0.0.0.0` | No (binds to all interfaces for LAN/WAN access) |
| `STORAGE_FILE` | Local file snapshot path (used when no DB configured) | `data/sessions.json` | No |
| `CORS_ORIGIN` | Allowed CORS origin header | Same-origin (`true`) | No |
| `NODE_ENV` | Environment mode (`production` / `development`) | `development` | No |

---

### Option A: Local Node.js Execution

```bash
# Clone repository
git clone https://github.com/VyomVadodariya/TEMSCON.git
cd TEMSCON

# Install dependencies and build
npm install
npm run build

# Set PRESENTER_KEY and start
# Linux / macOS (Bash):
export PRESENTER_KEY="your-secret-presenter-token"
npm start

# Windows (PowerShell):
$env:PRESENTER_KEY="your-secret-presenter-token"
npm start

# Windows (CMD):
set PRESENTER_KEY=your-secret-presenter-token
npm start
```

---

### Option B: Vercel Serverless + PostgreSQL Deployment (Recommended for Live Cloud Demos)

The repository is configured for zero-friction Vercel deployment with automated routing, serverless Fastify execution, and managed PostgreSQL persistence.

#### Step 1: Provision a Managed PostgreSQL Database
You can use any managed PostgreSQL provider (e.g., [Neon.tech](https://neon.tech), [Supabase](https://supabase.com), or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)):
1. Create a free PostgreSQL database on Neon, Supabase, or Vercel Storage.
2. Copy the Connection String URL (e.g., `postgresql://user:password@ep-xyz.us-east-1.aws.neon.tech/neondb?sslmode=require`).

#### Step 2: Import into Vercel Dashboard
1. Go to [https://vercel.com/new](https://vercel.com/new).
2. Select and import the GitHub repository: **`VyomVadodariya/TEMSCON`** (branch: `main`).
3. Under **Build and Output Settings**:
   - Framework Preset: **Other**
   - Build Command: `npm run build` (or leave default `tsc`)
   - Output Directory: leave default
4. Under **Environment Variables**, add the following required secrets:
   - **`PRESENTER_KEY`**: Your secret presenter passphrase (e.g., `LiveDemoSecretKey2026!`).
   - **`DATABASE_URL`**: Your managed PostgreSQL connection URL from Step 1.
5. Click **Deploy**.

#### Step 3: Automated Database Migration & URL Verification
- On the first incoming request, `api/index.ts` automatically runs schema migrations (`CREATE TABLE IF NOT EXISTS aiocc_sessions, aiocc_participants, aiocc_decisions`) and pre-seeds session `DEMO-2026`.
- **Live Verified Deployment**:
  - **Health Check**: [`https://temscon-three.vercel.app/health`](https://temscon-three.vercel.app/health) -> returns `{"status":"UP","service":"AIOCC-Backend","persistence":"PostgreSQL"}`.
  - **Operator Interface**: [`https://temscon-three.vercel.app/`](https://temscon-three.vercel.app/)
  - **Simulator Results Dashboard**: [`https://temscon-three.vercel.app/#results`](https://temscon-three.vercel.app/#results)
  - **Presenter Console**: [`https://temscon-three.vercel.app/#presenter`](https://temscon-three.vercel.app/#presenter)

> **Serverless Persistence Guarantee**: The application refuses to silently fall back to ephemeral container/lambda disk storage in production. If `DATABASE_URL` is omitted in Vercel or production mode, startup fails closed with `FATAL PERSISTENCE ERROR`.

---

### Option C: Docker Container Deployment

The application includes an optimized multi-stage Docker build producing a secure ~70MB Alpine image running as a non-root user (`node`).

```bash
# Build the Docker image
docker build -t aiocc:latest .

# Run container with persistent data volume and healthcheck
docker run -d \
  --name aiocc-server \
  -p 3000:3000 \
  -e PRESENTER_KEY="your-secret-presenter-token" \
  -v aiocc_data:/app/data \
  aiocc:latest

# Check health and container status
docker ps
curl http://localhost:3000/health
```

---

### Option D: Docker Compose

```bash
# Set your presenter key in the environment or .env file
export PRESENTER_KEY="your-secret-presenter-token"

# Launch in background
docker compose up -d

# View live server logs
docker compose logs -f
```

---

### Option E: Render / AWS / Cloud Container

The repository includes a verified [`render.yaml`](render.yaml) blueprint:
- Configures a Docker web service with persistent disk at `/app/data` and healthcheck (`/health`).
- Set `PRESENTER_KEY` in the service settings.

---

## 4. Test Suite & Verification

The test harness exercises all layers of the platform with zero mock drift:

```bash
# Run all unit, integration, and serverless tests (39 tests across 8 suites)
npm test

# Run scoring engine regression tests (all 6 canonical worked examples)
npm run test:scoring

# Run Option A sequence generator feasibility tests (30, 50, 80 lengths)
npm run test:sequence

# Run end-to-end API integration tests
npm run test:e2e

# Run Vercel Serverless Function adapter tests
npm run test:vercel

# Run PostgreSQL persistence & transaction tests (requires PostgreSQL or Docker)
npm run test:postgres

# Run in-process load benchmark (500 requests at >4,000 req/s)
npm run test:load

# Run automated HTTP deployment smoke test against running instance
npm run test:smoke

# Distributed load test preparation (k6)
k6 run test/k6-load-test.js
```

### Verified Test Results Summary
- `test/scoringEngine.test.ts` (7 tests passing): Canonical Scoring Contract v1.0.0 (`SOS = 100.00` for flawless operator, `SOS = 0.00` for blind approver, compounding catastrophic penalty progression $M=0 \dots 4$).
- `test/sequenceGenerator.test.ts` (4 tests passing): Option A sequence allocation (exact 3 practice items, 50 scored items, $k = [9, 21, 33, 45]$ focal probe positions, $L_{\text{local}}=8$ vs $L_{\text{local}}=1$, configurable range 30–80).
- `test/e2e.test.ts` (5 tests passing): Health checks, balanced participant enrollment, client payload answer scrubbing, idempotent retry deduplication, presenter session creation and reveal toggling.
- `test/securityAndPrivacy.test.ts` (7 tests passing): Zero ground truth/probe flags leaked to client, mutating presenter endpoints protected by `x-presenter-key`, fail-closed credential behavior in missing key/production states, hypothesis privacy masking before reveal (even when session status is CONCLUDED), token bucket rate limiting ($B=350, r=75$), sequence mismatch validation, and UI template hardening.
- `test/reliabilityAndPersistence.test.ts` (4 tests passing): Idempotent duplicate submission handling, uncompleted session timeouts, state serialization, and durable disk snapshot restoration across server restarts.
- `test/postgresPersistence.test.ts` (7 tests passing): Schema migrations, transactional participant enrollment, atomic decision recording with row locks, database-enforced idempotency (`UNIQUE` constraints), state rehydration across independent store instances, hypothesis privacy masking, and production fail-closed behavior when `DATABASE_URL` is absent.
- `test/vercelAdapter.test.ts` (4 tests passing): Serverless entry point `api/index.ts` routing, HTTP stream handling, pre-parsed serverless body support, and presenter authentication enforcement.
- `test/fullSessionSimulation.test.ts` (1 test passing): 53-request full lifecycle simulation of Complacent vs Vigilant operators, verifying condition-level contrast and educational reveal.
- `test/deploymentSmokeTest.ts` (Passing): Standalone HTTP test verifying `/health`, static file delivery, presenter 401s, participant enrollment, practice progress, and reveal unmasking over live network HTTP.
- `test/loadTest.ts`: Measured empirical load test (25 VUs $\times$ 20 decisions = 500 requests at 4,098 req/sec, $p95 = 13\text{ ms}$, 0% error rate). Distributed 200-participant load target across real networks remains an unverified provisional target pending Phase 5 k6 testing.

---

## 5. Live Demonstration Runbook (Presenter Guide)

A comprehensive, standalone operational runbook is available in [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md). Follow this step-by-step procedure during live presentations, conference talks, or classroom demonstrations:

```mermaid
sequenceDiagram
    autonumber
    actor Presenter
    actor Audience as Participants (Laptops/Phones)
    participant Server as AIOCC Server (Vercel / Docker)
    
    Presenter->>Server: Start Server with PRESENTER_KEY & DATABASE_URL
    Presenter->>Server: Authenticate in #presenter (Enters Key)
    Server-->>Presenter: Key Configured (Hypothesis Masked)
    Audience->>Server: Connect to / (Join Session DEMO-2026)
    Server-->>Audience: 3 Practice Requests (Amber Banner)
    Audience->>Server: Submit Practice Decisions (Unscored)
    Server-->>Audience: 50 Scored Operational Requests
    Note over Audience,Server: Condition A: Habituation (L=8)<br/>Condition B: Vigilance Reset (L=1)
    Audience->>Server: Submit Operational Decisions
    Server-->>Presenter: Real-Time Aggregate HUD (Masked Conditions)
    Audience->>Server: Complete Final Request (53/53)
    Presenter->>Server: Click "Unlock Educational Reveal"
    Server-->>Presenter: Unmask Condition A vs B Contrast & Debrief
```

### Pre-Event Checklist (5 Minutes Before)
1. **Verify Health**:
   Browse to `https://<HOST>/health`. Confirm response contains `{"status":"UP","persistence":"PostgreSQL"}` (or `"File/Memory"`).
2. **Open Presenter Console**:
   Navigate to `https://<HOST>/#presenter`.
   Enter your `PRESENTER_KEY` and click **Authorize**. Confirm badge updates to `Key: Configured`.
3. **Confirm Hypothesis Masking**:
   Confirm the gold alert banner reads:
   `"HYPOTHESIS PRIVACY ACTIVE: Experimental condition labels, contrast cards, and probe catch rates are strictly hidden during live operations."`

### Live Event Flow (15 Minutes)
1. **Invite Audience (Minutes 0–2)**:
   - Instruct participants to visit the root URL (`https://<HOST>/`) on their mobile device or laptop.
   - Provide Session Code: `DEMO-2026` (pre-seeded active session) and have them enter an alias.
   - The platform automatically assigns participants equally to Condition A (`EXTENDED_REVIEW`) or Condition B (`REDUCED_REVIEW`) in double-blind fashion.
2. **Practice Familiarization (Minutes 2–4)**:
   - Participants see the amber banner: `"PRACTICE MODE — REQUEST 1 OF 3 (UNSCORED)"`.
   - Participants inspect the synthetic Scenario Dossier, examine the AI recommendation, and submit `APPROVE`, `REJECT`, or `ESCALATE`.
   - Reassure participants that practice requests do not affect their Simulation Oversight Score.
3. **Operational Evaluation & Complacency Induction (Minutes 4–12)**:
   - Participants enter scored operational requests.
   - In Condition A, long runs of routine compliant recommendations induce automation complacency.
   - At positions $k=[9, 21, 33, 45]$, critical high-stakes policy probes test whether participants blindly trust the AI recommendation or actively catch violations.
   - Presenter monitors the live aggregate HUD (Enrolled count, Completed count, Cohort Average SOS, and Total Catastrophic Passes). Participant rosters display `Blind Assignment (Active)`.
4. **The Educational Reveal (Minutes 12–15)**:
   - Once sessions conclude, the Presenter clicks the purple **"Unlock Educational Reveal"** button.
   - The UI reveals:
     - **Condition A (`EXTENDED_REVIEW`)**: Demonstrates higher complacency / lower probe catch rate.
     - **Condition B (`REDUCED_REVIEW`)**: Demonstrates higher vigilance / higher probe catch rate.
     - Individual participant rosters unmask Condition A and Condition B tags.
     - Scientific debrief panel opens, presenting empirical findings on human oversight decay in autonomous AI operations.

---

## 6. Persistence, Reliability & Recovery

### Persistence Architecture
- **Vercel / Cloud Production**: Uses managed PostgreSQL (`DATABASE_URL`). Schema tables (`aiocc_sessions`, `aiocc_participants`, `aiocc_decisions`) are automatically created. Decisions are guarded by composite unique constraints (`uq_aiocc_part_assign` and `uq_aiocc_part_idempotency`) to ensure duplicate submissions cannot inflate scores.
- **Local & Docker**: Uses transactional `SessionStore` with atomic file snapshotting to `STORAGE_FILE` (`data/sessions.json` or docker volume `/app/data/sessions.json`).
- Tested across database rehydration and container restarts: 100% of enrolled participants, queue states, and scores survive cold starts and server restarts.

### Recovery Procedures
- **Lost Presenter Key**:
  Presenter authentication is validated from the `PRESENTER_KEY` environment variable. If forgotten, check your Vercel or deployment dashboard environment settings.
- **Participant Disconnect or Refresh**:
  Participants who reload their browser can rejoin with the same session code and alias. Database idempotency constraints prevent duplicate scoring of previously submitted items.
- **Rate Limit Behavior**:
  Gateway rate limiting operates with a token bucket burst capacity of 350 tokens and 75 tokens/s refill rate. In Vercel serverless environments, this protects each serverless instance from traffic surges.

---

## 7. Repository Structure

```
├── .dockerignore                   # Docker build exclusions
├── .gitignore                      # Safeguards against secrets, credentials, node_modules, data
├── Dockerfile                      # Multi-stage production container build (Alpine Linux)
├── docker-compose.yml              # Local container orchestration with volume persistence
├── vercel.json                     # Vercel serverless routing and rewrite configuration
├── render.yaml                     # Cloud deployment blueprint (Render.com)
├── package.json                    # Dependencies, scripts, and ESM configuration
├── tsconfig.json                   # Strict TypeScript compiler configuration
├── api/
│   └── index.ts                    # Vercel Serverless Function entry point (Node HTTP bridge)
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
│   │   ├── index.ts                # Application entry point with fail-closed key validation
│   │   ├── server.ts               # Fastify routes, rate limiting, static assets, presenter auth
│   │   ├── types.ts                # Domain models, scoring contracts, ISessionStore interface
│   │   ├── scenarios/
│   │   │   └── scenarioBank.ts     # 106 reviewed synthetic enterprise scenario templates
│   │   └── services/
│   │       ├── sequenceGenerator.ts     # Option A sequence allocation engine
│   │       ├── scoringEngine.ts         # Canonical Scoring Contract v1.0.0
│   │       ├── simulatorResults.ts      # Phase 4.1 5-card activity results aggregation engine
│   │       ├── sessionStore.ts          # Server-authoritative in-memory / file snapshot store
│   │       └── postgresSessionStore.ts  # Production PostgreSQL transactional persistence engine
├── public/
│   ├── index.html                  # Responsive Single Page Application with results dashboard
│   ├── css/
│   │   └── styles.css              # Obsidian dark theme, glassmorphism, micro-animations
│   └── js/
│       └── app.js                  # Participant, Results, and Presenter client runtime
└── test/
    ├── scoringEngine.test.ts       # 7 canonical scoring verification tests
    ├── simulatorResults.test.ts    # 5 Phase 4.1 Simulator Results metric calculation tests
    ├── sequenceGenerator.test.ts   # 4 Option A sequence allocation tests
    ├── e2e.test.ts                 # 6 end-to-end API integration tests
    ├── securityAndPrivacy.test.ts  # 7 security, rate limiting, and hypothesis privacy tests
    ├── reliabilityAndPersistence.test.ts # 4 reliability, deduplication, and file persistence tests
    ├── postgresPersistence.test.ts # 7 PostgreSQL schema migrations, transactions & idempotency tests
    ├── vercelAdapter.test.ts       # 4 Vercel serverless function entry point tests
    ├── fullSessionSimulation.test.ts # 1 complete multi-participant end-to-end simulation
    ├── pilotProductionValidation.ts # Live production end-to-end validation suite
    ├── deploymentSmokeTest.ts      # Standalone HTTP smoke test for live/containerized environments
    ├── loadTest.ts                 # Measured empirical in-process load test
    └── k6-load-test.js             # Distributed k6 load testing script for Phase 5
```

---

## 8. License & Compliance

MIT License. Designed strictly for research and simulation purposes. Contains zero external API connections, real financial transfers, or live external operations.
