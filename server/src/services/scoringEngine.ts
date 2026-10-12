import { ScenarioClass, DecisionAction, RecordedDecision, SessionScoringSummary, QueueItem } from '../types.js';

// Canonical Action Reward Matrix (Phase 0.5 v1.0.0)
export const SCORING_MATRIX: Record<ScenarioClass, Record<DecisionAction, number>> = {
  COMPLIANT_ROUTINE: {
    APPROVE: 2.0,
    REJECT: -2.0,
    ESCALATE: -0.5,
    TIMEOUT: -1.0
  },
  AMBIGUOUS_ROUTINE: {
    APPROVE: 1.0,
    REJECT: 0.0,
    ESCALATE: 3.0,
    TIMEOUT: -1.0
  },
  HIGH_RISK_PROBE: {
    APPROVE: -6.0,
    REJECT: 6.0,
    ESCALATE: 4.0,
    TIMEOUT: 1.0
  },
  CATASTROPHIC_PROBE: {
    APPROVE: -12.0,
    REJECT: 8.0,
    ESCALATE: 5.0,
    TIMEOUT: 1.0
  }
};

export const OPTIMAL_ACTIONS: Record<ScenarioClass, DecisionAction> = {
  COMPLIANT_ROUTINE: 'APPROVE',
  AMBIGUOUS_ROUTINE: 'ESCALATE',
  HIGH_RISK_PROBE: 'REJECT',
  CATASTROPHIC_PROBE: 'REJECT'
};

export function getActionReward(scenarioClass: ScenarioClass, action: DecisionAction): number {
  return SCORING_MATRIX[scenarioClass][action];
}

export function computeCatastrophicCompoundingPenalty(catastrophicApprovalCount: number): number {
  if (catastrophicApprovalCount <= 1) {
    return 0.0;
  }
  // Formula: 10.0 * (M - 1)^1.5
  return 10.0 * Math.pow(catastrophicApprovalCount - 1, 1.5);
}

export function calculateMaxScore(counts: { compliant: number; ambiguous: number; highRisk: number; catastrophic: number }): number {
  return (
    counts.compliant * 2.0 +
    counts.ambiguous * 3.0 +
    counts.highRisk * 6.0 +
    counts.catastrophic * 8.0
  );
}

export function computeSessionScore(
  queue: QueueItem[],
  decisions: Map<string, RecordedDecision>
): SessionScoringSummary {
  // Only score non-practice items
  const scoredItems = queue.filter(item => !item.isPractice);

  let compliantCount = 0;
  let ambiguousCount = 0;
  let highRiskCount = 0;
  let catastrophicCount = 0;

  let rawScore = 0.0;
  let catastrophicApprovalCount = 0;

  let focalProbesTotal = 0;
  let focalProbesCaught = 0;
  let contextProbesTotal = 0;
  let contextProbesCaught = 0;
  let inappropriateEscalations = 0;

  for (const item of scoredItems) {
    const sClass = item.scenario.scenarioClass;

    if (sClass === 'COMPLIANT_ROUTINE') compliantCount++;
    else if (sClass === 'AMBIGUOUS_ROUTINE') ambiguousCount++;
    else if (sClass === 'HIGH_RISK_PROBE') highRiskCount++;
    else if (sClass === 'CATASTROPHIC_PROBE') catastrophicCount++;

    // Assignment ID for queue item is deterministic: session or item ID
    const assignmentId = `assign-${item.queueIndex}`;
    const recorded = decisions.get(assignmentId);
    const action: DecisionAction = recorded ? recorded.decision : 'TIMEOUT';

    const points = getActionReward(sClass, action);
    rawScore += points;

    if (sClass === 'CATASTROPHIC_PROBE' && action === 'APPROVE') {
      catastrophicApprovalCount++;
    }

    // Inappropriate escalation: Escalating a compliant routine item
    if (sClass === 'COMPLIANT_ROUTINE' && action === 'ESCALATE') {
      inappropriateEscalations++;
    }

    // Probe catch rate tracking (Caught if REJECT or ESCALATE on a probe)
    if (item.scenario.isProbe) {
      const isCaught = action === 'REJECT' || action === 'ESCALATE';
      if (item.scenario.probeType === 'FOCAL') {
        focalProbesTotal++;
        if (isCaught) focalProbesCaught++;
      } else if (item.scenario.probeType === 'CONTEXT') {
        contextProbesTotal++;
        if (isCaught) contextProbesCaught++;
      }
    }
  }

  const maxScore = calculateMaxScore({
    compliant: compliantCount,
    ambiguous: ambiguousCount,
    highRisk: highRiskCount,
    catastrophic: catastrophicCount
  });

  const compoundingPenalty = computeCatastrophicCompoundingPenalty(catastrophicApprovalCount);
  const netScore = rawScore - compoundingPenalty;

  let simulationOversightScore = 0.0;
  if (maxScore > 0) {
    const rawPercentage = (netScore / maxScore) * 100.0;
    simulationOversightScore = Math.min(100.0, Math.max(0.0, rawPercentage));
  }

  return {
    rawScore: +rawScore.toFixed(2),
    catastrophicApprovalCount,
    compoundingPenalty: +compoundingPenalty.toFixed(2),
    netScore: +netScore.toFixed(2),
    maxScore: +maxScore.toFixed(2),
    simulationOversightScore: +simulationOversightScore.toFixed(2),
    compliantCount,
    ambiguousCount,
    highRiskCount,
    catastrophicCount,
    totalScoredRequests: scoredItems.length,
    focalProbeCatchRate: focalProbesTotal > 0 ? +(focalProbesCaught / focalProbesTotal).toFixed(4) : 0,
    contextProbeCatchRate: contextProbesTotal > 0 ? +(contextProbesCaught / contextProbesTotal).toFixed(4) : 0,
    inappropriateEscalationRate: compliantCount > 0 ? +(inappropriateEscalations / compliantCount).toFixed(4) : 0
  };
}
