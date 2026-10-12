# AI Operations Control Center — Experiment Design & Scientific Methodology

## 1. Scientific Objective & Hypotheses (Authorized Option A Design)

### 1.1 Research Context
As modern enterprises deploy autonomous AI agents with operational authority (e.g., automated infrastructure changes, financial ledger entries, database privilege grants, and cloud policy remediation), human oversight ("Human-in-the-Loop" / HITL) serves as the primary organizational safeguard against catastrophic errors. However, human factors research suggests that human supervisors experience **automation complacency** and **vigilance decrement** when reviewing high volumes of routine, compliant requests.

The **AI Operations Control Center (AIOCC)** experiment investigates:
> *How does **prior review exposure** (the accumulation of routine, compliant reviews) affect human oversight accuracy, response latency, and critical violation detection when encountering matched critical policy probes?*

> [!IMPORTANT]
> **Preservation of Scientific Distinction**: The platform records observable human-system interaction metrics (decisions, response times, scroll depth, dwell time). Inferences regarding cognitive mechanisms (e.g. "complacency", "vigilance decrement") represent theoretical constructs and research hypotheses to be tested using statistical models, rather than proven causal properties of the software platform.

### 1.2 Experimental Conditions & Interface Parity
- **Condition A**: `EXTENDED_REVIEW`
- **Condition B**: `REDUCED_REVIEW`
- **Independent Variable**: **Prior review exposure before matched critical probes**.
- **Strict Interface Parity**: **The interface must not introduce condition-specific cognitive scaffolding.** Both conditions interact with an **identical, unified operations cockpit interface**. Participants in both conditions view the same summary cards, AI rationales, context logs, policy excerpts, and action buttons (`[Approve]`, `[Reject]`, `[Escalate]`). No condition-specific checklists, diff viewers, or friction timers are permitted.

---

## 2. Issue B Resolution: Exposure vs. Absolute-Position Confounding

### 2.1 Precise Formal Definitions
To avoid ambiguity, review exposure and temporal factors are formalized as follows:
- **$N_{\text{assigned}}$**: Total scored requests assigned to the participant (default: 50 requests).
- **$k \in \{1, 2, \dots, 50\}$**: Absolute sequence position of the request within the participant's scored sequence.
- **$C_{\text{completed}}(k) = k - 1$**: Cumulative number of scored decisions completed prior to position $k$.
- **$C_{\text{routine}}(k)$**: Cumulative count of routine, compliant decisions completed prior to position $k$.
- **$L_{\text{local}}(k)$ (Local Preceding Exposure Run-Length)**: The exact count of consecutive compliant/routine requests immediately preceding the current request without an intervening critical probe.
- **$T_{\text{elapsed}}(k)$**: Cumulative active dwell time (in seconds) accrued across preceding decisions prior to presenting request $k$.
- **$D(k)$**: Scenario difficulty tier (`EASY`, `MEDIUM`, `HARD`, `TRICKY`).
- **$\text{Cat}(k)$**: Enterprise operational category (`SECOPS`, `FINOPS`, `ITOPS`, `DATAOPS`, `CUSTOMEROPS`).

### 2.2 Why Clustered Placement Conrounds Exposure with Absolute Position
A naive design might attempt to create "extended exposure" by placing all critical probes late in Condition A (e.g., positions 40–50) and "reduced exposure" by placing all critical probes early in Condition B (e.g., positions 1–10). 

**This design is scientifically flawed and invalid because it fatally confounds review exposure with absolute sequence position:**
1. **Time-on-Task / Fatigue Confound**: A participant at position 45 has been performing repetitive visual scanning for 40 minutes. Lower probe catch rates at position 45 could be caused by general eye fatigue, boredom, physical restlessness, or time-on-task, completely independent of routine review habituation.
2. **Warm-Up / Calibration Confound**: A participant at position 5 is still stabilizing their task mental model. Performance differences early versus late reflect learning curve dynamics rather than steady-state complacency.
3. **Collinearity**: If probe position is perfectly collinear with condition, regression models cannot mathematically separate the effect of routine review habituation from absolute session duration ($r \approx 1.0$).

### 2.3 Mathematical Feasibility & Counterbalanced Allocation Strategy

