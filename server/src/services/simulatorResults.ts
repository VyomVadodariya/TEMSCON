import { ExperimentSession, QueueItem, RecordedDecision } from '../types.js';

export type MetricState = 'AWAITING_DATA' | 'INSUFFICIENT_DATA' | 'AVAILABLE';

export interface MetricCardData<T = number | string> {
  title: string;
  value: T | null; // null indicates awaiting data / missing, renders as "—"
  formattedValue: string; // e.g. "—", "24", "87.5%", "2.8s", "Δ -35.0%"
  unit?: string;
  status: MetricState;
  subtext: string;
  details?: Record<string, any>;
}

export interface SimulatorResultsSummary {
  sessionCode: string;
  sessionStatus: 'AWAITING_DATA' | 'IN_PROGRESS' | 'RESULTS_AVAILABLE';
  totalEnrolled: number;
  completedCount: number;
  totalScoredDecisions: number;
  scoredRequestCount: number;
  cards: {
    totalApprovals: MetricCardData<number>;
    correctDecisions: MetricCardData<number>;
    unsafeApprovals: MetricCardData<number>;
    medianDecisionTime: MetricCardData<number>;
    earlyVsLateReview: MetricCardData<number | string>;
  };
  metadata: {
    practiceExcluded: boolean;
    serverAuthoritative: boolean;
    calculatedAt: number;
    earlyWindowPositions: string; // e.g. "Scored 1–25"
    lateWindowPositions: string;  // e.g. "Scored 26–50"
  };
}

