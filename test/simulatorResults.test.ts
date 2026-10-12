import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSimulatorResults } from '../server/src/services/simulatorResults.js';
import { ExperimentSession, QueueItem, RecordedDecision } from '../server/src/types.js';

function createMockQueue(cCount: number, aCount: number, hCount: number, kCount: number): QueueItem[] {
  const queue: QueueItem[] = [];
  let index = 1;

  // 3 Practice Items (Unscored)
  for (let i = 0; i < 3; i++) {
    queue.push({
      queueIndex: index++,
      isPractice: true,
      scenario: {
        id: `prac-${i}`,
        templateId: `prac-${i}`,
        title: `Practice ${i}`,
        scenarioClass: 'COMPLIANT_ROUTINE',
        domain: 'INFRASTRUCTURE',
        riskTier: 'LOW',
        isProbe: false,
        aiRecommendation: 'APPROVE',
        aiConfidence: 0.95,
        aiRationale: 'Practice',
        description: 'Practice task',
        parameters: {},
        systemLogs: [],
        optimalAction: 'APPROVE'
      }
    });
  }

  // Helper for scored items
  const addItems = (count: number, sClass: any, isProbe: boolean, probeType?: 'FOCAL' | 'CONTEXT') => {
    for (let i = 0; i < count; i++) {
      queue.push({
        queueIndex: index++,
        isPractice: false,
        scenario: {
          id: `${sClass}-${i}`,
          templateId: `${sClass}-${i}`,
          title: `${sClass} ${i}`,
          scenarioClass: sClass,
          domain: 'FINANCIAL',
          riskTier: isProbe ? (sClass === 'CATASTROPHIC_PROBE' ? 'CATASTROPHIC' : 'HIGH') : 'LOW',
          isProbe,
          probeType,
          aiRecommendation: 'APPROVE',
          aiConfidence: 0.92,
          aiRationale: 'Auto recommendation',
          description: 'Synthetic task',
          parameters: {},
          systemLogs: [],
          optimalAction: sClass === 'COMPLIANT_ROUTINE' ? 'APPROVE' : sClass === 'AMBIGUOUS_ROUTINE' ? 'ESCALATE' : 'REJECT'
        }
      });
    }
  };

  addItems(cCount, 'COMPLIANT_ROUTINE', false);
  addItems(aCount, 'AMBIGUOUS_ROUTINE', false);
  addItems(hCount, 'HIGH_RISK_PROBE', true, 'FOCAL');
  addItems(kCount, 'CATASTROPHIC_PROBE', true, 'FOCAL');

  return queue;
}