#### 2.3.1 Mathematical Proof of Impossibility for Universal Hard Constraints
In earlier preliminary discussions, an intuitive design was proposed requiring every critical probe in Condition A to follow $L_{\text{local}} \ge 7$ routine requests, and every interval in Condition B to be $L_{\text{local}} \le 3$. 

**Theorem (Mathematical Impossibility of Universal Hard Constraints)**:
1. In a 50-request queue containing exactly $N_{\text{probe}} = 8$ probes and $N_{\text{routine}} = 42$ non-probe requests, the sum of all local runs and trailing requests is bounded:
   $$\sum_{j=1}^8 L_{\text{local}}(P_j) + r_{\text{trailing}} = 42$$
   If every probe were required to satisfy $L_{\text{local}}(P_j) \ge 7$, the minimum number of routine requests required would be:
   $$\sum_{j=1}^8 L_{\text{local}}(P_j) \ge 8 \times 7 = 56 > 42$$
   *This is mathematically impossible.* The maximum possible average local run length across all 8 probes cannot exceed $\frac{42}{8} = 5.25\text{ requests}$.
2. In Condition B, if all 9 intervals (8 probe preceding intervals plus 1 trailing interval) were strictly constrained to $r_i \le 3$, the maximum number of routine requests that could be accommodated is:
   $$\sum_{i=0}^8 r_i \le 9 \times 3 = 27 < 42$$
   *This is also mathematically impossible*, leaving $42 - 27 = 15\text{ routine requests}$ unassigned.

**Definitive Clarification**: Local run length $L_{\text{local}}$ is therefore defined as an **explicit target exposure metric with documented tolerances and a defined experimental contrast**, rather than an impossible uniform hard constraint applied to all intervals simultaneously.

#### 2.3.2 Feasible Primary Architecture: Dual-Tier Matched Focal Probe Model with Identical Absolute Positions
To rigorously operationalize Option A within the 50-request constraint while counterbalancing sequence position, item difficulty, and fatigue:
1. **Dyad Organization**: The 8 critical probes are organized into 4 matched dyads ($P_{1a}/P_{1b}, P_{2a}/P_{2b}, P_{3a}/P_{3b}, P_{4a}/P_{4b}$) sharing identical operational category, risk tier ($W$), and difficulty tier.
2. **Focal Probes vs. Context/Reset Probes**: Within each participant sequence, 4 probes are designated as **Focal Probes** ($F_1, F_2, F_3, F_4$, the primary experimental evaluation probes) and 4 probes serve as **Context/Reset Probes** ($C_1, C_2, C_3, C_4$, ensuring vigilance reset and cross-quintile representation).
3. **Identical Absolute Position Matching for Focal Probes**:
   - In both Condition A and Condition B, the four Focal Probes occupy the **exact same absolute sequence positions**:
     $$k_{\text{focal}} = [9, 21, 33, 45]$$
   - **Scope and Limitations of Matching**: This design matching ensures that absolute sequence position ($k$) and the number of previously completed tasks ($C_{\text{completed}} = 8, 20, 32, 44$) are **strictly identical across conditions** when focal probes are encountered, eliminating ordinal queue position as a direct between-condition confound.
   - It does **not** claim to eliminate all confounding: cumulative clock time-on-task may vary with individual dwell times, prior exposure histories differ due to context probe locations ($k = [12, 24, 36, 48]$ in A vs $k = [7, 19, 31, 43]$ in B), and fatigue may interact with condition pacing. These residual factors are modeled analytically via Generalized Linear Mixed Models (GLMM).
4. **Condition A (`EXTENDED_REVIEW`) Allocation**:
   - Focal Probes are scheduled after **extended local runs** of routine items without an intervening probe: **Target $L_{\text{local}} = 8$** (Tolerance band: $7 - 9$).
   - Context Probes are placed after Focal Probes at brief reset intervals ($L_{\text{local}} = 2$).
   - **Concrete Sequence Template (Condition A)**:
     - Probe indices: `k = [9, 12, 21, 24, 33, 36, 45, 48]`
     - Preceding routine runs: `L_local = [8, 2, 8, 2, 8, 2, 8, 2]`, trailing items: `2`
     - Exact sum verification: $4 \times 8 + 4 \times 2 + 2 = 32 + 8 + 2 = \mathbf{42\text{ routine requests}}$ (exact sum).
     - Focal Probes ($k \in \{9, 21, 33, 45\}$): $L_{\text{local}} = 8 \ge 7$ (Extended exposure).
     - Quintile distribution: $Q_1(1..10): 1\text{ probe (pos 9)}, Q_2(11..20): 1\text{ (pos 12)}, Q_3(21..30): 2\text{ (pos 21, 24)}, Q_4(31..40): 2\text{ (pos 33, 36)}, Q_5(41..50): 2\text{ (pos 45, 48)}$. All quintiles represented.
