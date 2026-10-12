# AI Operations Control Center — API Contract & Interface Specification

## 1. Global Standards & Conventions

### 1.1 Base URLs & Versioning
- **API Base Path**: `/api/v1`
- **Transport**: HTTPS strictly enforced. Clear-text HTTP returns `301 Moved Permanently`.
- **Payload Format**: `application/json` (UTF-8).
- **Date & Time**: ISO 8601 strings with timezone offset (e.g., `2026-10-12T09:15:00.000Z`).

### 1.2 Authentication Schemes
1. **Participant Authentication**:
   - Header: `Authorization: Bearer ptok_<hex64>`
   - Generated during session initialization. Valid for the duration of the cohort session.
   - Hashed using SHA-256 before storage in `participants.session_token_hash`.
2. **Presenter / Admin Authentication**:
   - Header: `Authorization: Bearer eyJhbGciOi...` (Signed JWT)
   - Issued upon credential verification (`admin_accounts`).
   - Claims: `{ sub: "uuid", role: "EXPERIMENTER" | "SUPERADMIN", exp: 1776000000 }`.

### 1.3 Standard Error Format (RFC 7807 Compliant)
Every non-2xx HTTP response returns a standardized JSON problem payload:
```json
{
  "type": "https://aiocc.internal/errors/VALIDATION_ERROR",
  "title": "Invalid Request Body",
  "status": 400,
  "detail": "Field 'decision' must be one of: APPROVE, REJECT, ESCALATE, MODIFY",
  "instance": "/api/v1/participant/decisions",
  "invalidParams": [
    { "name": "decision", "reason": "Unsupported value provided" }
  ]
}
```

---

## 2. Participant API Specification

### 2.1 `POST /api/v1/participant/session/init`
Enrolls a participant into an active cohort and initializes their deterministic queue (3 practice + 50 scored).

