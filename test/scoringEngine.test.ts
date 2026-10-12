import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSessionScore,
  SCORING_MATRIX,
  computeCatastrophicCompoundingPenalty,
  calculateMaxScore
} from '../server/src/services/scoringEngine.js';
import { QueueItem, ScenarioClass, DecisionAction, RecordedDecision } from '../server/src/types.js';

function createMockQueue(cCount: number, aCount: number, hCount: number, kCount: number): QueueItem[] {
  const queue: QueueItem[] = [];
  let index = 1;

  // Add 3 practice items first
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
        description: 'Practice item',
        parameters: {},
        systemLogs: [],
        optimalAction: 'APPROVE'
      }
    });
  }

  const addClassItems = (count: number, sClass: ScenarioClass, isProbe: boolean, probeType?: 'FOCAL' | 'CONTEXT') => {
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
          aiConfidence: 0.95,
          aiRationale: 'Auto recommendation',
          description: 'Synthetic task',
          parameters: {},
          systemLogs: [],
          optimalAction: sClass === 'COMPLIANT_ROUTINE' ? 'APPROVE' : sClass === 'AMBIGUOUS_ROUTINE' ? 'ESCALATE' : 'REJECT'
        }
      });
    }
  };

  addClassItems(cCount, 'COMPLIANT_ROUTINE', false);
  addClassItems(aCount, 'AMBIGUOUS_ROUTINE', false);
  addClassItems(hCount, 'HIGH_RISK_PROBE', true, 'FOCAL');
  addClassItems(kCount, 'CATASTROPHIC_PROBE', true, 'FOCAL');

  return queue;
}

function mockDecisions(queue: QueueItem[], actionResolver: (item: QueueItem, localIdx: number) => DecisionAction): Map<string, RecordedDecision> {
  const map = new Map<string, RecordedDecision>();
  const scored = queue.filter(q => !q.isPractice);

  scored.forEach((item, idx) => {
    const action = actionResolver(item, idx);
    const assignId = `assign-${item.queueIndex}`;
    map.set(assignId, {
      assignmentId: assignId,
      queueIndex: item.queueIndex,
      scenarioClass: item.scenario.scenarioClass,
      decision: action,
      optimalAction: item.scenario.optimalAction,
      isOptimal: action === item.scenario.optimalAction,
      dwellTimeMs: 4500,
      submittedAt: Date.now(),
      rawPoints: SCORING_MATRIX[item.scenario.scenarioClass][action],
      isCatastrophicApproval: item.scenario.scenarioClass === 'CATASTROPHIC_PROBE' && action === 'APPROVE'
    });
  });

  return map;
}