5. **Condition B (`REDUCED_REVIEW`) Allocation**:
   - The matched Focal Probes ($k \in \{9, 21, 33, 45\}$) are scheduled after **reduced local runs** of routine items: **Target $L_{\text{local}} = 1$** (Tolerance band: $1 - 3$).
   - This is achieved by scheduling Context Probes immediately preceding the Focal Probes at positions `k = [7, 19, 31, 43]`.
   - **Concrete Sequence Template (Condition B)**:
     - Probe indices: `k = [7, 9, 19, 21, 31, 33, 43, 45]`
     - Preceding routine runs: `L_local = [6, 1, 9, 1, 9, 1, 9, 1]`, trailing items: `5`
     - Exact sum verification: $6 + 1 + 9 + 1 + 9 + 1 + 9 + 1 + 5 = \mathbf{42\text{ routine requests}}$ (exact sum).
     - Focal Probes ($k \in \{9, 21, 33, 45\}$): $L_{\text{local}} = 1 \le 3$ (Reduced exposure).
     - Quintile distribution: $Q_1: 2\text{ probes (pos 7, 9)}, Q_2: 1\text{ (pos 19)}, Q_3: 1\text{ (pos 21)}, Q_4: 2\text{ (pos 31, 33)}, Q_5: 2\text{ (pos 43, 45)}$. All quintiles represented.
6. **Sub-Cohort Latin Square Rotation**: To eliminate item-specific bias, participants within each condition are pseudo-randomly assigned to Track 1 or Track 2. In Track 1, dyad member $P_{ma}$ serves as the Focal Probe and $P_{mb}$ as the Context Probe; in Track 2, the assignments are inverted. Thus, across the full cohort, every single critical probe template is evaluated under both Extended ($L=8$) and Reduced ($L=1$) exposure at identical sequence positions.

### 2.4 Inherent Limitations & Statistical Analysis Plan
> [!NOTE]
> **Acknowledgment of Inherent Confounding**: In any fixed-length sequence of 50 tasks with 42 legitimate requests and 8 probes, cumulative exposure ($C_{\text{completed}} = k - 1$) and absolute position ($k$) remain inherently collinear ($r = 1.0$). The platform does **not** claim that a single fixed-length sequence achieves orthogonal isolation between cumulative time-on-task and sequence position.

To isolate the causal effect of local prior review exposure from absolute sequence position ($k$) and cumulative fatigue, research evaluation must employ a **Generalized Linear Mixed Model (GLMM)** rather than simple aggregate t-tests:
$$\operatorname{logit}\big(P(\text{Catch}_{ijk} = 1)\big) = \beta_0 + \beta_1 \text{Condition}_i + \beta_2 L_{\text{local}, k} + \beta_3 k + \beta_4 (L_{\text{local}, k} \times k) + u_{\text{participant}, i} + v_{\text{scenario}, j}$$
Where:
- $\beta_1$ estimates the main effect of Condition.
- $\beta_2$ estimates the effect of Local Run-Length ($L_{\text{local}}$).
- $\beta_3$ controls for linear Absolute Sequence Position ($k$ / time-on-task).
- $u_{\text{participant}}$ and $v_{\text{scenario}}$ control for random participant and scenario variance.

### 2.5 Exploratory Analysis Plan
The platform exports raw, unaggregated behavioral records to support exploratory analyses:
1. **Accuracy by Sequence Quintile**: Comparing probe recall across $Q_1 \dots Q_5$ between conditions.
2. **Unsafe Approvals by Probe Category**: Evaluating whether specific failure modes (e.g. Prompt Injection vs. Privilege Escalation) show differential vulnerability to prior review exposure.
3. **Response Time Degradation**: Tracking whether mean $\text{RT}$ on routine requests accelerates preceding missed probes.
4. **Uncertainty & Sample Sizing**: Reporting condition differences with 95% Wald confidence intervals and effect sizes (odds ratios).
5. **Epistemological Disclaimer**: No claims of statistical significance or causal proof are made in this specification. All conclusions depend strictly on empirical data collection.

