import pg from 'pg';
import {
  ExperimentCondition,
  ExperimentSession,
  ParticipantSession,
  RecordedDecision,
  DecisionSubmission,
  SessionScoringSummary,
  QueueItem
} from '../types.js';
import { generateParticipantQueue } from './sequenceGenerator.js';
import { computeSessionScore, SCORING_MATRIX } from './scoringEngine.js';

export interface PostgresStoreOptions {
  connectionString?: string;
  ssl?: boolean | pg.PoolConfig['ssl'];
  pool?: pg.Pool;
}

export class PostgresSessionStore {
  private pool: pg.Pool;
  private isInitialized = false;

  constructor(options?: PostgresStoreOptions) {
    if (options?.pool) {
      this.pool = options.pool;
    } else {
      const connStr = options?.connectionString || process.env.DATABASE_URL;
      if (!connStr) {
        throw new Error('PostgresSessionStore requires a connection string or DATABASE_URL environment variable.');
      }

      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      let sslConfig: boolean | pg.PoolConfig['ssl'] = false;

      if (options?.ssl !== undefined) {
        sslConfig = options.ssl;
      } else if (process.env.DATABASE_SSL === 'true') {
        sslConfig = { rejectUnauthorized: false };
      } else if (process.env.DATABASE_SSL === 'false') {
        sslConfig = false;
      } else if (isProduction && !connStr.includes('localhost') && !connStr.includes('127.0.0.1')) {
        sslConfig = { rejectUnauthorized: false };
      }

      this.pool = new pg.Pool({
        connectionString: connStr,
        ssl: sslConfig,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Table 1: Experiment Sessions
      await client.query(`
        CREATE TABLE IF NOT EXISTS aiocc_sessions (
          session_code VARCHAR(64) PRIMARY KEY,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          scored_request_count INT NOT NULL DEFAULT 50,
          created_at BIGINT NOT NULL,
          reveal_unlocked BOOLEAN NOT NULL DEFAULT FALSE
        );
      `);

      // Table 2: Participants
      await client.query(`
        CREATE TABLE IF NOT EXISTS aiocc_participants (
          id VARCHAR(64) PRIMARY KEY,
          session_code VARCHAR(64) NOT NULL REFERENCES aiocc_sessions(session_code) ON DELETE CASCADE,
          alias VARCHAR(128) NOT NULL,
          condition VARCHAR(32) NOT NULL,
          current_queue_index INT NOT NULL DEFAULT 1,
          total_requests INT NOT NULL,
          practice_count INT NOT NULL DEFAULT 3,
          scored_count INT NOT NULL DEFAULT 50,
          queue_json JSONB NOT NULL,
          started_at BIGINT NOT NULL,
          completed_at BIGINT,
          is_withdrawn BOOLEAN NOT NULL DEFAULT FALSE
        );
      `);

      // Table 3: Decisions (Append-only with strict idempotency constraints)
      await client.query(`
        CREATE TABLE IF NOT EXISTS aiocc_decisions (
          id SERIAL PRIMARY KEY,
          session_code VARCHAR(64) NOT NULL REFERENCES aiocc_sessions(session_code) ON DELETE CASCADE,
          participant_id VARCHAR(64) NOT NULL REFERENCES aiocc_participants(id) ON DELETE CASCADE,
          assignment_id VARCHAR(64) NOT NULL,
          queue_index INT NOT NULL,
          scenario_class VARCHAR(64) NOT NULL,
          decision VARCHAR(32) NOT NULL,
          optimal_action VARCHAR(32) NOT NULL,
          is_optimal BOOLEAN NOT NULL,
          dwell_time_ms INT NOT NULL,
          submitted_at BIGINT NOT NULL,
          raw_points INT NOT NULL,
          is_catastrophic_approval BOOLEAN NOT NULL,
          idempotency_key VARCHAR(128) NOT NULL,
          CONSTRAINT uq_aiocc_part_assign UNIQUE (participant_id, assignment_id),
          CONSTRAINT uq_aiocc_part_idempotency UNIQUE (participant_id, idempotency_key)
        );
      `);

      // Indexes for rapid lookups and concurrent joins
      await client.query(`CREATE INDEX IF NOT EXISTS idx_aiocc_part_session ON aiocc_participants(session_code);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_aiocc_dec_part ON aiocc_decisions(participant_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_aiocc_dec_session ON aiocc_decisions(session_code);`);

      // Seed default DEMO-2026 session if not present
      await client.query(`
        INSERT INTO aiocc_sessions (session_code, status, scored_request_count, created_at, reveal_unlocked)
        VALUES ('DEMO-2026', 'ACTIVE', 50, $1, FALSE)
        ON CONFLICT (session_code) DO NOTHING;
      `, [Date.now()]);

      await client.query('COMMIT');
      this.isInitialized = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async createSession(sessionCode: string, scoredRequestCount = 50): Promise<ExperimentSession> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const now = Date.now();

    const res = await this.pool.query(
      `INSERT INTO aiocc_sessions (session_code, status, scored_request_count, created_at, reveal_unlocked)
       VALUES ($1, 'ACTIVE', $2, $3, FALSE)
       ON CONFLICT (session_code) DO UPDATE SET session_code = EXCLUDED.session_code
       RETURNING *;`,
      [normalizedCode, scoredRequestCount, now]
    );

    const row = res.rows[0];
    return {
      sessionCode: row.session_code,
      status: row.status,
      scoredRequestCount: row.scored_request_count,
      createdAt: Number(row.created_at),
      revealUnlocked: row.reveal_unlocked,
      participants: new Map()
    };
  }

  public async getSession(sessionCode: string): Promise<ExperimentSession | undefined> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const sessRes = await this.pool.query(
      'SELECT * FROM aiocc_sessions WHERE session_code = $1',
      [normalizedCode]
    );
    if (sessRes.rows.length === 0) return undefined;

    const sRow = sessRes.rows[0];
    const partRes = await this.pool.query(
      'SELECT * FROM aiocc_participants WHERE session_code = $1 ORDER BY started_at ASC',
      [normalizedCode]
    );

    const decRes = await this.pool.query(
      'SELECT * FROM aiocc_decisions WHERE session_code = $1 ORDER BY queue_index ASC',
      [normalizedCode]
    );

    // Group decisions by participant_id
    const decMap = new Map<string, Map<string, RecordedDecision>>();
    for (const d of decRes.rows) {
      if (!decMap.has(d.participant_id)) {
        decMap.set(d.participant_id, new Map());
      }
      decMap.get(d.participant_id)!.set(d.assignment_id, {
        assignmentId: d.assignment_id,
        queueIndex: d.queue_index,
        scenarioClass: d.scenario_class,
        decision: d.decision,
        optimalAction: d.optimal_action,
        isOptimal: d.is_optimal,
        dwellTimeMs: d.dwell_time_ms,
        submittedAt: Number(d.submitted_at),
        rawPoints: d.raw_points,
        isCatastrophicApproval: d.is_catastrophic_approval
      });
    }

    const participants = new Map<string, ParticipantSession>();
    for (const p of partRes.rows) {
      const queue = typeof p.queue_json === 'string' ? JSON.parse(p.queue_json) : p.queue_json;
      participants.set(p.id, {
        id: p.id,
        alias: p.alias,
        condition: p.condition,
        sessionCode: p.session_code,
        currentQueueIndex: p.current_queue_index,
        totalRequests: p.total_requests,
        practiceCount: p.practice_count,
        scoredCount: p.scored_count,
        queue,
        decisions: decMap.get(p.id) || new Map(),
        startedAt: Number(p.started_at),
        completedAt: p.completed_at ? Number(p.completed_at) : undefined,
        isWithdrawn: p.is_withdrawn
      });
    }

    return {
      sessionCode: sRow.session_code,
      status: sRow.status,
      scoredRequestCount: sRow.scored_request_count,
      createdAt: Number(sRow.created_at),
      revealUnlocked: sRow.reveal_unlocked,
      participants
    };
  }

  public async getAllSessions(): Promise<ExperimentSession[]> {
    const res = await this.pool.query('SELECT session_code FROM aiocc_sessions ORDER BY created_at DESC');
    const sessions: ExperimentSession[] = [];
    for (const row of res.rows) {
      const s = await this.getSession(row.session_code);
      if (s) sessions.push(s);
    }
    return sessions;
  }

  public async joinParticipant(sessionCode: string, alias: string): Promise<{ participant: ParticipantSession; session: ExperimentSession }> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch or create session
      let sessRes = await client.query(
        'SELECT * FROM aiocc_sessions WHERE session_code = $1 FOR UPDATE',
        [normalizedCode]
      );

      if (sessRes.rows.length === 0) {
        await client.query(
          `INSERT INTO aiocc_sessions (session_code, status, scored_request_count, created_at, reveal_unlocked)
           VALUES ($1, 'ACTIVE', 50, $2, FALSE);`,
          [normalizedCode, Date.now()]
        );
        sessRes = await client.query(
          'SELECT * FROM aiocc_sessions WHERE session_code = $1 FOR UPDATE',
          [normalizedCode]
        );
      }

      const sessionRow = sessRes.rows[0];
      if (sessionRow.status === 'CONCLUDED') {
        throw new Error('This session has already concluded.');
      }

      // 2. Count existing participants for balanced alternating assignment
      const countRes = await client.query(
        'SELECT COUNT(*) FROM aiocc_participants WHERE session_code = $1',
        [normalizedCode]
      );
      const count = parseInt(countRes.rows[0].count, 10);
      const condition: ExperimentCondition = (count % 2 === 0) ? 'EXTENDED_REVIEW' : 'REDUCED_REVIEW';
      const track: 1 | 2 = ((Math.floor(count / 2)) % 2 === 0) ? 1 : 2;

      // 3. Generate queue using canonical generator
      const queue = generateParticipantQueue({
        condition,
        scoredRequestCount: sessionRow.scored_request_count,
        track
      });

      const participantId = `part-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const aliasName = alias.trim() || `Participant-${count + 1}`;
      const startedAt = Date.now();

      await client.query(
        `INSERT INTO aiocc_participants 
         (id, session_code, alias, condition, current_queue_index, total_requests, practice_count, scored_count, queue_json, started_at, is_withdrawn)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE);`,
        [
          participantId,
          normalizedCode,
          aliasName,
          condition,
          1,
          queue.length,
          3,
          sessionRow.scored_request_count,
          JSON.stringify(queue),
          startedAt
        ]
      );

      await client.query('COMMIT');

      const participant: ParticipantSession = {
        id: participantId,
        alias: aliasName,
        condition,
        sessionCode: normalizedCode,
        currentQueueIndex: 1,
        totalRequests: queue.length,
        practiceCount: 3,
        scoredCount: sessionRow.scored_request_count,
        queue,
        decisions: new Map(),
        startedAt,
        isWithdrawn: false
      };

      const session: ExperimentSession = {
        sessionCode: normalizedCode,
        status: sessionRow.status,
        scoredRequestCount: sessionRow.scored_request_count,
        createdAt: Number(sessionRow.created_at),
        revealUnlocked: sessionRow.reveal_unlocked,
        participants: new Map([[participantId, participant]])
      };

      return { participant, session };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getParticipant(sessionCode: string, participantId: string): Promise<ParticipantSession | undefined> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const partRes = await this.pool.query(
      'SELECT * FROM aiocc_participants WHERE id = $1 AND session_code = $2',
      [participantId, normalizedCode]
    );
    if (partRes.rows.length === 0) return undefined;

    const pRow = partRes.rows[0];
    const decRes = await this.pool.query(
      'SELECT * FROM aiocc_decisions WHERE participant_id = $1 ORDER BY queue_index ASC',
      [participantId]
    );

    const decisions = new Map<string, RecordedDecision>();
    for (const d of decRes.rows) {
      decisions.set(d.assignment_id, {
        assignmentId: d.assignment_id,
        queueIndex: d.queue_index,
        scenarioClass: d.scenario_class,
        decision: d.decision,
        optimalAction: d.optimal_action,
        isOptimal: d.is_optimal,
        dwellTimeMs: d.dwell_time_ms,
        submittedAt: Number(d.submitted_at),
        rawPoints: d.raw_points,
        isCatastrophicApproval: d.is_catastrophic_approval
      });
    }

    const queue: QueueItem[] = typeof pRow.queue_json === 'string' ? JSON.parse(pRow.queue_json) : pRow.queue_json;

    return {
      id: pRow.id,
      alias: pRow.alias,
      condition: pRow.condition,
      sessionCode: pRow.session_code,
      currentQueueIndex: pRow.current_queue_index,
      totalRequests: pRow.total_requests,
      practiceCount: pRow.practice_count,
      scoredCount: pRow.scored_count,
      queue,
      decisions,
      startedAt: Number(pRow.started_at),
      completedAt: pRow.completed_at ? Number(pRow.completed_at) : undefined,
      isWithdrawn: pRow.is_withdrawn
    };
  }

  public async getCurrentScenario(sessionCode: string, participantId: string): Promise<{
    queueItem: QueueItem | null;
    isCompleted: boolean;
    progress: { current: number; total: number; practiceRemaining: number };
    scoreSummary?: SessionScoringSummary;
  }> {
    const participant = await this.getParticipant(sessionCode, participantId);
    if (!participant) {
      throw new Error('Participant session not found.');
    }
    if (participant.isWithdrawn) {
      throw new Error('Participant has withdrawn from the study.');
    }

    const total = participant.queue.length;
    const current = participant.currentQueueIndex;

    if (current > total) {
      const scoreSummary = computeSessionScore(participant.queue, participant.decisions);
      return {
        queueItem: null,
        isCompleted: true,
        progress: { current: total, total, practiceRemaining: 0 },
        scoreSummary
      };
    }

    const rawItem = participant.queue[current - 1];
    const practiceRemaining = Math.max(0, participant.practiceCount - current + 1);

    // Client-safe payload: Scrub server-only ground truth
    const clientSafeScenario: any = {
      id: rawItem.scenario.id,
      templateId: rawItem.scenario.templateId,
      title: rawItem.scenario.title,
      domain: rawItem.scenario.domain,
      riskTier: rawItem.scenario.riskTier,
      aiRecommendation: rawItem.scenario.aiRecommendation,
      aiConfidence: rawItem.scenario.aiConfidence,
      aiRationale: rawItem.scenario.aiRationale,
      description: rawItem.scenario.description,
      parameters: rawItem.scenario.parameters,
      systemLogs: rawItem.scenario.systemLogs
    };

    const clientItem: QueueItem = {
      queueIndex: rawItem.queueIndex,
      isPractice: rawItem.isPractice,
      scenario: clientSafeScenario
    };

    return {
      queueItem: clientItem,
      isCompleted: false,
      progress: { current, total, practiceRemaining }
    };
  }

  public async submitDecision(submission: DecisionSubmission): Promise<{
    success: boolean;
    isDuplicate: boolean;
    nextScenario: any;
  }> {
    const normalizedCode = submission.sessionCode.trim().toUpperCase();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Lock participant row
      const partRes = await client.query(
        'SELECT * FROM aiocc_participants WHERE id = $1 AND session_code = $2 FOR UPDATE',
        [submission.participantId, normalizedCode]
      );

      if (partRes.rows.length === 0) {
        throw new Error('Participant session not found.');
      }

      const pRow = partRes.rows[0];
      if (pRow.is_withdrawn) {
        throw new Error('Participant has withdrawn.');
      }

      // 2. Check Idempotency
      const existingDec = await client.query(
        'SELECT * FROM aiocc_decisions WHERE participant_id = $1 AND (assignment_id = $2 OR idempotency_key = $3)',
        [submission.participantId, submission.assignmentId, submission.idempotencyKey]
      );

      if (existingDec.rows.length > 0) {
        await client.query('COMMIT');
        return {
          success: true,
          isDuplicate: true,
          nextScenario: await this.getCurrentScenario(normalizedCode, submission.participantId)
        };
      }

      // 3. Sequence & Assignment Validation
      if (submission.queueIndex !== pRow.current_queue_index) {
        throw new Error(`Sequence mismatch: Submitted queueIndex ${submission.queueIndex} does not match current active queueIndex ${pRow.current_queue_index}`);
      }

      const expectedAssignmentId = `assign-${pRow.current_queue_index}`;
      if (submission.assignmentId !== expectedAssignmentId) {
        throw new Error(`Assignment mismatch: Submitted assignmentId ${submission.assignmentId} does not match expected ${expectedAssignmentId}`);
      }

      const queue: QueueItem[] = typeof pRow.queue_json === 'string' ? JSON.parse(pRow.queue_json) : pRow.queue_json;
      const currentItem = queue[pRow.current_queue_index - 1];
      if (!currentItem) {
        throw new Error('Session is already completed.');
      }

      // 4. Score Calculation
      const sClass = currentItem.scenario.scenarioClass;
      const rawPoints = SCORING_MATRIX[sClass][submission.decision];
      const isOptimal = submission.decision === currentItem.scenario.optimalAction;
      const isCatastrophicApproval = sClass === 'CATASTROPHIC_PROBE' && submission.decision === 'APPROVE';
      const dwellTimeMs = Math.max(100, Math.min(3600000, submission.dwellTimeMs || 0));
      const submittedAt = Date.now();

      // 5. Insert Decision
      await client.query(
        `INSERT INTO aiocc_decisions
         (session_code, participant_id, assignment_id, queue_index, scenario_class, decision, optimal_action, is_optimal, dwell_time_ms, submitted_at, raw_points, is_catastrophic_approval, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);`,
        [
          normalizedCode,
          submission.participantId,
          submission.assignmentId,
          currentItem.queueIndex,
          sClass,
          submission.decision,
          currentItem.scenario.optimalAction,
          isOptimal,
          dwellTimeMs,
          submittedAt,
          rawPoints,
          isCatastrophicApproval,
          submission.idempotencyKey
        ]
      );

      // 6. Advance Queue Index
      const nextIndex = pRow.current_queue_index + 1;
      const completedAt = nextIndex > queue.length ? submittedAt : null;
      await client.query(
        'UPDATE aiocc_participants SET current_queue_index = $1, completed_at = $2 WHERE id = $3',
        [nextIndex, completedAt, submission.participantId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        isDuplicate: false,
        nextScenario: await this.getCurrentScenario(normalizedCode, submission.participantId)
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async withdrawParticipant(sessionCode: string, participantId: string): Promise<boolean> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        'UPDATE aiocc_participants SET is_withdrawn = TRUE WHERE id = $1 AND session_code = $2',
        [participantId, normalizedCode]
      );
      if (res.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      // Scrub decisions for ethical withdrawal
      await client.query('DELETE FROM aiocc_decisions WHERE participant_id = $1', [participantId]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async setRevealUnlocked(sessionCode: string, unlocked: boolean): Promise<boolean> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const res = await this.pool.query(
      'UPDATE aiocc_sessions SET reveal_unlocked = $1 WHERE session_code = $2',
      [unlocked, normalizedCode]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async setSessionStatus(sessionCode: string, status: ExperimentSession['status']): Promise<boolean> {
    const normalizedCode = sessionCode.trim().toUpperCase();
    const res = await this.pool.query(
      'UPDATE aiocc_sessions SET status = $1 WHERE session_code = $2',
      [status, normalizedCode]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async getPresenterSummary(sessionCode: string) {
    const session = await this.getSession(sessionCode);
    if (!session) {
      throw new Error(`Session ${sessionCode} not found.`);
    }

    const participants = Array.from(session.participants.values()).filter(p => !p.isWithdrawn);
    const totalEnrolled = participants.length;
    const completed = participants.filter(p => p.currentQueueIndex > p.queue.length);

    const conditionA = participants.filter(p => p.condition === 'EXTENDED_REVIEW');
    const conditionB = participants.filter(p => p.condition === 'REDUCED_REVIEW');

    const isRevealed = Boolean(session.revealUnlocked);

    const getAggregateMetrics = (cohort: ParticipantSession[], maskProbeRates: boolean = false) => {
      if (cohort.length === 0) {
        return {
          count: 0,
          completedCount: 0,
          avgScore: 0,
          avgFocalCatchRate: maskProbeRates ? null : 0,
          avgContextCatchRate: maskProbeRates ? null : 0,
          totalCatastrophicApprovals: 0
        };
      }

      let scoreSum = 0;
      let focalCatchSum = 0;
      let contextCatchSum = 0;
      let catAppSum = 0;

      for (const p of cohort) {
        const summary = computeSessionScore(p.queue, p.decisions);
        scoreSum += summary.simulationOversightScore;
        focalCatchSum += summary.focalProbeCatchRate;
        contextCatchSum += summary.contextProbeCatchRate;
        catAppSum += summary.catastrophicApprovalCount;
      }

      return {
        count: cohort.length,
        completedCount: cohort.filter(p => p.currentQueueIndex > p.queue.length).length,
        avgScore: +(scoreSum / cohort.length).toFixed(2),
        avgFocalCatchRate: maskProbeRates ? null : +(focalCatchSum / cohort.length).toFixed(4),
        avgContextCatchRate: maskProbeRates ? null : +(contextCatchSum / cohort.length).toFixed(4),
        totalCatastrophicApprovals: catAppSum
      };
    };

    return {
      sessionCode: session.sessionCode,
      status: session.status,
      scoredRequestCount: session.scoredRequestCount,
      revealUnlocked: session.revealUnlocked,
      totalEnrolled,
      completedCount: completed.length,
      overallMetrics: getAggregateMetrics(participants, !isRevealed),
      conditionAMetrics: isRevealed ? getAggregateMetrics(conditionA, false) : null,
      conditionBMetrics: isRevealed ? getAggregateMetrics(conditionB, false) : null,
      participantsList: participants.map(p => ({
        id: p.id,
        alias: p.alias,
        condition: isRevealed ? p.condition : 'MASKED',
        currentProgress: Math.min(p.queue.length, p.currentQueueIndex - 1),
        totalRequests: p.queue.length,
        isCompleted: p.currentQueueIndex > p.queue.length,
        startedAt: p.startedAt,
        completedAt: p.completedAt
      }))
    };
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