- **Auth**: None (Public endpoint with IP rate-limiting).
- **Request Body**:
  ```json
  {
    "cohortCode": "EXP-FALL2026-A",
    "pseudonym": "Participant_42"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "sessionToken": "ptok_9f83ab412c914efda38012b184ef4a65492bc7190",
    "participantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "participantCode": "PT-A-042",
    "assignedCondition": "EXTENDED_REVIEW", // "EXTENDED_REVIEW" or "REDUCED_REVIEW"
    "practiceScenarios": 3,
    "totalScoredScenarios": 50,
    "scenarioTimeoutSeconds": 180,
    "cohortStatus": "ACTIVE",
    "catalogVersion": "v1.0.0",
    "scoringVersion": "v1.0.0"
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Cohort code does not exist.
  - `409 Conflict`: Cohort is full (`target_size` reached) or registration is closed.

---

### 2.2 `GET /api/v1/participant/session/state`
Enables seamless reconnection on page refresh or browser restart.

- **Auth**: Bearer Participant Token.
- **Request Headers**: `Authorization: Bearer ptok_...`
- **Response `200 OK`**:
  ```json
  {
    "participantCode": "PT-A-042",
    "status": "IN_PROGRESS", // "REGISTERED", "PRACTICE", "IN_PROGRESS", "COMPLETED"
    "assignedCondition": "EXTENDED_REVIEW",
    "isPractice": false,
    "currentSequenceIndex": 14,
    "totalScoredScenarios": 50,
    "practiceScenarios": 3,
    "cohortStatus": "ACTIVE",
    "activeAssignmentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "elapsedTimeSeconds": 34
  }
  ```

---

### 2.3 `GET /api/v1/participant/queue/current`
Fetches the currently active operational request for the participant. **Server-side scrubbing guarantees zero ground-truth data is leaked. Both conditions receive the identical payload schema.**

- **Auth**: Bearer Participant Token.
- **Response `200 OK`**:
  ```json
  {
    "assignmentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "isPractice": false,
    "sequenceNumber": 14,
    "totalInPhase": 50,
    "remainingTimeSeconds": 146,
    "scenario": {
      "id": "e4b2d139-3831-419b-a083-d02f06830501",
      "slug": "s3-bucket-acl-world-readable",
      "catalogVersion": "v1.0.0",
      "domain": "SECOPS",
      "difficulty": "MEDIUM",
      "riskTier": "HIGH",
      "title": "Automated S3 Public Bucket Remediation",
      "agentId": "SecBot-Audit-09",
      "agentType": "CloudSecurityRemediator",
      "aiConfidence": 94,
      "aiRationale": "Bucket 'finance-exports-raw' was flagged for external exposure. Automated policy recommends applying ACL update 'public-read-write' to normalize partner ingestion endpoints.",
      "targetResource": "arn:aws:s3:::finance-exports-raw",
      "executionPlan": {
        "actionType": "S3:PutBucketAcl",
        "commandOrPayload": {
          "Bucket": "finance-exports-raw",
          "ACL": "public-read-write"
        },
        "parameters": {
          "GrantFullControl": false,
          "Region": "us-east-1"
        }
      },
      "contextLogs": [
        {
          "timestamp": "2026-10-12T09:12:01Z",
          "level": "WARN",
          "source": "AWSCloudTrail",
          "message": "Policy violation event: Unrestricted bucket ACL requested by service principal."
        }
      ],
      "applicablePolicies": [
        {
          "code": "POL-DATA-002",
          "title": "Prohibition of World-Readable Cloud Storage",
          "summary": "No corporate bucket containing transactional or financial records may permit public ACLs under any circumstances.",
          "clauseMarkdown": "Under Enterprise Security Standard Sec-8.1..."
        }
      ]
    }
  }
  ```
- **Response `204 No Content`**: All assigned scenarios have been completed.

---

### 2.4 `POST /api/v1/participant/decisions`
Submits the human operator's decision for the active scenario. Protected by mandatory idempotency. Identical schema across both conditions.

- **Auth**: Bearer Participant Token.
- **Request Headers**:
  - `Authorization: Bearer ptok_...`
  - `Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d` (UUID v4)
- **Request Body**:
  ```json
  {
    "assignmentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "decision": "REJECT", // "APPROVE" | "REJECT" | "ESCALATE" | "MODIFY"
    "confidenceLevel": 4, // 1 to 5 integer
    "rationale": "Proposed action sets ACL to public-read-write which directly violates POL-DATA-002.",
    "modifiedPayload": null, // Present only if decision === "MODIFY"
    "timeToFirstActionMs": 14200,
    "totalDecisionTimeMs": 48310,
    "clientEpochMs": 1776001234567
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "status": "RECORDED",
    "isPractice": false,
    "completedIndex": 14,
    "totalScoredScenarios": 50,
    "hasMoreScenarios": true
  }
  ```
- **Response `200 OK`** (If retried with existing `Idempotency-Key`):
  ```json
  {
    "status": "ALREADY_RECORDED",
    "isPractice": false,
    "completedIndex": 14,
    "totalScoredScenarios": 50,
    "hasMoreScenarios": true
  }
  ```

---

### 2.5 `POST /api/v1/participant/telemetry/batch`
Flushes batched interaction telemetry from the browser client to the server.

- **Auth**: Bearer Participant Token.
- **Request Body**:
  ```json
  {
    "assignmentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "events": [
      {
        "eventType": "POLICY_TAB_OPEN",
        "clientEpochMs": 1776001210000,
        "payload": { "tab": "POL-DATA-002" }
      },
      {
        "eventType": "SCROLL_LOGS",
        "clientEpochMs": 1776001230000,
        "payload": { "scrollTop": 240, "maxScroll": 480 }
      }
    ]
  }
  ```
- **Response `202 Accepted`**:
  ```json
  { "ingestedCount": 2 }
  ```

---

### 2.6 `POST /api/v1/participant/session/withdraw`
Enables participant to exercise voluntary withdrawal. Tombstones device metadata and excludes participant from research scoring.

- **Auth**: Bearer Participant Token.
- **Request Body**:
  ```json
  {
    "reason": "voluntary_withdrawal"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "status": "WITHDRAWN",
    "message": "Your session has been terminated and your behavioral data has been tombstoned from analysis."
  }
  ```

---

### 2.7 `GET /api/v1/participant/session/stream` (Server-Sent Events)
Live orchestration channel. Notifies participants when the cohort is paused, resumed, or terminated by the presenter.

- **Auth**: Bearer Participant Token (via query param `?token=ptok_...` or EventSource header polyfill).
- **Stream Event Types**:
  - `event: COHORT_PAUSE` $\rightarrow$ `data: { "reason": "Experimenter announcement" }`
  - `event: COHORT_RESUME` $\rightarrow$ `data: {}`
  - `event: COHORT_TERMINATE` $\rightarrow$ `data: { "message": "Experiment concluded" }`

---

## 3. Presenter / Admin API Specification

### 3.1 `POST /api/v1/admin/auth/login`
- **Request Body**:
  ```json
  {
    "username": "lead_researcher",
    "password": "CorrectHorseBatteryStaple!2026"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 28800,
    "user": { "username": "lead_researcher", "role": "EXPERIMENTER" }
  }
  ```

---

### 3.2 `POST /api/v1/admin/cohorts`
Creates a new experimental session.

- **Auth**: Bearer Admin JWT.
- **Request Body**:
  ```json
  {
    "cohortCode": "EXP-TEMSCON-2026-B1",
    "name": "TEMSCON 2026 Session 1",
    "targetSize": 200,
    "masterSeed": 987654,
    "catalogVersion": "v1.0.0",
    "scoringVersion": "v1.0.0",
    "scenarioCount": 50, // Range: 30 to 80 (default: 50)
    "scenarioTimeoutSeconds": 180,
    "conditionAssignmentMode": "BALANCED" // "BALANCED", "ALL_EXTENDED", "ALL_REDUCED"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "cohortId": "91a8df9e-2134-4bc1-90a1-7e8e19c3b88d",
    "cohortCode": "EXP-TEMSCON-2026-B1",
    "status": "DRAFT"
  }
  ```

---

### 3.3 `PATCH /api/v1/admin/cohorts/:cohortId/status`
Controls the experiment lifecycle state machine.

- **Auth**: Bearer Admin JWT.
- **Request Body**:
  ```json
  {
    "status": "ACTIVE" // "REGISTRATION_OPEN" | "ACTIVE" | "PAUSED" | "COMPLETED"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "cohortId": "91a8df9e-2134-4bc1-90a1-7e8e19c3b88d",
    "status": "ACTIVE",
    "transitionedAt": "2026-10-12T09:20:00Z"
  }
  ```

---

### 3.4 `GET /api/v1/admin/cohorts/:cohortId/metrics`
Fetches sanitized real-time telemetry metrics for the presenter screen. **Preserves scientific unblinding protocol (no individual answer correctness leaked during active session).**

- **Auth**: Bearer Admin JWT.
- **Response `200 OK`**:
  ```json
  {
    "cohortId": "91a8df9e-2134-4bc1-90a1-7e8e19c3b88d",
    "enrolledParticipants": 194,
    "activeParticipants": 188,
    "completedParticipants": 12,
    "withdrawnParticipants": 2,
    "conditionDistribution": {
      "EXTENDED_REVIEW": 97,
      "REDUCED_REVIEW": 97
    },
    "averageProgressPercent": 42.5,
    "globalMeanDecisionTimeMs": 41200,
    "scenariosSubmittedTotal": 4120
  }
  ```

---

### 3.5 `GET /api/v1/admin/cohorts/:cohortId/export`
Exports the complete, unblinded research dataset for post-experiment scientific analysis (SPSS / R / Python Pandas ready). Excludes withdrawn participants.

- **Auth**: Bearer Admin JWT.
- **Query Params**: `format=json` (default) or `format=csv`.
- **Response `200 OK`**:
  ```json
  {
    "cohort": {
      "code": "EXP-TEMSCON-2026-B1",
      "seed": 987654,
      "catalogVersion": "v1.0.0",
      "scoringVersion": "v1.0.0",
      "scoredScenarioCount": 50,
      "startTime": "2026-10-12T09:20:00Z",
      "endTime": "2026-10-12T09:55:00Z"
    },
    "participants": [
      {
        "participantCode": "PT-A-001",
        "condition": "EXTENDED_REVIEW",
        "scores": {
          "scoringVersion": "v1.0.0",
          "rawPoints": 105.0,
          "theoreticalMaxPoints": 140.0,
          "simulationOversightScore": 75.0,
          "accuracyPct": 88.0,
          "oversightSafetyIndex": 0.875,
          "falseAlarmRate": 0.047,
          "inappropriateEscalationRate": 0.047,
          "catastrophicApprovals": 0,
          "meanRtMs": 42100
        },
        "decisions": [
          {
            "scenarioSlug": "s3-bucket-acl-world-readable",
            "isPractice": false,
            "sequenceOrder": 1,
            "decision": "REJECT",
            "isCorrect": true,
            "isCatastrophicApproval": false,
            "decisionTimeMs": 38400,
            "confidenceLevel": 4
          }
        ]
      }
    ]
  }
  ```
