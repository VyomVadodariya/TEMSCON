import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../server/src/services/sessionStore.js';
import { computeSessionScore } from '../server/src/services/scoringEngine.js';

describe('Reliability, Concurrency & Persistence Tests', () => {
  it('Simultaneous submissions: duplicate assignmentId is handled idempotently without duplicate scoring', () => {
    const store = new SessionStore();
    store.createSession('CONCUR-TEST', 50);
    const { participant } = store.joinParticipant('CONCUR-TEST', 'Operator-Concur');

    // Submit request 1
    const sub1 = store.submitDecision({
      sessionCode: 'CONCUR-TEST',
      participantId: participant.id,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-1'
    });
    assert.equal(sub1.success, true);
    assert.equal(sub1.isDuplicate, false);
    assert.equal(participant.decisions.size, 1);

    // Duplicate submission for request 1 (simulated network retry or rapid double click)
    const sub2 = store.submitDecision({
      sessionCode: 'CONCUR-TEST',
      participantId: participant.id,
      queueIndex: 1, // Retrying same assignment
      assignmentId: 'assign-1',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-1'
    });
    assert.equal(sub2.success, true);
    assert.equal(sub2.isDuplicate, true);
    assert.equal(participant.decisions.size, 1, 'Decisions size must remain 1');
  });

  it('Incomplete Session Handling: uncompleted items are finalized as TIMEOUT', () => {
    const store = new SessionStore();
    store.createSession('TIMEOUT-TEST', 50);
    const { participant } = store.joinParticipant('TIMEOUT-TEST', 'Operator-Incomplete');

    // Participant completes only practice items + 2 scored items
    store.submitDecision({
      sessionCode: 'TIMEOUT-TEST',
      participantId: participant.id,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-1'
    });
    store.submitDecision({
      sessionCode: 'TIMEOUT-TEST',
      participantId: participant.id,
      queueIndex: 2,
      assignmentId: 'assign-2',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-2'
    });
    store.submitDecision({
      sessionCode: 'TIMEOUT-TEST',
      participantId: participant.id,
      queueIndex: 3,
      assignmentId: 'assign-3',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-3'
    });

    // Scored item 1 (index 4) - submitted APPROVE
    store.submitDecision({
      sessionCode: 'TIMEOUT-TEST',
      participantId: participant.id,
      queueIndex: 4,
      assignmentId: 'assign-4',
      decision: 'APPROVE',
      dwellTimeMs: 2000,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-4'
    });

    // Session is concluded before participant finishes remaining 49 scored items!
    store.setSessionStatus('TIMEOUT-TEST', 'CONCLUDED');

    // Compute score: remaining 49 items evaluate to TIMEOUT
    const summary = computeSessionScore(participant.queue, participant.decisions);
    assert.equal(summary.totalScoredRequests, 50);
    // Uncompleted items received TIMEOUT penalties (-1.0 each for routine items), net score is substantially lower
    assert.ok(summary.simulationOversightScore < 50.0);
  });

  it('Persistence & Restoration: state can be serialized and restored without data loss', () => {
    const store1 = new SessionStore();
    store1.createSession('PERSIST-TEST', 50);
    const { participant: p1 } = store1.joinParticipant('PERSIST-TEST', 'Operator-Persist');

    store1.submitDecision({
      sessionCode: 'PERSIST-TEST',
      participantId: p1.id,
      queueIndex: 1,
      assignmentId: 'assign-1',
      decision: 'APPROVE',
      dwellTimeMs: 3100,
      clientTimestamp: Date.now(),
      idempotencyKey: 'idem-p1'
    });

    // Export state
    const serialized = store1.exportState();
    assert.ok(serialized.includes('PERSIST-TEST'));
    assert.ok(serialized.includes('Operator-Persist'));

    // Create fresh store and import state
    const store2 = new SessionStore();
    store2.importState(serialized);

    const restoredSession = store2.getSession('PERSIST-TEST');
    assert.ok(restoredSession);
    const restoredParticipant = store2.getParticipant('PERSIST-TEST', p1.id);
    assert.ok(restoredParticipant);
    assert.equal(restoredParticipant.alias, 'Operator-Persist');
    assert.equal(restoredParticipant.currentQueueIndex, 2);
    assert.equal(restoredParticipant.decisions.size, 1);
    assert.equal(restoredParticipant.decisions.get('assign-1')?.decision, 'APPROVE');
  });
});