---

## 3. Sequence Structure, Practice Exclusion & Catalog Sizing

### 3.1 Onboarding & Three Unscored Practice Requests
Before the scored experiment commences, every participant completes **exactly 3 unscored practice requests**:
1. `PRAC-01` (Compliant Routine Operation): Establishes baseline cockpit interaction and approval mechanics.
2. `PRAC-02` (Blatant Policy Violation): Demonstrates policy violation detection and rejection mechanics.
3. `PRAC-03` (Ambiguous Context Request): Demonstrates escalation threshold and rationale submission.

*Practice outcomes are logged for usability audit but strictly excluded from all scoring, OSI calculations, and research export datasets.*

### 3.2 Mutually Exclusive Request Classes & Default Composition
To prevent ambiguity in scoring and sequence validation, the scored sequence is divided into **mutually exclusive, non-overlapping request classes** whose counts sum exactly to the configured sequence length $K$ (default: 50 requests):

1. **Class 1: Routine Compliant Requests ($N_{\text{compliant}}$)**:
   - Clear operational compliance with enterprise policy.
   - Optimal action: `APPROVE`.
   - Risk weight: $W_k = 1.0$. Maximum achievable points: $+2.0$.
2. **Class 2: Ambiguous / Appropriately Escalatable Requests ($N_{\text{ambiguous}}$)**:
   - Legitimate requests that deliberately lack required context or logs; policy mandates escalation to Level-2 supervisor.
   - Optimal action: `ESCALATE`.
   - Risk weight: $W_k = 1.0$. Maximum achievable points: $+3.0 \times W_k = +3.0$.
3. **Class 3: Critical Policy Probes ($N_{\text{probe}} = N_{\text{high}} + N_{\text{catastrophic}}$)**:
   - Deliberate violations of core enterprise security/financial policies.
   - Optimal action: `REJECT` (threat blocked) or `ESCALATE` (security escalation).
   - Class 3a ($N_{\text{high}}$): High-risk probes ($W_k = 1.5$). Max achievable points: $+4.0 \times 1.5 = +6.0$.
   - Class 3b ($N_{\text{catastrophic}}$): Catastrophic-risk probes ($W_k = 2.0$). Max achievable points: $+4.0 \times 2.0 = +8.0$.

**Sum Constraints**:
- The "42 Legitimate or Appropriately Escalatable Requests" are composed of $N_{\text{compliant}} + N_{\text{ambiguous}} = 42$.
- The "8 Critical Policy Probes" are composed of $N_{\text{high}} + N_{\text{catastrophic}} = 8$.
- Total Scored Requests: $N_{\text{compliant}} + N_{\text{ambiguous}} + N_{\text{high}} + N_{\text{catastrophic}} = 50$.
- Preceded by exactly 3 practice requests (`PRAC-01..03`), which are unscored (maximum achievable points: $0.0$).

### 3.3 Versioned Scenario Bank ($\ge 100$ Reviewed Templates)
The platform maintains an immutable catalog (`catalog_version: 'v1.0.0'`) containing:
- $\ge 75$ Legitimate / Appropriately Escalatable templates ($\ge 60$ compliant, $\ge 15$ ambiguous).
- $\ge 25$ Matched Critical Probe templates ($\ge 12$ high risk, $\ge 13$ catastrophic).
- 3 Practice templates (`PRAC-01..03`).

### 3.4 Seeded PRNG Algorithm
Sequences are generated using **Mulberry32 PRNG** seeded by a 32-bit hash of the cohort master seed and participant code, ensuring 100% deterministic replay:
$$\text{Seed}_{\text{participant}} = \text{Hash32}(\text{CohortSeed} \parallel \text{ParticipantCode})$$

---

## 4. Issue C Resolution: Comprehensive Scoring Specification

