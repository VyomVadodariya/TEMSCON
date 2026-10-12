import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateParticipantQueue } from '../server/src/services/sequenceGenerator.js';

describe('Sequence Generator Tests (Option A Feasibility & Matching)', () => {
  it('generates exactly 3 practice items followed by 50 scored items', () => {
    const queueA = generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 50 });
    assert.equal(queueA.length, 53);
    assert.equal(queueA[0].isPractice, true);
    assert.equal(queueA[1].isPractice, true);
    assert.equal(queueA[2].isPractice, true);
    assert.equal(queueA[3].isPractice, false);
    assert.equal(queueA[52].isPractice, false);
  });

  it('matches focal probes at identical scored positions k = [9, 21, 33, 45] in both conditions', () => {
    const queueA = generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 50 });
    const queueB = generateParticipantQueue({ condition: 'REDUCED_REVIEW', scoredRequestCount: 50 });

    const scoredA = queueA.filter(q => !q.isPractice);
    const scoredB = queueB.filter(q => !q.isPractice);

    const focalIndicesA: number[] = [];
    const focalIndicesB: number[] = [];

    scoredA.forEach((item, idx) => {
      if (item.scenario.isProbe && item.scenario.probeType === 'FOCAL') {
        focalIndicesA.push(idx + 1); // 1-indexed relative to scored phase
      }
    });

    scoredB.forEach((item, idx) => {
      if (item.scenario.isProbe && item.scenario.probeType === 'FOCAL') {
        focalIndicesB.push(idx + 1);
      }
    });

    assert.deepEqual(focalIndicesA, [9, 21, 33, 45], 'Condition A focal probes must be at [9, 21, 33, 45]');
    assert.deepEqual(focalIndicesB, [9, 21, 33, 45], 'Condition B focal probes must be at [9, 21, 33, 45]');
  });

  it('proves exposure contrast: L_local = 8 in Condition A vs L_local = 1 in Condition B', () => {
    const queueA = generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 50 });
    const queueB = generateParticipantQueue({ condition: 'REDUCED_REVIEW', scoredRequestCount: 50 });

    const scoredA = queueA.filter(q => !q.isPractice);
    const scoredB = queueB.filter(q => !q.isPractice);

    // Calculate L_local before each focal probe (number of consecutive non-probe requests immediately preceding)
    for (const focalPos of [9, 21, 33, 45]) {
      // In Condition A:
      let runA = 0;
      for (let i = focalPos - 2; i >= 0; i--) {
        if (scoredA[i].scenario.isProbe) break;
        runA++;
      }
      assert.equal(runA, 8, `Condition A focal probe at pos ${focalPos} must have L_local = 8`);

      // In Condition B:
      let runB = 0;
      for (let i = focalPos - 2; i >= 0; i--) {
        if (scoredB[i].scenario.isProbe) break;
        runB++;
      }
      assert.equal(runB, 1, `Condition B focal probe at pos ${focalPos} must have L_local = 1`);
    }
  });

  it('supports configurable session lengths between 30 and 80', () => {
    const queue30 = generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 30 });
    assert.equal(queue30.length, 33);

    const queue80 = generateParticipantQueue({ condition: 'REDUCED_REVIEW', scoredRequestCount: 80 });
    assert.equal(queue80.length, 83);

    assert.throws(() => {
      generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 25 });
    }, /Invalid scoredRequestCount/);
  });
});
