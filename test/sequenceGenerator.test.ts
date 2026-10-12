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

  it('supports configurable session lengths (30, 50, 80) with identical focal probe positions', () => {
    for (const count of [30, 50, 80]) {
      const qA = generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: count });
      const qB = generateParticipantQueue({ condition: 'REDUCED_REVIEW', scoredRequestCount: count });

      assert.equal(qA.length, count + 3, `Queue A length must be ${count + 3}`);
      assert.equal(qB.length, count + 3, `Queue B length must be ${count + 3}`);

      const scoredA = qA.filter(q => !q.isPractice);
      const scoredB = qB.filter(q => !q.isPractice);

      const focalA = scoredA.map((it, idx) => (it.scenario.isProbe && it.scenario.probeType === 'FOCAL' ? idx + 1 : null)).filter(Boolean);
      const focalB = scoredB.map((it, idx) => (it.scenario.isProbe && it.scenario.probeType === 'FOCAL' ? idx + 1 : null)).filter(Boolean);

      assert.equal(focalA.length, 4, `Must have 4 focal probes at count ${count}`);
      assert.equal(focalB.length, 4, `Must have 4 focal probes at count ${count}`);
      assert.deepEqual(focalA, focalB, `Focal probe positions must match between Condition A and B at count ${count}`);

      const totalProbesA = scoredA.filter(it => it.scenario.isProbe).length;
      const totalProbesB = scoredB.filter(it => it.scenario.isProbe).length;
      assert.equal(totalProbesA, 8, `Must have exactly 8 total probes at count ${count}`);
      assert.equal(totalProbesB, 8, `Must have exactly 8 total probes at count ${count}`);
    }

    assert.throws(() => {
      generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 25 });
    }, /Invalid scoredRequestCount/);

    assert.throws(() => {
      generateParticipantQueue({ condition: 'EXTENDED_REVIEW', scoredRequestCount: 85 });
    }, /Invalid scoredRequestCount/);
  });
});