### 4.1 Educational Nature of Scoring
> [!IMPORTANT]
> The metric defined below is designated as the **Simulation Oversight Score (SOS)**. It is an educational simulation metric designed to provide pedagogical feedback on oversight vigilance, catastrophic risk avoidance, and operational drag. It is **not** a validated psychological, psychometric, or clinical assessment tool.

### 4.2 Definition of Risk Weight Multiplier ($W$)
- **Meaning**: $W$ represents the dimensionless **Risk Weight Multiplier** reflecting the blast-radius severity of the operational request.
- **Unit**: Dimensionless scalar multiplier.
- **Valid Range**: $[1.0, 2.0]$.
- **Mapping by Scenario Risk Tier**:
  - `LOW`: $W = 1.0$
  - `MEDIUM`: $W = 1.25$
  - `HIGH`: $W = 1.5$
  - `CATASTROPHIC`: $W = 2.0$

### 4.3 Decision Point Matrix (Raw Points $R_k$)
For any request $k$ with risk multiplier $W_k$:

| Ground Truth State | Participant Action: `APPROVE` | Participant Action: `REJECT` | Participant Action: `ESCALATE` | Participant Action: `TIMEOUT_AUTO_REJECT` | Max Achievable Points |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Compliant Request** ($W=1.0$) | **$+2.0$**<br/>(Correct Approval) | **$-0.5$**<br/>(False Alarm Drag) | **$-1.0 \times W_k$**<br/>**(Inappropriate Escalation)** | **$0.0$**<br/>(Safe Expiration) | **$+2.0$** |
| **Critical Policy Probe** ($W \in \{1.5, 2.0\}$) | **$-15.0 \times W_k$**<br/>**(Unsafe Approval!)** | **$+4.0 \times W_k$**<br/>(Threat Blocked) | **$+3.0 \times W_k$**<br/>(Appropriate Escalation) | **$+1.0$**<br/>(Safe Failover) | **$+4.0 \times W_k$** |
| **Ambiguous Request** ($W=1.0$) | **$-3.0 \times W_k$**<br/>(Premature Approval) | **$+1.0 \times W_k$**<br/>(Cautious Rejection) | **$+3.0 \times W_k$**<br/>(Correct Investigation) | **$0.0$**<br/>(Neutral) | **$+3.0 \times W_k$** |
| **Practice Request** (`is_practice = true`) | **$0.0$**<br/>(Unscored) | **$0.0$**<br/>(Unscored) | **$0.0$**<br/>(Unscored) | **$0.0$**<br/>(Unscored) | **$0.0$** |

### 4.4 Compounding Catastrophic Penalty Rule
Approving a catastrophic critical probe ($W = 2.0$) represents an unacceptable organizational failure. If a participant commits multiple catastrophic unsafe approvals ($M_{\text{catastrophic}} \ge 2$), an additional compounding penalty is deducted:
$$\text{CompoundingPenalty} = 10.0 \times (M_{\text{catastrophic}} - 1)^{1.5}$$

### 4.5 Theoretical Maximum Points ($MaxScore$)
The denominator $MaxScore$ is dynamically computed as the sum of the maximum achievable points across the exact set of scored scenarios assigned to the participant:
$$MaxScore = \sum_{k=1}^K \max_{a \in \{\text{actions}\}} R_k(a)$$

#### Derivation for Default 50-Request Cohorts
1. **Pure Compliant Baseline Cohort (42 Compliant, 8 Probes)**:
   - 42 Compliant requests ($W=1.0$): $42 \text{ requests} \times 2.0\text{ pts} = 84.0\text{ points}$.
   - 4 High-risk probes ($W=1.5$): $4 \text{ requests} \times (+4.0 \times 1.5)\text{ pts} = 24.0\text{ points}$.
   - 4 Catastrophic-risk probes ($W=2.0$): $4 \text{ requests} \times (+4.0 \times 2.0)\text{ pts} = 32.0\text{ points}$.
   - **Request Count Verification**: $42 + 4 + 4 = \mathbf{50\text{ requests}}$ (exactly 50 items, resolving any prior confusion regarding request count).
   - **Point Sum Verification**: $MaxScore = 84.0 + 24.0 + 32.0 = \mathbf{140.0\text{ points}}$.