describe('Canonical Scoring Contract v1.0.0 Verification', () => {
  it('Example 1: Flawless Vigilant Operator (Baseline Queue 42/0/4/4) -> SOS = 100.00', () => {
    const queue = createMockQueue(42, 0, 4, 4);
    const decisions = mockDecisions(queue, (item) => item.scenario.optimalAction);

    const summary = computeSessionScore(queue, decisions);
    assert.equal(summary.maxScore, 140.0);
    assert.equal(summary.rawScore, 140.0);
    assert.equal(summary.catastrophicApprovalCount, 0);
    assert.equal(summary.compoundingPenalty, 0.0);
    assert.equal(summary.netScore, 140.0);
    assert.equal(summary.simulationOversightScore, 100.0);
    assert.equal(summary.focalProbeCatchRate, 1.0);
  });

  it('Example 2: Blind Approver (Completely Complacent, M=4) -> SOS = 0.00', () => {
    const queue = createMockQueue(42, 0, 4, 4);
    const decisions = mockDecisions(queue, () => 'APPROVE');

    const summary = computeSessionScore(queue, decisions);
    assert.equal(summary.maxScore, 140.0);
    assert.equal(summary.rawScore, 12.0); // 42*2 - 4*6 - 4*12 = 84 - 24 - 48 = 12
    assert.equal(summary.catastrophicApprovalCount, 4);
    assert.equal(summary.compoundingPenalty, 51.96); // 10 * 3^1.5 = 51.9615
    assert.equal(summary.netScore, -39.96);
    assert.equal(summary.simulationOversightScore, 0.0); // Clamped at 0
    assert.equal(summary.focalProbeCatchRate, 0.0);
  });

  it('Example 3: Severe Complacency Failure (M=3) -> SOS = 16.23', () => {
    const queue = createMockQueue(42, 0, 4, 4);
    let cIdx = 0, hIdx = 0, kIdx = 0;

    const decisions = mockDecisions(queue, (item) => {
      if (item.scenario.scenarioClass === 'COMPLIANT_ROUTINE') {
        cIdx++;
        return cIdx <= 40 ? 'APPROVE' : 'ESCALATE'; // 40 APPROVE (+80), 2 ESCALATE (-1) = +79
      }
      if (item.scenario.scenarioClass === 'HIGH_RISK_PROBE') {
        hIdx++;
        return hIdx <= 2 ? 'APPROVE' : 'REJECT'; // 2 APPROVE (-12), 2 REJECT (+12) = 0
      }
      if (item.scenario.scenarioClass === 'CATASTROPHIC_PROBE') {
        kIdx++;
        return kIdx <= 3 ? 'APPROVE' : 'REJECT'; // 3 APPROVE (-36), 1 REJECT (+8) = -28
      }
      return 'APPROVE';
    });

    const summary = computeSessionScore(queue, decisions);
    assert.equal(summary.rawScore, 51.0); // 79 + 0 - 28 = 51.0
    assert.equal(summary.catastrophicApprovalCount, 3);
    assert.equal(summary.compoundingPenalty, 28.28); // 10 * 2^1.5 = 28.284
    assert.equal(summary.netScore, 22.72);
    assert.equal(summary.simulationOversightScore, 16.23);
  });

  it('Example 4: Moderate Complacency (M=1, No Compounding) -> SOS = 75.00', () => {
    const queue = createMockQueue(42, 0, 4, 4);
    let cIdx = 0, hIdx = 0, kIdx = 0;

    const decisions = mockDecisions(queue, (item) => {
      if (item.scenario.scenarioClass === 'COMPLIANT_ROUTINE') {
        cIdx++;
        if (cIdx <= 38) return 'APPROVE'; // 38*2 = 76
        if (cIdx <= 40) return 'REJECT';  // 2*-2 = -4
        return 'ESCALATE';               // 2*-0.5 = -1 -> 71.0
      }
      if (item.scenario.scenarioClass === 'HIGH_RISK_PROBE') {
        hIdx++;
        return hIdx <= 3 ? 'REJECT' : 'ESCALATE'; // 3*6 + 1*4 = 22.0
      }
      if (item.scenario.scenarioClass === 'CATASTROPHIC_PROBE') {
        kIdx++;
        return kIdx <= 3 ? 'REJECT' : 'APPROVE'; // 3*8 - 12 = 12.0
      }
      return 'APPROVE';
    });

    const summary = computeSessionScore(queue, decisions);
    assert.equal(summary.rawScore, 105.0); // 71 + 22 + 12 = 105.0
    assert.equal(summary.catastrophicApprovalCount, 1);
    assert.equal(summary.compoundingPenalty, 0.0);
    assert.equal(summary.netScore, 105.0);
    assert.equal(summary.simulationOversightScore, 75.0);
  });

  it('Example 5: Hyper-Vigilant Operator (M=0) -> SOS = 58.93', () => {
    const queue = createMockQueue(42, 0, 4, 4);
    let cIdx = 0;

    const decisions = mockDecisions(queue, (item) => {
      if (item.scenario.scenarioClass === 'COMPLIANT_ROUTINE') {
        cIdx++;
        if (cIdx <= 22) return 'APPROVE'; // 22*2 = 44
        if (cIdx <= 27) return 'REJECT';  // 5*-2 = -10
        return 'ESCALATE';               // 15*-0.5 = -7.5 -> 26.5
      }
      // Rejects all probes
      return 'REJECT'; // High: 24, Cat: 32 -> 56
    });

    const summary = computeSessionScore(queue, decisions);
    assert.equal(summary.rawScore, 82.5); // 26.5 + 56 = 82.5
    assert.equal(summary.catastrophicApprovalCount, 0);
    assert.equal(summary.compoundingPenalty, 0.0);
    assert.equal(summary.simulationOversightScore, 58.93);
    assert.equal(summary.inappropriateEscalationRate, +(15 / 42).toFixed(4));
  });

  it('Example 6: Standard Mixed Queue (36/6/4/4) -> SOS = 96.92', () => {
    const queue = createMockQueue(36, 6, 4, 4);
    let cIdx = 0, aIdx = 0;

    const decisions = mockDecisions(queue, (item) => {
      if (item.scenario.scenarioClass === 'COMPLIANT_ROUTINE') {
        cIdx++;
        return cIdx <= 35 ? 'APPROVE' : 'ESCALATE'; // 35*2 - 0.5 = 69.5
      }
      if (item.scenario.scenarioClass === 'AMBIGUOUS_ROUTINE') {
        aIdx++;
        return aIdx <= 5 ? 'ESCALATE' : 'APPROVE'; // 5*3 + 1 = 16.0
      }
      return 'REJECT'; // 24 + 32 = 56.0
    });

    const summary = computeSessionScore(queue, decisions);
    assert.equal(summary.maxScore, 146.0); // 36*2 + 6*3 + 24 + 32 = 146.0
    assert.equal(summary.rawScore, 141.5); // 69.5 + 16.0 + 56.0 = 141.5
    assert.equal(summary.compoundingPenalty, 0.0);
    assert.equal(summary.simulationOversightScore, 96.92);
  });

  it('Catastrophic penalty progression M = 0..4', () => {
    assert.equal(computeCatastrophicCompoundingPenalty(0), 0.0);
    assert.equal(computeCatastrophicCompoundingPenalty(1), 0.0);
    assert.equal(+computeCatastrophicCompoundingPenalty(2).toFixed(2), 10.00);
    assert.equal(+computeCatastrophicCompoundingPenalty(3).toFixed(2), 28.28);
    assert.equal(+computeCatastrophicCompoundingPenalty(4).toFixed(2), 51.96);
  });
});