export function computeSimulatorResults(session: ExperimentSession): SimulatorResultsSummary {
  const sessionCode = session.sessionCode;
  const scoredRequestCount = session.scoredRequestCount || 50;
  const halfWindow = Math.floor(scoredRequestCount / 2); // 25 for 50

  const participants = Array.from(session.participants.values()).filter(p => !p.isWithdrawn);
  const totalEnrolled = participants.length;
  const completedCount = participants.filter(p => p.currentQueueIndex > p.queue.length).length;

  interface ScoredDecisionContext {
    participantId: string;
    queueIndex: number;
    scoredPosition: number;
    decision: RecordedDecision;
    item: QueueItem;
  }

  const scoredDecisions: ScoredDecisionContext[] = [];

  for (const p of participants) {
    for (const [, decision] of p.decisions.entries()) {
      const item = p.queue.find(q => q.queueIndex === decision.queueIndex);
      if (!item) continue;
      // Strictly exclude practice items (queueIndex <= practiceCount or isPractice)
      if (item.isPractice || decision.queueIndex <= p.practiceCount) {
        continue;
      }
      const scoredPosition = decision.queueIndex - p.practiceCount;
      scoredDecisions.push({
        participantId: p.id,
        queueIndex: decision.queueIndex,
        scoredPosition,
        decision,
        item
      });
    }
  }

  const totalScoredDecisions = scoredDecisions.length;

  // 1. Total Approvals (Scored Only)
  let totalApprovalsCard: MetricCardData<number>;
  if (totalScoredDecisions === 0) {
    totalApprovalsCard = {
      title: 'Total Approvals',
      value: null,
      formattedValue: '—',
      status: 'AWAITING_DATA',
      subtext: 'Awaiting real data',
      details: { approvedCount: 0, totalScoredDecisions: 0, approvalRate: null }
    };
  } else {
    const approvedCount = scoredDecisions.filter(d => d.decision.decision === 'APPROVE').length;
    const approvalRate = +(approvedCount / totalScoredDecisions).toFixed(4);
    totalApprovalsCard = {
      title: 'Total Approvals',
      value: approvedCount,
      formattedValue: `${approvedCount}`,
      status: 'AVAILABLE',
      subtext: `${approvedCount} of ${totalScoredDecisions} scored decisions (${(approvalRate * 100).toFixed(1)}%)`,
      details: { approvedCount, totalScoredDecisions, approvalRate }
    };
  }

  // 2. Correct Decisions (Server Ground Truth & Approved Scoring Contract)
  // - COMPLIANT_ROUTINE: APPROVE
  // - AMBIGUOUS_ROUTINE: ESCALATE (Appropriate investigation)
  // - HIGH_RISK_PROBE: REJECT or ESCALATE (Defensive catch)
  // - CATASTROPHIC_PROBE: REJECT or ESCALATE (Defensive catch)
  let correctDecisionsCard: MetricCardData<number>;
  if (totalScoredDecisions === 0) {
    correctDecisionsCard = {
      title: 'Correct Decisions',
      value: null,
      formattedValue: '—',
      status: 'AWAITING_DATA',
      subtext: 'Awaiting real data',
      details: { correctCount: 0, totalScoredDecisions: 0, accuracyRate: null }
    };
  } else {
    const isDecisionCorrect = (d: ScoredDecisionContext): boolean => {
      const sClass = d.item.scenario.scenarioClass;
      const act = d.decision.decision;
      if (sClass === 'COMPLIANT_ROUTINE') return act === 'APPROVE';
      if (sClass === 'AMBIGUOUS_ROUTINE') return act === 'ESCALATE';
      if (sClass === 'HIGH_RISK_PROBE') return act === 'REJECT' || act === 'ESCALATE';
      if (sClass === 'CATASTROPHIC_PROBE') return act === 'REJECT' || act === 'ESCALATE';
      return act === d.item.scenario.optimalAction;
    };

    const correctCount = scoredDecisions.filter(isDecisionCorrect).length;
    const accuracyRate = +(correctCount / totalScoredDecisions).toFixed(4);
    correctDecisionsCard = {
      title: 'Correct Decisions',
      value: correctCount,
      formattedValue: `${correctCount}`,
      status: 'AVAILABLE',
      subtext: `${correctCount} of ${totalScoredDecisions} policy-aligned decisions (${(accuracyRate * 100).toFixed(1)}%)`,
      details: { correctCount, totalScoredDecisions, accuracyRate }
    };
  }

  // 3. Unsafe Approvals (High-Risk & Catastrophic Probes Approved)
  let unsafeApprovalsCard: MetricCardData<number>;
  const probeDecisions = scoredDecisions.filter(
    d => d.item.scenario.scenarioClass === 'HIGH_RISK_PROBE' || d.item.scenario.scenarioClass === 'CATASTROPHIC_PROBE'
  );

  if (probeDecisions.length === 0) {
    unsafeApprovalsCard = {
      title: 'Unsafe Approvals',
      value: null,
      formattedValue: '—',
      status: 'AWAITING_DATA',
      subtext: 'Awaiting real data (No probe encounters)',
      details: { unsafeApprovals: 0, probeEncounters: 0, catastrophicApprovals: 0, highRiskApprovals: 0 }
    };
  } else {
    const catastrophicApprovals = probeDecisions.filter(
      d => d.item.scenario.scenarioClass === 'CATASTROPHIC_PROBE' && d.decision.decision === 'APPROVE'
    ).length;
    const highRiskApprovals = probeDecisions.filter(
      d => d.item.scenario.scenarioClass === 'HIGH_RISK_PROBE' && d.decision.decision === 'APPROVE'
    ).length;
    const unsafeApprovals = catastrophicApprovals + highRiskApprovals;

    unsafeApprovalsCard = {
      title: 'Unsafe Approvals',
      value: unsafeApprovals,
      formattedValue: `${unsafeApprovals}`,
      status: 'AVAILABLE',
      subtext: `${unsafeApprovals} of ${probeDecisions.length} probe encounters (${catastrophicApprovals} catastrophic, ${highRiskApprovals} high-risk)`,
      details: {
        unsafeApprovals,
        probeEncounters: probeDecisions.length,
        catastrophicApprovals,
        highRiskApprovals,
        unsafeRate: +(unsafeApprovals / probeDecisions.length).toFixed(4)
      }
    };
  }

  // 4. Median Decision Time (Filtered Valid Positive Dwell Times in Seconds)
  let medianDecisionTimeCard: MetricCardData<number>;
  const validDwellTimesMs: number[] = scoredDecisions
    .map(d => d.decision.dwellTimeMs)
    .filter((ms): ms is number => typeof ms === 'number' && !isNaN(ms) && ms > 0 && ms <= 3600000);

  if (validDwellTimesMs.length === 0) {
    medianDecisionTimeCard = {
      title: 'Median Decision Time',
      value: null,
      formattedValue: '—',
      unit: 'seconds',
      status: 'AWAITING_DATA',
      subtext: 'Awaiting real data',
      details: { validObservations: 0, excludedRecords: scoredDecisions.length }
    };
  } else {
    validDwellTimesMs.sort((a, b) => a - b);
    const n = validDwellTimesMs.length;
    const medianMs = n % 2 === 1
      ? validDwellTimesMs[(n - 1) / 2]
      : (validDwellTimesMs[n / 2 - 1] + validDwellTimesMs[n / 2]) / 2;
    const medianSec = +(medianMs / 1000).toFixed(1);

    medianDecisionTimeCard = {
      title: 'Median Decision Time',
      value: medianSec,
      formattedValue: `${medianSec}s`,
      unit: 'seconds',
      status: 'AVAILABLE',
      subtext: `Median across ${n} valid observations (Range: ${(validDwellTimesMs[0] / 1000).toFixed(1)}s – ${(validDwellTimesMs[n - 1] / 1000).toFixed(1)}s)`,
      details: {
        medianSeconds: medianSec,
        validObservations: n,
        minSeconds: +(validDwellTimesMs[0] / 1000).toFixed(1),
        maxSeconds: +(validDwellTimesMs[n - 1] / 1000).toFixed(1)
      }
    };
  }

  // 5. Early vs. Late Review (Focal Probe Catch Rate: Early [1..halfWindow] vs Late [(halfWindow+1)..K])
  let earlyVsLateCard: MetricCardData<number | string>;
  const earlyFocalProbes = scoredDecisions.filter(
    d => d.scoredPosition <= halfWindow && d.item.scenario.isProbe && d.item.scenario.probeType === 'FOCAL'
  );
  const lateFocalProbes = scoredDecisions.filter(
    d => d.scoredPosition > halfWindow && d.item.scenario.isProbe && d.item.scenario.probeType === 'FOCAL'
  );

  const isProbeCaught = (d: ScoredDecisionContext) => d.decision.decision === 'REJECT' || d.decision.decision === 'ESCALATE';

  if (earlyFocalProbes.length === 0 && lateFocalProbes.length === 0) {
    earlyVsLateCard = {
      title: 'Early vs. Late Review',
      value: null,
      formattedValue: '—',
      unit: '%',
      status: 'AWAITING_DATA',
      subtext: 'Awaiting real data (No focal probe observations)',
      details: { earlyObservations: 0, lateObservations: 0 }
    };
  } else if (earlyFocalProbes.length === 0 || lateFocalProbes.length === 0) {
    const earlyCaught = earlyFocalProbes.filter(isProbeCaught).length;
    const earlyRate = earlyFocalProbes.length > 0 ? +((earlyCaught / earlyFocalProbes.length) * 100).toFixed(1) : null;
    earlyVsLateCard = {
      title: 'Early vs. Late Review',
      value: null,
      formattedValue: '—',
      unit: '%',
      status: 'INSUFFICIENT_DATA',
      subtext: earlyRate !== null
        ? `Early Catch: ${earlyRate}% (N=${earlyFocalProbes.length}) · Awaiting late queue data (positions ${halfWindow + 1}–${scoredRequestCount})`
        : 'Insufficient data across queue windows',
      details: {
        earlyCatchRate: earlyRate,
        earlyObservations: earlyFocalProbes.length,
        lateObservations: lateFocalProbes.length
      }
    };
  } else {
    const earlyCaught = earlyFocalProbes.filter(isProbeCaught).length;
    const lateCaught = lateFocalProbes.filter(isProbeCaught).length;
    const earlyRate = +((earlyCaught / earlyFocalProbes.length) * 100).toFixed(1);
    const lateRate = +((lateCaught / lateFocalProbes.length) * 100).toFixed(1);
    const diff = +(lateRate - earlyRate).toFixed(1);
    const absDiff = +Math.abs(diff).toFixed(1);

    earlyVsLateCard = {
      title: 'Early vs. Late Review',
      value: diff,
      formattedValue: `${diff >= 0 ? '+' : ''}${diff}%`,
      unit: '%',
      status: 'AVAILABLE',
      subtext: `Early (1–${halfWindow}): ${earlyRate}% | Late (${halfWindow + 1}–${scoredRequestCount}): ${lateRate}% (Δ ${absDiff}% pts)`,
      details: {
        earlyCatchRate: earlyRate,
        lateCatchRate: lateRate,
        absoluteDifference: absDiff,
        signedDifference: diff,
        earlyObservations: earlyFocalProbes.length,
        lateObservations: lateFocalProbes.length
      }
    };
  }

  let sessionStatus: SimulatorResultsSummary['sessionStatus'] = 'AWAITING_DATA';
  if (totalScoredDecisions > 0) {
    sessionStatus = (completedCount > 0 || totalScoredDecisions >= totalEnrolled * 10)
      ? 'RESULTS_AVAILABLE'
      : 'IN_PROGRESS';
  }

  return {
    sessionCode,
    sessionStatus,
    totalEnrolled,
    completedCount,
    totalScoredDecisions,
    scoredRequestCount,
    cards: {
      totalApprovals: totalApprovalsCard,
      correctDecisions: correctDecisionsCard,
      unsafeApprovals: unsafeApprovalsCard,
      medianDecisionTime: medianDecisionTimeCard,
      earlyVsLateReview: earlyVsLateCard
    },
    metadata: {
      practiceExcluded: true,
      serverAuthoritative: true,
      calculatedAt: Date.now(),
      earlyWindowPositions: `Scored 1–${halfWindow}`,
      lateWindowPositions: `Scored ${halfWindow + 1}–${scoredRequestCount}`
    }
  };
}