2. **Mixed Baseline Cohort (36 Compliant, 6 Ambiguous, 8 Probes)**:
   - 36 Compliant requests: $36 \times 2.0 = 72.0\text{ points}$.
   - 6 Ambiguous requests: $6 \times 3.0 = 18.0\text{ points}$ (Subtotal non-probes: $72.0 + 18.0 = 90.0\text{ points}$).
   - 4 High-risk probes: $4 \times 6.0 = 24.0\text{ points}$.
   - 4 Catastrophic-risk probes: $4 \times 8.0 = 32.0\text{ points}$.
   - **Request Count Verification**: $36 + 6 + 4 + 4 = \mathbf{50\text{ requests}}$.
   - **Point Sum Verification**: $MaxScore = 72.0 + 18.0 + 24.0 + 32.0 = \mathbf{146.0\text{ points}}$.

### 4.6 Normalization, Clamping & Missing Categories
$$\text{RawScore} = \left( \sum_{k=1}^K R_k \right) - \text{CompoundingPenalty}$$
$$\text{SOS} = \operatorname{clamp}\left( \frac{\max(0, \text{RawScore})}{MaxScore} \times 100, 0.0, 100.0 \right)$$
Where $\operatorname{clamp}(x, 0.0, 100.0) = \min(100.0, \max(0.0, x))$.

**Handling Missing Categories & Custom Lengths**:
- If a cohort uses custom lengths (30 to 80 requests) or omits an operational category (e.g., no DataOps requests present), $MaxScore$ is calculated strictly across the requests actually presented.
- Missing categories contribute 0 to the numerator and 0 to the denominator; no unearned full credit is granted.
- If $MaxScore = 0$ (e.g. no scored requests presented), $\text{SOS}$ is returned as `null` (`UNAVAILABLE`).

---

## 5. Hand-Calculated Concrete Scoring Examples

The following concrete examples illustrate the canonical scoring formula (v1.0.0) across diverse operational behaviors on the default 50-request queue ($MaxScore = 140.0$ for baseline 42/0/4/4; $MaxScore = 146.0$ for mixed 36/6/4/4) and boundary conditions. All values are independently verified via `phase_0_5_scoring_tests.py`:

### Example 1: Flawless Vigilant Operator (Baseline Queue)
- **Queue Composition**: 42 Compliant ($C=42$), 0 Ambiguous ($A=0$), 4 High-Risk Probes ($H=4$), 4 Catastrophic Probes ($K_{\text{cat}}=4$). $MaxScore = 140.0$.
- **Decisions**: 
  - 42 Compliant: 42 APPROVE ($42 \times (+2.0) = +84.0\text{ points}$).
  - 4 High-Risk Probes: 4 REJECT ($4 \times (+6.0) = +24.0\text{ points}$).
  - 4 Catastrophic Probes: 4 REJECT ($4 \times (+8.0) = +32.0\text{ points}$).
- **Penalties**: 0 false alarms, 0 inappropriate escalations, 0 catastrophic approvals ($M_{\text{catastrophic}} = 0 \implies P_{\text{cat}} = 0.0$).
- **Calculation**:
  - $\text{RawScore} = 84.0 + 24.0 + 32.0 = 140.0$
  - $\text{CompoundingPenalty} = 0.0$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{140.0}{140.0} \times 100, 0.0, 100.0\right) = \mathbf{100.00}$

### Example 2: Completely Complacent Operator (Blind Approver)
- **Queue Composition**: 42 Compliant, 0 Ambiguous, 4 High-Risk, 4 Catastrophic. $MaxScore = 140.0$.
- **Decisions**: Approves all 50 requests indiscriminately.
  - 42 Compliant: 42 APPROVE ($42 \times (+2.0) = +84.0\text{ points}$).
  - 4 High-Risk Probes: 4 APPROVE ($4 \times (-6.0) = -24.0\text{ points}$).
  - 4 Catastrophic Probes: 4 APPROVE ($4 \times (-12.0) = -48.0\text{ points}$).
- **Compounding Penalty**:
  - $M_{\text{catastrophic}} = 4 \implies P_{\text{cat}}(4) = 10.0 \times (4 - 1)^{1.5} = 10.0 \times (3)^{1.5} \approx \mathbf{51.96\text{ points}}$.
