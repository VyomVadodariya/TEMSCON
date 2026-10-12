import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

  it('Durable Disk Persistence: saves mutations to file and reloads seamlessly across store restarts', () => {
    const testDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const tempFile = path.resolve(testDir, `disk-persist-test-${Date.now()}.json`);

    try {
      // 1. First instance writes state to disk
      const storeA = new SessionStore({ storagePath: tempFile });
      storeA.createSession('DISK-COHORT', 40);
      const { participant } = storeA.joinParticipant('DISK-COHORT', 'Operator-Disk');

      storeA.submitDecision({
        sessionCode: 'DISK-COHORT',
        participantId: participant.id,
        queueIndex: 1,
        assignmentId: 'assign-1',
        decision: 'APPROVE',
        dwellTimeMs: 1500,
        clientTimestamp: Date.now(),
        idempotencyKey: 'idem-disk-1'
      });
      storeA.setRevealUnlocked('DISK-COHORT', true);

      // Verify file was written to disk
      assert.ok(fs.existsSync(tempFile), 'Persistence file must exist on disk');

      // 2. Second instance starts up and reloads from disk file
      const storeB = new SessionStore({ storagePath: tempFile });
      const recoveredSession = storeB.getSession('DISK-COHORT');
      assert.ok(recoveredSession, 'Session must be recovered');
      assert.equal(recoveredSession.sessionCode, 'DISK-COHORT');
      assert.equal(recoveredSession.revealUnlocked, true);

      const recoveredPart = storeB.getParticipant('DISK-COHORT', participant.id);
      assert.ok(recoveredPart, 'Participant must be recovered');
      assert.equal(recoveredPart.alias, 'Operator-Disk');
      assert.equal(recoveredPart.currentQueueIndex, 2);
      assert.equal(recoveredPart.decisions.size, 1);
      assert.equal(recoveredPart.decisions.get('assign-1')?.decision, 'APPROVE');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });
});