describe('Simulator Results Metrics & Dashboard Calculations Suite', () => {

  it('Empty Session: displays "Awaiting real data" and "—" for all 5 cards', () => {
    const emptySession: ExperimentSession = {
      sessionCode: 'EMPTY-2026',
      status: 'ACTIVE',
      scoredRequestCount: 50,
      createdAt: Date.now(),
      revealUnlocked: false,
      participants: new Map()
    };

    const results = computeSimulatorResults(emptySession);

    assert.equal(results.sessionCode, 'EMPTY-2026');
    assert.equal(results.sessionStatus, 'AWAITING_DATA');
    assert.equal(results.totalEnrolled, 0);
    assert.equal(results.totalScoredDecisions, 0);

    // All 5 cards must be in AWAITING_DATA with formattedValue "—"
    const { totalApprovals, correctDecisions, unsafeApprovals, medianDecisionTime, earlyVsLateReview } = results.cards;

    assert.equal(totalApprovals.status, 'AWAITING_DATA');
    assert.equal(totalApprovals.value, null);
    assert.equal(totalApprovals.formattedValue, '—');
    assert.equal(totalApprovals.subtext, 'Awaiting real data');

    assert.equal(correctDecisions.status, 'AWAITING_DATA');
    assert.equal(correctDecisions.value, null);
    assert.equal(correctDecisions.formattedValue, '—');

    assert.equal(unsafeApprovals.status, 'AWAITING_DATA');
    assert.equal(unsafeApprovals.value, null);
    assert.equal(unsafeApprovals.formattedValue, '—');

    assert.equal(medianDecisionTime.status, 'AWAITING_DATA');
    assert.equal(medianDecisionTime.value, null);
    assert.equal(medianDecisionTime.formattedValue, '—');

    assert.equal(earlyVsLateReview.status, 'AWAITING_DATA');
    assert.equal(earlyVsLateReview.value, null);
    assert.equal(earlyVsLateReview.formattedValue, '—');
  });

  it('Practice Request Exclusion: decisions on practice items do not count toward scored metrics', () => {
    const queue = createMockQueue(42, 0, 4, 4);
    const decisions = new Map<string, RecordedDecision>();

    // Participant completes ONLY 3 practice items with APPROVE
    for (let i = 1; i <= 3; i++) {
      decisions.set(`assign-${i}`, {
        assignmentId: `assign-${i}`,
        queueIndex: i,
        decision: 'APPROVE',
        dwellTimeMs: 2500,
        optimalAction: 'APPROVE',
        isOptimal: true,
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: 2.0,
        isCatastrophicApproval: false,
        idempotencyKey: `idem-${i}`
      });
    }

    const session: ExperimentSession = {
      sessionCode: 'PRACTICE-ONLY',
      status: 'ACTIVE',
      scoredRequestCount: 50,
      createdAt: Date.now(),
      revealUnlocked: false,
      participants: new Map([
        ['p1', {
          id: 'p1',
          alias: 'PracticeOp',
          sessionCode: 'PRACTICE-ONLY',
          condition: 'EXTENDED_REVIEW',
          currentQueueIndex: 4,
          startedAt: Date.now(),
          practiceCount: 3,
          scoredCount: 50,
          queue,
          decisions
        }]
      ])
    };

    const results = computeSimulatorResults(session);
    assert.equal(results.totalScoredDecisions, 0, 'Practice decisions must be strictly excluded');
    assert.equal(results.cards.totalApprovals.status, 'AWAITING_DATA');
    assert.equal(results.cards.medianDecisionTime.status, 'AWAITING_DATA');
  });

  it('Total Approvals & Correct Decisions: correctly handles ambiguous escalation and probe rejection', () => {
    // 20 compliant, 10 ambiguous, 5 high-risk, 5 catastrophic = 40 scored items
    const queue = createMockQueue(20, 10, 5, 5);
    const decisions = new Map<string, RecordedDecision>();

    let assignId = 4;
    // 1. Compliant items (indices 4..23): 20 items. Participant approves all 20.
    for (let i = 0; i < 20; i++) {
      decisions.set(`assign-${assignId}`, {
        assignmentId: `assign-${assignId}`,
        queueIndex: assignId,
        decision: 'APPROVE',
        dwellTimeMs: 2000,
        optimalAction: 'APPROVE',
        isOptimal: true,
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: 2.0,
        isCatastrophicApproval: false,
        idempotencyKey: `idem-${assignId}`
      });
      assignId++;
    }

    // 2. Ambiguous items (indices 24..33): 10 items. Participant escalates 8, approves 2.
    for (let i = 0; i < 10; i++) {
      const decision = i < 8 ? 'ESCALATE' : 'APPROVE';
      decisions.set(`assign-${assignId}`, {
        assignmentId: `assign-${assignId}`,
        queueIndex: assignId,
        decision,
        dwellTimeMs: 4000,
        optimalAction: 'ESCALATE',
        isOptimal: decision === 'ESCALATE',
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: decision === 'ESCALATE' ? 3.0 : 1.0,
        isCatastrophicApproval: false,
        idempotencyKey: `idem-${assignId}`
      });
      assignId++;
    }

    // 3. High-Risk probes (indices 34..38): 5 items. Participant rejects 4, approves 1 (unsafe).
    for (let i = 0; i < 5; i++) {
      const decision = i < 4 ? 'REJECT' : 'APPROVE';
      decisions.set(`assign-${assignId}`, {
        assignmentId: `assign-${assignId}`,
        queueIndex: assignId,
        decision,
        dwellTimeMs: 3000,
        optimalAction: 'REJECT',
        isOptimal: decision === 'REJECT',
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: decision === 'REJECT' ? 6.0 : -6.0,
        isCatastrophicApproval: false,
        idempotencyKey: `idem-${assignId}`
      });
      assignId++;
    }

    // 4. Catastrophic probes (indices 39..43): 5 items. Participant rejects 3, escalates 1 (safe catch), approves 1 (unsafe catastrophic).
    for (let i = 0; i < 5; i++) {
      let decision: any = 'REJECT';
      if (i === 3) decision = 'ESCALATE';
      if (i === 4) decision = 'APPROVE';

      decisions.set(`assign-${assignId}`, {
        assignmentId: `assign-${assignId}`,
        queueIndex: assignId,
        decision,
        dwellTimeMs: 3500,
        optimalAction: 'REJECT',
        isOptimal: decision === 'REJECT',
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: decision === 'APPROVE' ? -12.0 : 8.0,
        isCatastrophicApproval: decision === 'APPROVE',
        idempotencyKey: `idem-${assignId}`
      });
      assignId++;
    }

    const session: ExperimentSession = {
      sessionCode: 'TEST-SCORING',
      status: 'ACTIVE',
      scoredRequestCount: 40,
      createdAt: Date.now(),
      revealUnlocked: false,
      participants: new Map([
        ['p1', {
          id: 'p1',
          alias: 'TestOp',
          sessionCode: 'TEST-SCORING',
          condition: 'EXTENDED_REVIEW',
          currentQueueIndex: 44,
          startedAt: Date.now(),
          practiceCount: 3,
          scoredCount: 40,
          queue,
          decisions
        }]
      ])
    };

    const results = computeSimulatorResults(session);
    assert.equal(results.totalScoredDecisions, 40);

    // Total approvals: 20 compliant + 2 ambiguous + 1 high-risk + 1 catastrophic = 24
    assert.equal(results.cards.totalApprovals.value, 24);
    assert.equal(results.cards.totalApprovals.status, 'AVAILABLE');
    assert.equal(results.cards.totalApprovals.formattedValue, '24');

    // Correct decisions:
    // - Compliant: 20 approved = 20
    // - Ambiguous: 8 escalated = 8 (appropriate escalation)
    // - High-risk: 4 rejected = 4
    // - Catastrophic: 3 rejected + 1 escalated catch = 4
    // Total correct = 20 + 8 + 4 + 4 = 36 out of 40 (90%)
    assert.equal(results.cards.correctDecisions.value, 36);
    assert.equal(results.cards.correctDecisions.status, 'AVAILABLE');

    // Unsafe approvals: 1 high-risk + 1 catastrophic = 2
    assert.equal(results.cards.unsafeApprovals.value, 2);
    assert.equal(results.cards.unsafeApprovals.status, 'AVAILABLE');
    assert.equal(results.cards.unsafeApprovals.details?.catastrophicApprovals, 1);
    assert.equal(results.cards.unsafeApprovals.details?.highRiskApprovals, 1);
  });

  it('Median Decision Time: calculates true median and filters negative/zero/null values', () => {
    const queue = createMockQueue(10, 0, 0, 0);
    const decisions = new Map<string, RecordedDecision>();

    // Durations: [1000, 2000, 3000, 4000, 5000] ms -> Median = 3000 ms = 3.0s
    // Also include invalid values: [0, -500, NaN]
    const testDurations = [5000, 1000, 3000, 0, -500, 4000, 2000];

    testDurations.forEach((dwellTimeMs, idx) => {
      const qIdx = idx + 4;
      decisions.set(`assign-${qIdx}`, {
        assignmentId: `assign-${qIdx}`,
        queueIndex: qIdx,
        decision: 'APPROVE',
        dwellTimeMs,
        optimalAction: 'APPROVE',
        isOptimal: true,
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: 2.0,
        isCatastrophicApproval: false,
        idempotencyKey: `idem-${qIdx}`
      });
    });

    const session: ExperimentSession = {
      sessionCode: 'TEST-TIME',
      status: 'ACTIVE',
      scoredRequestCount: 10,
      createdAt: Date.now(),
      revealUnlocked: false,
      participants: new Map([
        ['p1', {
          id: 'p1',
          alias: 'TimeOp',
          sessionCode: 'TEST-TIME',
          condition: 'EXTENDED_REVIEW',
          currentQueueIndex: 11,
          startedAt: Date.now(),
          practiceCount: 3,
          scoredCount: 10,
          queue,
          decisions
        }]
      ])
    };

    const results = computeSimulatorResults(session);
    // 5 valid positive durations: 1000, 2000, 3000, 4000, 5000
    // Median is 3000 ms -> 3.0s
    assert.equal(results.cards.medianDecisionTime.status, 'AVAILABLE');
    assert.equal(results.cards.medianDecisionTime.value, 3.0);
    assert.equal(results.cards.medianDecisionTime.formattedValue, '3s');
    assert.equal(results.cards.medianDecisionTime.unit, 'seconds');
    assert.equal(results.cards.medianDecisionTime.details?.validObservations, 5);
  });

  it('Early vs. Late Review: correctly compares probe catch rate across sequence windows', () => {
    // 50-item scored queue with focal probes at positions [9, 21, 33, 45]
    // Queue indices: 3 practice + scored
    // Focal Probe 1: scored 9 -> queueIndex 12 (Early: <= 25)
    // Focal Probe 2: scored 21 -> queueIndex 24 (Early: <= 25)
    // Focal Probe 3: scored 33 -> queueIndex 36 (Late: > 25)
    // Focal Probe 4: scored 45 -> queueIndex 48 (Late: > 25)
    const queue: QueueItem[] = [];
    for (let i = 1; i <= 53; i++) {
      const isPractice = i <= 3;
      const scoredPos = isPractice ? 0 : i - 3;
      const isFocal = [9, 21, 33, 45].includes(scoredPos);

      queue.push({
        queueIndex: i,
        isPractice,
        scenario: {
          id: `scen-${i}`,
          templateId: `scen-${i}`,
          title: `Scenario ${i}`,
          scenarioClass: isFocal ? 'HIGH_RISK_PROBE' : 'COMPLIANT_ROUTINE',
          domain: 'INFRASTRUCTURE',
          riskTier: isFocal ? 'HIGH' : 'LOW',
          isProbe: isFocal,
          probeType: isFocal ? 'FOCAL' : undefined,
          aiRecommendation: 'APPROVE',
          aiConfidence: 0.95,
          aiRationale: 'R',
          description: 'D',
          parameters: {},
          systemLogs: [],
          optimalAction: isFocal ? 'REJECT' : 'APPROVE'
        }
      });
    }

    const decisions = new Map<string, RecordedDecision>();

    // Early Probes:
    // Probe 1 (pos 9, queueIndex 12) -> CAUGHT (REJECT)
    // Probe 2 (pos 21, queueIndex 24) -> CAUGHT (REJECT)
    // Early Catch Rate = 2/2 = 100%

    // Late Probes:
    // Probe 3 (pos 33, queueIndex 36) -> MISSED / COMPLACENT (APPROVE)
    // Probe 4 (pos 45, queueIndex 48) -> CAUGHT (ESCALATE)
    // Late Catch Rate = 1/2 = 50%

    for (const q of queue) {
      if (q.isPractice) continue;
      const scoredPos = q.queueIndex - 3;
      let decision: any = 'APPROVE';
      if (scoredPos === 9) decision = 'REJECT';
      if (scoredPos === 21) decision = 'REJECT';
      if (scoredPos === 33) decision = 'APPROVE'; // complacent miss
      if (scoredPos === 45) decision = 'ESCALATE'; // catch

      decisions.set(`assign-${q.queueIndex}`, {
        assignmentId: `assign-${q.queueIndex}`,
        queueIndex: q.queueIndex,
        decision,
        dwellTimeMs: 2500,
        optimalAction: q.scenario.optimalAction,
        isOptimal: decision === q.scenario.optimalAction,
        submittedAt: Date.now(),
        clientTimestamp: Date.now(),
        rawPoints: 2.0,
        isCatastrophicApproval: false,
        idempotencyKey: `idem-${q.queueIndex}`
      });
    }

    const session: ExperimentSession = {
      sessionCode: 'TEST-EARLY-LATE',
      status: 'CONCLUDED',
      scoredRequestCount: 50,
      createdAt: Date.now(),
      revealUnlocked: false,
      participants: new Map([
        ['p1', {
          id: 'p1',
          alias: 'VigilanceTester',
          sessionCode: 'TEST-EARLY-LATE',
          condition: 'EXTENDED_REVIEW',
          currentQueueIndex: 54,
          startedAt: Date.now(),
          practiceCount: 3,
          scoredCount: 50,
          queue,
          decisions
        }]
      ])
    };

    const results = computeSimulatorResults(session);
    const card = results.cards.earlyVsLateReview;

    assert.equal(card.status, 'AVAILABLE');
    assert.equal(card.details?.earlyCatchRate, 100.0);
    assert.equal(card.details?.lateCatchRate, 50.0);
    // Delta = 50.0 - 100.0 = -50.0%
    assert.equal(card.details?.signedDifference, -50.0);
    assert.equal(card.details?.absoluteDifference, 50.0);
    assert.equal(card.formattedValue, '-50%');
  });

});