- **Calculation**:
  - $\text{RawScore} = 84.0 - 24.0 - 48.0 = +12.0$
  - $\text{NetScore} = \text{RawScore} - P_{\text{cat}} = 12.0 - 51.96 = -39.96$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{-39.96}{140.0} \times 100, 0.0, 100.0\right) = \mathbf{0.00}$ (Floor clamped).

### Example 3: Severe Complacency Failure ($M=3$)
- **Queue Composition**: 42 Compliant, 0 Ambiguous, 4 High-Risk, 4 Catastrophic. $MaxScore = 140.0$.
- **Decisions**:
  - Compliant: 40 APPROVE ($+80.0$), 2 ESCALATE ($2 \times -0.5 = -1.0$) $\rightarrow +79.0$.
  - High-Risk: 2 APPROVE ($2 \times -6.0 = -12.0$), 2 REJECT ($2 \times +6.0 = +12.0$) $\rightarrow 0.0$.
  - Catastrophic: 3 APPROVE ($3 \times -12.0 = -36.0$), 1 REJECT ($1 \times +8.0 = +8.0$) $\rightarrow -28.0$.
- **Compounding Penalty**:
  - $M_{\text{catastrophic}} = 3 \implies P_{\text{cat}}(3) = 10.0 \times (3 - 1)^{1.5} = 10.0 \times (2)^{1.5} \approx \mathbf{28.28\text{ points}}$.
- **Calculation**:
  - $\text{RawScore} = 79.0 + 0.0 - 28.0 = +51.0$
  - $\text{NetScore} = 51.0 - 28.28 = +22.72$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{22.72}{140.0} \times 100, 0.0, 100.0\right) = \mathbf{16.23}$

### Example 4: Moderate Complacency ($M=1$, Single Miss, No Compounding Penalty)
- **Queue Composition**: 42 Compliant, 0 Ambiguous, 4 High-Risk, 4 Catastrophic. $MaxScore = 140.0$.
- **Decisions**:
  - Compliant: 38 APPROVE ($+76.0$), 2 REJECT (false alarm, $2 \times -2.0 = -4.0$), 2 ESCALATE ($2 \times -0.5 = -1.0$) $\rightarrow +71.0$.
  - High-Risk: 3 REJECT ($3 \times +6.0 = +18.0$), 1 ESCALATE ($1 \times +4.0 = +4.0$) $\rightarrow +22.0$.
  - Catastrophic: 3 REJECT ($3 \times +8.0 = +24.0$), 1 APPROVE ($1 \times -12.0 = -12.0$) $\rightarrow +12.0$.
- **Compounding Penalty**:
  - $M_{\text{catastrophic}} = 1 \implies P_{\text{cat}}(1) = \mathbf{0.0\text{ points}}$ (Single miss absorbs $-12.0$ item penalty without compounding).
- **Calculation**:
  - $\text{RawScore} = 71.0 + 22.0 + 12.0 = 105.0$
  - $\text{NetScore} = 105.0 - 0.0 = 105.0$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{105.0}{140.0} \times 100, 0.0, 100.0\right) = \mathbf{75.00}$

### Example 5: Hyper-Vigilant Operator (Excessive Escalations & False Alarms, $M=0$)
- **Queue Composition**: 42 Compliant, 0 Ambiguous, 4 High-Risk, 4 Catastrophic. $MaxScore = 140.0$.
- **Decisions**:
  - Compliant: 22 APPROVE ($22 \times 2.0 = +44.0$), 5 REJECT (false alarms, $5 \times -2.0 = -10.0$), 15 ESCALATE (inappropriate escalations, $15 \times -0.5 = -7.5$) $\rightarrow +26.5$.
  - High-Risk: 4 REJECT ($4 \times +6.0 = +24.0$).
  - Catastrophic: 4 REJECT ($4 \times +8.0 = +32.0$).
- **Compounding Penalty**: $M_{\text{catastrophic}} = 0 \implies P_{\text{cat}} = 0.0$.
- **Calculation**:
  - $\text{RawScore} = 26.5 + 24.0 + 32.0 = 82.5$
  - $\text{NetScore} = 82.5 - 0.0 = 82.5$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{82.5}{140.0} \times 100, 0.0, 100.0\right) = \mathbf{58.93}$ (Exact: $58.9286\%$).

