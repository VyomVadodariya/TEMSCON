import { ExperimentCondition, QueueItem, ScenarioTemplate } from '../types.js';
import { PRACTICE_SCENARIOS, CRITICAL_PROBES, ALL_SCENARIOS } from '../scenarios/scenarioBank.js';

export interface SequenceConfig {
  condition: ExperimentCondition;
  scoredRequestCount: number; // Default: 50, valid range: 30 to 80
  track?: 1 | 2; // Latin square rotation track
  randomSeed?: number;
}

export function generateParticipantQueue(config: SequenceConfig): QueueItem[] {
  const { condition, scoredRequestCount = 50, track = 1 } = config;

  if (scoredRequestCount < 30 || scoredRequestCount > 80) {
    throw new Error(`Invalid scoredRequestCount ${scoredRequestCount}. Must be between 30 and 80.`);
  }

  const queue: QueueItem[] = [];

  // Step 1: Add 3 Practice Scenarios (unscored)
  for (let i = 0; i < PRACTICE_SCENARIOS.length; i++) {
    queue.push({
      queueIndex: i + 1,
      isPractice: true,
      scenario: PRACTICE_SCENARIOS[i]
    });
  }

  // Step 2: Prepare Critical Probes with Dyad Latin-Square Rotation
  // Dyad mapping: 4 Dyads (2 High-Risk dyads, 2 Catastrophic dyads)
  const dyadH1 = CRITICAL_PROBES.filter(p => p.dyadId === 'dyad-h1');
  const dyadH2 = CRITICAL_PROBES.filter(p => p.dyadId === 'dyad-h2');
  const dyadK3 = CRITICAL_PROBES.filter(p => p.dyadId === 'dyad-k3');
  const dyadK4 = CRITICAL_PROBES.filter(p => p.dyadId === 'dyad-k4');

  // Assign Focal and Context probes according to Track (1 or 2)
  const focalProbes: ScenarioTemplate[] = [];
  const contextProbes: ScenarioTemplate[] = [];

  const dyads = [dyadH1, dyadH2, dyadK3, dyadK4];
  for (const dyad of dyads) {
    if (track === 1) {
      focalProbes.push({ ...dyad[0], probeType: 'FOCAL' });
      contextProbes.push({ ...dyad[1], probeType: 'CONTEXT' });
    } else {
      focalProbes.push({ ...dyad[1], probeType: 'FOCAL' });
      contextProbes.push({ ...dyad[0], probeType: 'CONTEXT' });
    }
  }

  // Step 3: Determine Probe Placements for Scored Phase
  // For default 50-item sequence, use the mathematically verified canonical positions:
  // k_focal = [9, 21, 33, 45] in BOTH Condition A and Condition B!
  let probePositions: Map<number, ScenarioTemplate> = new Map();

  if (scoredRequestCount === 50) {
    if (condition === 'EXTENDED_REVIEW') {
      // Condition A: Focal at [9, 21, 33, 45] (L_local = 8 >= 7)
      // Context at [12, 24, 36, 48] (L_local = 2)
      probePositions.set(9, focalProbes[0]);
      probePositions.set(12, contextProbes[0]);
      probePositions.set(21, focalProbes[1]);
      probePositions.set(24, contextProbes[1]);
      probePositions.set(33, focalProbes[2]);
      probePositions.set(36, contextProbes[2]);
      probePositions.set(45, focalProbes[3]);
      probePositions.set(48, contextProbes[3]);
    } else {
      // Condition B: Context at [7, 19, 31, 43]
      // Focal at [9, 21, 33, 45] (L_local = 1 <= 3)
      probePositions.set(7, contextProbes[0]);
      probePositions.set(9, focalProbes[0]);
      probePositions.set(19, contextProbes[1]);
      probePositions.set(21, focalProbes[1]);
      probePositions.set(31, contextProbes[2]);
      probePositions.set(33, focalProbes[2]);
      probePositions.set(43, contextProbes[3]);
      probePositions.set(45, focalProbes[3]);
    }
  } else {
    // Proportional placement for configurable queue length (30 to 80)
    // Distribute 8 probes across quintiles
    const scale = scoredRequestCount / 50.0;
    const baseFocal = [9, 21, 33, 45];
    const baseContextA = [12, 24, 36, 48];
    const baseContextB = [7, 19, 31, 43];

    for (let i = 0; i < 4; i++) {
      const scaledFocal = Math.max(1, Math.min(scoredRequestCount - 1, Math.round(baseFocal[i] * scale)));
      probePositions.set(scaledFocal, focalProbes[i]);

      if (condition === 'EXTENDED_REVIEW') {
        const scaledCtx = Math.min(scoredRequestCount, scaledFocal + 3);
        probePositions.set(scaledCtx, contextProbes[i]);
      } else {
        const scaledCtx = Math.max(1, scaledFocal - 2);
        probePositions.set(scaledCtx, contextProbes[i]);
      }
    }
  }

  // Step 4: Populate Routine Scenarios (Compliant and Ambiguous)
  // 42 legitimate requests in 50-item sequence: standard mixed queue has 36 Compliant, 6 Ambiguous
  const compliantPool = ALL_SCENARIOS.filter(s => s.scenarioClass === 'COMPLIANT_ROUTINE');
  const ambiguousPool = ALL_SCENARIOS.filter(s => s.scenarioClass === 'AMBIGUOUS_ROUTINE');

  let compIdx = 0;
  let ambIdx = 0;

  for (let k = 1; k <= scoredRequestCount; k++) {
    if (probePositions.has(k)) {
      queue.push({
        queueIndex: PRACTICE_SCENARIOS.length + k,
        isPractice: false,
        scenario: probePositions.get(k)!
      });
    } else {
      // Allocate routine items: 1 ambiguous item every 7 routine items for natural enterprise mix
      const isAmbiguous = (k % 7 === 0) && (ambIdx < ambiguousPool.length);
      let routineScenario: ScenarioTemplate;
      if (isAmbiguous) {
        routineScenario = ambiguousPool[ambIdx % ambiguousPool.length];
        ambIdx++;
      } else {
        routineScenario = compliantPool[compIdx % compliantPool.length];
        compIdx++;
      }

      queue.push({
        queueIndex: PRACTICE_SCENARIOS.length + k,
        isPractice: false,
        scenario: routineScenario
      });
    }
  }

  return queue;
}
