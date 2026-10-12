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

export class SessionStore {
  private sessions: Map<string, ExperimentSession> = new Map();
  private conditionCounter = 0; // For alternating balanced assignment

  constructor() {
    // Seed a default ready-to-use session for instant demos
    this.createSession('DEMO-2026', 50);
  }

  public createSession(sessionCode: string, scoredRequestCount = 50): ExperimentSession {
    const normalizedCode = sessionCode.trim().toUpperCase();
    if (this.sessions.has(normalizedCode)) {
      return this.sessions.get(normalizedCode)!;
    }

    const session: ExperimentSession = {
      sessionCode: normalizedCode,
      status: 'ACTIVE',
      scoredRequestCount,
      createdAt: Date.now(),
      revealUnlocked: false,
      participants: new Map()
    };

    this.sessions.set(normalizedCode, session);
    return session;
  }

  public getSession(sessionCode: string): ExperimentSession | undefined {
    return this.sessions.get(sessionCode.trim().toUpperCase());
  }

  public getAllSessions(): ExperimentSession[] {
    return Array.from(this.sessions.values());
  }

  public joinParticipant(sessionCode: string, alias: string): { participant: ParticipantSession; session: ExperimentSession } {
    let session = this.getSession(sessionCode);
    if (!session) {
      session = this.createSession(sessionCode);
    }

    if (session.status === 'CONCLUDED') {
      throw new Error('This session has already concluded.');
    }

    const participantId = `part-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Balanced Condition & Track assignment
    const count = session.participants.size;
    const condition: ExperimentCondition = (count % 2 === 0) ? 'EXTENDED_REVIEW' : 'REDUCED_REVIEW';
    const track: 1 | 2 = ((Math.floor(count / 2)) % 2 === 0) ? 1 : 2;

    const queue = generateParticipantQueue({
      condition,
      scoredRequestCount: session.scoredRequestCount,
      track
    });

    const participant: ParticipantSession = {
      id: participantId,
      alias: alias.trim() || `Participant-${count + 1}`,
      condition,
      sessionCode: session.sessionCode,
      currentQueueIndex: 1, // Starts at item 1 (Practice 1)
      totalRequests: queue.length,
      practiceCount: 3,
      scoredCount: session.scoredRequestCount,
      queue,
      decisions: new Map(),
      startedAt: Date.now(),
      isWithdrawn: false
    };

    session.participants.set(participantId, participant);
    return { participant, session };
  }

  public getParticipant(sessionCode: string, participantId: string): ParticipantSession | undefined {
    const session = this.getSession(sessionCode);
    if (!session) return undefined;
    return session.participants.get(participantId);
  }

  public getCurrentScenario(sessionCode: string, participantId: string): {
    queueItem: QueueItem | null;
    isCompleted: boolean;
    progress: { current: number; total: number; practiceRemaining: number };
    scoreSummary?: SessionScoringSummary;
  } {
    const participant = this.getParticipant(sessionCode, participantId);
    if (!participant) {
      throw new Error('Participant session not found.');
    }

    if (participant.isWithdrawn) {
      throw new Error('Participant has withdrawn from the study.');
    }

    const total = participant.queue.length;
    const current = participant.currentQueueIndex;

    if (current > total) {
      // Completed!
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

    // Client-safe payload: Scrub server-only ground truth answers to prevent inspection cheat!
    const clientSafeScenario = {
      ...rawItem.scenario,
      // Scrub hidden fields
      optimalAction: undefined as any,
      policyNotes: undefined
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

  public submitDecision(submission: DecisionSubmission): {
    success: boolean;
    isDuplicate: boolean;
    nextScenario: ReturnType<SessionStore['getCurrentScenario']>;
  } {
    const participant = this.getParticipant(submission.sessionCode, submission.participantId);
    if (!participant) {
      throw new Error('Participant session not found.');
    }

    if (participant.isWithdrawn) {
      throw new Error('Participant has withdrawn.');
    }

    // Idempotency Deduplication: Check if this assignment has already been recorded
    if (participant.decisions.has(submission.assignmentId)) {
      return {
        success: true,
        isDuplicate: true,
        nextScenario: this.getCurrentScenario(submission.sessionCode, submission.participantId)
      };
    }

    const currentItem = participant.queue[participant.currentQueueIndex - 1];
    if (!currentItem) {
      throw new Error('Session is already completed.');
    }

    // Record decision
    const sClass = currentItem.scenario.scenarioClass;
    const rawPoints = SCORING_MATRIX[sClass][submission.decision];

    const recorded: RecordedDecision = {
      assignmentId: submission.assignmentId,
      queueIndex: currentItem.queueIndex,
      scenarioClass: sClass,
      decision: submission.decision,
      optimalAction: currentItem.scenario.optimalAction,
      isOptimal: submission.decision === currentItem.scenario.optimalAction,
      dwellTimeMs: Math.max(100, submission.dwellTimeMs || 0),
      submittedAt: Date.now(),
      rawPoints,
      isCatastrophicApproval: sClass === 'CATASTROPHIC_PROBE' && submission.decision === 'APPROVE'
    };

    participant.decisions.set(submission.assignmentId, recorded);
    participant.currentQueueIndex++;

    if (participant.currentQueueIndex > participant.queue.length) {
      participant.completedAt = Date.now();
    }

    return {
      success: true,
      isDuplicate: false,
      nextScenario: this.getCurrentScenario(submission.sessionCode, submission.participantId)
    };
  }

  public withdrawParticipant(sessionCode: string, participantId: string): boolean {
    const participant = this.getParticipant(sessionCode, participantId);
    if (!participant) return false;
    participant.isWithdrawn = true;
    participant.decisions.clear(); // Tombstone & scrub data
    return true;
  }

  public setRevealUnlocked(sessionCode: string, unlocked: boolean): boolean {
    const session = this.getSession(sessionCode);
    if (!session) return false;
    session.revealUnlocked = unlocked;
    return true;
  }

  public setSessionStatus(sessionCode: string, status: ExperimentSession['status']): boolean {
    const session = this.getSession(sessionCode);
    if (!session) return false;
    session.status = status;
    return true;
  }

  public getPresenterSummary(sessionCode: string) {
    const session = this.getSession(sessionCode);
    if (!session) {
      throw new Error(`Session ${sessionCode} not found.`);
    }

    const participants = Array.from(session.participants.values()).filter(p => !p.isWithdrawn);
    const totalEnrolled = participants.length;
    const completed = participants.filter(p => p.currentQueueIndex > p.queue.length);

    const conditionA = participants.filter(p => p.condition === 'EXTENDED_REVIEW');
    const conditionB = participants.filter(p => p.condition === 'REDUCED_REVIEW');

    const getAggregateMetrics = (cohort: ParticipantSession[]) => {
      if (cohort.length === 0) {
        return {
          count: 0,
          completedCount: 0,
          avgScore: 0,
          avgFocalCatchRate: 0,
          avgContextCatchRate: 0,
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
        avgFocalCatchRate: +(focalCatchSum / cohort.length).toFixed(4),
        avgContextCatchRate: +(contextCatchSum / cohort.length).toFixed(4),
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
      overallMetrics: getAggregateMetrics(participants),
      conditionAMetrics: getAggregateMetrics(conditionA),
      conditionBMetrics: getAggregateMetrics(conditionB),
      participantsList: participants.map(p => ({
        id: p.id,
        alias: p.alias,
        condition: p.condition,
        currentProgress: Math.min(p.queue.length, p.currentQueueIndex - 1),
        totalRequests: p.queue.length,
        isCompleted: p.currentQueueIndex > p.queue.length,
        startedAt: p.startedAt,
        completedAt: p.completedAt
      }))
    };
  }
}

// Global Singleton Instance
export const globalSessionStore = new SessionStore();
