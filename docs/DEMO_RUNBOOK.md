# AIOCC Live Demonstration & Production Pilot Runbook

A step-by-step operational guide for presenting the AI Operations Control Center (AIOCC) to live audiences and conducting research trials.

---

## 1. System Overview & URLs

| Component | URL / Endpoint | Purpose |
| :--- | :--- | :--- |
| **Primary Production URL** | [`https://temscon-three.vercel.app/`](https://temscon-three.vercel.app/) | Participant human oversight console |
| **Presenter Console** | [`https://temscon-three.vercel.app/#presenter`](https://temscon-three.vercel.app/#presenter) | Real-time monitoring & authorized hypothesis reveal |
| **Health Check** | [`https://temscon-three.vercel.app/health`](https://temscon-three.vercel.app/health) | Uptime, service status, and PostgreSQL persistence |
| **Local Fallback (Docker)** | `http://localhost:3000/` | Offline / low-latency fallback container |

### Simulation Notice
> **IMPORTANT OPERATIONAL NOTICE**: The scenarios presented in the AIOCC platform simulate high-stakes enterprise IT and cloud operations (container restarts, privilege grants, firewall modifications, database failovers). No live production cloud assets or infrastructure are modified by participant decisions. All scenario telemetry and outcomes are generated within the controlled experimental environment.

---

## 2. Presenter Environment Prerequisites

Before commencing the demonstration, the presenter must verify:
1. **Network Connectivity**: Stable HTTPS access to `temscon-three.vercel.app`.
2. **Health Verification**: Query `https://temscon-three.vercel.app/health` and confirm HTTP 200 with `"status": "UP"` and `"persistence": "PostgreSQL"`.
3. **Presenter Secret Key**: Presenter credentials configured in the deployment environment (`PRESENTER_KEY` environment variable).
4. **Display Setup**:
   - **Main Screen / Projector**: Presenter Console (`/#presenter`) showing participant roster, progress bars, and masked aggregate statistics.
   - **Audience / Participant Devices**: Mobile phones, tablets, or laptops navigating to root `/`.

---

## 3. Session Setup & Initialization

### Option A: Using Default Pre-Seeded Session (Fastest)
- The production database automatically pre-seeds `DEMO-2026` with a standard 50-scored-request length.
- Participants can immediately join `DEMO-2026` without any manual creation step.

### Option B: Creating a Fresh Custom Session (Presenter Console)
1. Open [`https://temscon-three.vercel.app/#presenter`](https://temscon-three.vercel.app/#presenter).
2. Under **Presenter Authorization**, enter your secret `PRESENTER_KEY` and click **Authorize**. The indicator will change to `Key: Configured`.
3. Under **Create New Cohort**:
   - Enter a unique session identifier (e.g., `PILOT-AUDIENCE-01`).
   - Select Scored Request Count: `30` (quick demo), `50` (standard research), or `80` (stress trial).
   - Click **Create Cohort**.

---

## 4. Participant Onboarding & Participation Workflow

1. Direct audience members to open [`https://temscon-three.vercel.app/`](https://temscon-three.vercel.app/).
2. Instruct participants to:
   - Enter the Session Code (`DEMO-2026` or the custom cohort code).
   - Enter an anonymous Operator Alias (e.g., `Op-Sarah`, `Analyst-07`, `Team-A`). *Do not collect real PII.*
   - Click **Initialize Workstation**.
3. **Condition Assignment**:
   - Participants are automatically balanced into **Condition A (Extended Review)** or **Condition B (Reduced Review)** in alternating order.
   - **Strict Privacy**: Neither condition labels, hypothesis parameters, nor ground-truth classifications are disclosed to participants.
4. **Practice Phase (Unscored)**:
   - The first 3 requests are explicitly flagged as `PRACTICE MODE (UNSCORED)`.
   - Allows participants to familiarize themselves with AI confidence badges, audit logs, and action buttons (`APPROVE`, `REJECT`, `ESCALATE`).
5. **Operational Phase (Scored)**:
   - Requests transition seamlessly to scored evaluation at Request 4.
   - Dwell time countdown encourages deliberate review.
   - Decisions are validated and scored atomically server-side with strict idempotency.

---

## 5. Live Simulation Presenter Walkthrough

While the audience completes scenarios:
1. **Highlight the Presenter Screen**:
   - Point out real-time participant progress (e.g., `Request 14/53 (26%)`).
   - Explain that condition comparisons are **deliberately masked** (`BLIND ASSIGNMENT (ACTIVE)`).
2. **Explain the Experimental Paradigm**:
   - Discuss how autonomous AI assistants with high confidence (>90%) can induce automation complacency.
   - Explain that human operators must remain vigilant against subtle policy violations and critical anomalies.

---

## 6. Simulator Results Activity Dashboard

The platform includes a dedicated, presentation-ready activity results dashboard available at `/#results` (or via the **Simulator Results** navigation toggle).

### The Five Prominent Metric Cards

| Metric Card | Definition & Derivation | Inclusions & Exclusions | Empty / Incomplete State |
| :--- | :--- | :--- | :--- |
| **Total Approvals** | Count of finalized `APPROVE` decisions from scored requests. | **Included**: Scored requests ($k \ge 1$).<br/>**Excluded**: Practice items 1–3. | Displays `Awaiting real data` and `—` if zero scored requests recorded. |
| **Correct Decisions** | Decisions matching server-side ground truth and approved policy:<br/>• Compliant $\to$ `APPROVE`<br/>• Ambiguous $\to$ `ESCALATE`<br/>• Probes $\to$ `REJECT` or `ESCALATE` (Catch). | **Included**: All scored requests.<br/>**Excluded**: Practice items 1–3.<br/>*Derived from server ground truth, never client labels.* | Displays `Awaiting real data` and `—` if zero scored requests recorded. |
| **Unsafe Approvals** | Approvals on high-risk and catastrophic policy probes according to server ground truth. | **Included**: High-Risk Probes and Catastrophic Probes.<br/>**Excluded**: Practice items 1–3. | Displays `Awaiting real data` and `—` if no probe encounters recorded. Distinguishes $0$ from missing. |
| **Median Decision Time** | Median dwell time (latency) in **seconds** for scored requests. | **Included**: Valid positive dwell times ($0 < t \le 3600\text{s}$).<br/>**Excluded**: Missing, null, zero, negative, or invalid durations. | Displays `Awaiting real data` and `—` if no valid timing observations exist. |
| **Early vs. Late Review** | Focal probe catch rate contrast across the early queue window ($k \in [1, 25]$) versus the late queue window ($k \in [26, 50]$). | **Early Window**: Scored $1$ to $25$ ($k_{\text{focal}}=[9, 21]$).<br/>**Late Window**: Scored $26$ to $50$ ($k_{\text{focal}}=[33, 45]$).<br/>*Measures vigilance degradation ($Δ = \text{Late} - \text{Early}$).* | Displays `Awaiting real data` if no probes encountered, or `Partial Data` if late window is incomplete. |

---

## 7. Unlocking the Educational Reveal & Debriefing

Once participants reach the completion screen:
1. Ensure the presenter key is authorized in the console.
2. Click **Unlock Experimental Reveal & Scientific Debriefing**.
3. **What Appears**:
   - **Condition A vs. Condition B Contrast Cards**: Displays the contrast between low-contrast habituation queues versus high-contrast exposure.
   - **Focal Probe Catch Rates**: Compares how effectively Condition A vs. Condition B operators caught embedded catastrophic anomalies.
   - **Simulation Oversight Score (SOS)**: Displays the distribution of participant scores (0 to 100).
4. **Key Talking Points for Discussion**:
   - *Why did operators approve high-risk AI proposals?*
   - *How did habituation to compliant routine requests degrade vigilance?*
   - *The role of cognitive fatigue and over-reliance on confidence percentages.*

---

## 7. Troubleshooting & Recovery Procedures

| Symptom | Root Cause | Immediate Action |
| :--- | :--- | :--- |
| **Participant refreshed page** | Browser navigation | Re-enter session code and alias. Progress is durably preserved in PostgreSQL and resumes automatically at the exact scenario. |
| **HTTP 429 Too Many Requests** | Gateway rate limit exceeded | The token bucket allows burst of 350 tokens, refilling at 75 tokens/sec. Pause rapid clicking for 2-3 seconds; retry. |
| **HTTP 401 Unauthorized in Presenter View** | Missing or incorrect presenter key | Re-enter the exact `PRESENTER_KEY` configured in Vercel environment settings and click Authorize. |
| **Vercel Cloud Interruption** | Network / upstream issue | Launch local backup container: `docker run -p 3000:3000 -e PRESENTER_KEY=demo123 aiocc-test:local`. Connect audience to `http://<local-ip>:3000`. |
| **Participant Submission Error** | Out-of-order request or race condition | The frontend will alert the user. Refresh the page to synchronize the latest server state. |
| **Participant Decision Error (Fractional Score)** | Prior PostgreSQL integer column mismatch | Resolved in migration `001_raw_points_numeric` (`NUMERIC(10, 2)`). Transactional rollback guarantees sequence position was preserved; participant simply retries submission. |

---

## 8. Data Separation & Retention Policy

- **Pilot vs. Production Data**: Dedicated demo runs should use distinct session prefixes (e.g., `PILOT-`, `DEMO-`, `TRIAL-`).
- **Data Isolation**: Each session code is completely partitioned in the database.
- **Privacy Guarantee**: No IP addresses or participant hardware fingerprints are stored. Only operator aliases, timestamps, dwell times, and decisions are retained.
- **Retention**: Data in PostgreSQL persists until manually purged by database administrators. The application does not automatically delete completed sessions to safeguard research auditability.

---

## 9. Current System Limitations & Boundary Disclaimers

1. **Target Concurrency**: The system is designed with token-bucket rate limiting (Burst 350, Refill 75 req/s) and connection-pooled PostgreSQL persistence. While validated for multi-operator concurrent sessions, extreme multi-hundred concurrent burst loads (>200 simultaneous users clicking within 1 second) remain unverified on serverless tier limits without dedicated load-balancer provisioning.
2. **Serverless Ephemeral Storage**: The Vercel deployment relies strictly on PostgreSQL persistence. In-memory or file-backed modes are disabled in production to prevent silent data loss during function spin-down.