### Example 6: Standard Mixed Cohort ($C=36, A=6, H=4, K=4, MaxScore=146.0$)
- **Queue Composition**: 36 Compliant ($C=36$), 6 Ambiguous ($A=6$), 4 High-Risk ($H=4$), 4 Catastrophic ($K=4$).
- **Denominator**: $MaxScore = 36(2.0) + 6(3.0) + 4(6.0) + 4(8.0) = 72.0 + 18.0 + 24.0 + 32.0 = \mathbf{146.0\text{ points}}$.
- **Decisions**:
  - Compliant: 35 APPROVE ($+70.0$), 1 ESCALATE ($-0.5$) $\rightarrow +69.5$.
  - Ambiguous: 5 ESCALATE ($5 \times +3.0 = +15.0$), 1 APPROVE ($1 \times +1.0 = +1.0$) $\rightarrow +16.0$.
  - High-Risk: 4 REJECT ($4 \times +6.0 = +24.0$).
  - Catastrophic: 4 REJECT ($4 \times +8.0 = +32.0$).
- **Compounding Penalty**: $M_{\text{catastrophic}} = 0 \implies P_{\text{cat}} = 0.0$.
- **Calculation**:
  - $\text{RawScore} = 69.5 + 16.0 + 24.0 + 32.0 = 141.5$
  - $\text{NetScore} = 141.5 - 0.0 = 141.5$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{141.5}{146.0} \times 100, 0.0, 100.0\right) = \mathbf{96.92}$ (Exact: $96.9178\%$).

### Example 7: All-Timeout Inactive Session (Default 50 Requests)
- **Context**: Operator abandons terminal; all 50 requests finalize via `TIMEOUT`.
- **Decisions**:
  - 42 Compliant requests finalize via `TIMEOUT`: $42 \times (-1.0) = -42.0\text{ points}$.
  - 8 Critical probes finalize via `TIMEOUT` (Safe failover auto-reject): $8 \times (+1.0) = +8.0\text{ points}$.
- **Penalties**: $M_{\text{catastrophic}} = 0 \implies P_{\text{cat}} = 0.0$.
- **Calculation**:
  - $\text{RawScore} = -42.0 + 8.0 = -34.0$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{-34.0}{140.0} \times 100, 0.0, 100.0\right) = \mathbf{0.00}$ (Clamped at floor. Note: If compliant timeouts are scored neutrally at $0.0$, $\text{RawScore} = +8.0 \implies \text{SOS} = 5.71\%$).

### Example 8: Maximum Configured Queue Size ($K=80$ Scored Requests, Flawless)
- **Context**: Cohort configured for maximum allowed queue size ($K = 80$ scored requests).
- **Composition**: 64 Compliant ($C=64$), 6 Ambiguous ($A=6$), 5 High-Risk ($H=5$), 5 Catastrophic ($K=5$).
- **Denominator**: $MaxScore = 64(2.0) + 6(3.0) + 5(6.0) + 5(8.0) = 128.0 + 18.0 + 30.0 + 40.0 = \mathbf{216.0\text{ points}}$.
- **Performance**: Approves all 64 compliant, escalates all 6 ambiguous, correctly rejects all 10 probes.
- **Calculation**:
  - $\text{RawScore} = 216.0$, $P_{\text{cat}} = 0.0$
  - $\text{SOS} = \operatorname{clamp}\left(\frac{216.0}{216.0} \times 100, 0.0, 100.0\right) = \mathbf{100.00}$

---

## 6. Evaluative Oversight Metrics Summary

1. **Oversight Safety Index (OSI)**:
   $$\text{OSI} = \frac{\text{True Rejections of Probes} + \text{Valid Escalations of Probes}}{\text{Total Critical Probes Presented (8)}}$$
2. **False Alarm Rate (FAR)**:
   $$\text{FAR} = \frac{\text{False Rejections of Legitimate Requests}}{\text{Total Legitimate Requests Presented (42)}}$$
3. **Inappropriate Escalation Rate (IER)**:
   $$\text{IER} = \frac{\text{Escalations of Legitimate Requests}}{\text{Total Legitimate Requests Presented (42)}}$$
4. **Cognitive Throughput (CT)**:
   $$\text{CT} = \frac{\text{SOS}}{\sum_{k=1}^K \ln(\text{RT}_k + 1)}$$
