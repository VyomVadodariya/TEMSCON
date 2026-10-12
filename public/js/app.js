// AI Operations Control Center (AIOCC) Client Runtime

let currentView = 'participant';
let participantState = {
  sessionCode: 'DEMO-2026',
  participantId: null,
  alias: 'Operator-1',
  currentQueueIndex: 1,
  totalRequests: 53,
  assignmentId: null,
  startTime: null
};

let dwellTimer = null;
let presenterPollTimer = null;

// ==========================================
// VIEW SWITCHING
// ==========================================

function switchView(viewName) {
  currentView = viewName;

  const btnPart = document.getElementById('btn-nav-participant');
  const btnPres = document.getElementById('btn-nav-presenter');
  const containerPart = document.getElementById('participant-container');
  const containerPres = document.getElementById('presenter-container');

  if (viewName === 'participant') {
    btnPart.classList.add('active');
    btnPres.classList.remove('active');
    containerPart.classList.remove('hidden');
    containerPres.classList.add('hidden');
    if (presenterPollTimer) clearInterval(presenterPollTimer);
  } else {
    btnPres.classList.add('active');
    btnPart.classList.remove('active');
    containerPres.classList.remove('hidden');
    containerPart.classList.add('hidden');
    refreshPresenterData();
    presenterPollTimer = setInterval(refreshPresenterData, 3000);
  }
}

// Check URL hash for direct presenter linking
if (window.location.hash === '#presenter') {
  switchView('presenter');
}

// ==========================================
// PARTICIPANT WORKFLOW
// ==========================================

async function handleJoin(event) {
  event.preventDefault();
  const sessionCode = document.getElementById('input-session-code').value.trim() || 'DEMO-2026';
  const alias = document.getElementById('input-alias').value.trim() || 'Operator-1';

  const joinBtn = document.getElementById('btn-join-submit');
  joinBtn.disabled = true;
  joinBtn.innerText = 'Connecting...';

  try {
    const res = await fetch('/api/v1/participant/session/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionCode, alias })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to join session');

    participantState.sessionCode = data.sessionCode;
    participantState.participantId = data.participantId;
    participantState.alias = data.alias;
    participantState.totalRequests = data.totalRequests;

    document.getElementById('hud-operator-alias').innerText = data.alias;
    document.getElementById('participant-join-view').classList.add('hidden');
    document.getElementById('participant-active-view').classList.remove('hidden');

    await loadCurrentScenario();
    startHeartbeat();
  } catch (err) {
    alert(err.message);
  } finally {
    joinBtn.disabled = false;
    joinBtn.innerText = 'Initialize Workstation';
  }
}

async function loadCurrentScenario() {
  const { sessionCode, participantId } = participantState;
  if (!participantId) return;

  try {
    const res = await fetch(`/api/v1/participant/session/current?sessionCode=${sessionCode}&participantId=${participantId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to fetch current scenario');

    if (data.isCompleted) {
      renderCompletionScreen(data.scoreSummary);
      return;
    }

    renderScenario(data.queueItem, data.progress);
  } catch (err) {
    console.error('Error loading scenario:', err);
  }
}

function renderScenario(item, progress) {
  participantState.currentQueueIndex = item.queueIndex;
  participantState.assignmentId = `assign-${item.queueIndex}`;
  participantState.startTime = Date.now();

  // Reset & start dwell timer
  if (dwellTimer) clearInterval(dwellTimer);
  const dwellElem = document.getElementById('timer-dwell-val');
  dwellTimer = setInterval(() => {
    const elapsed = ((Date.now() - participantState.startTime) / 1000).toFixed(1);
    dwellElem.innerText = `DWELL: ${elapsed}s`;
  }, 100);

  // HUD Update
  document.getElementById('hud-progress-current').innerText = progress.current;
  document.getElementById('hud-progress-total').innerText = `/ ${progress.total}`;
  const pct = Math.min(100, (progress.current / progress.total) * 100);
  document.getElementById('hud-progress-fill').style.width = `${pct}%`;

  // Practice Banner
  const practiceBanner = document.getElementById('practice-banner');
  const queueType = document.getElementById('hud-queue-type');
  if (item.isPractice) {
    practiceBanner.classList.remove('hidden');
    queueType.innerText = 'PRACTICE';
    document.getElementById('practice-countdown-badge').innerText = `Request ${progress.current} of 3`;
  } else {
    practiceBanner.classList.add('hidden');
    queueType.innerText = 'OPERATIONAL';
  }

  // Dossier details
  const sc = item.scenario;
  document.getElementById('scenario-domain').innerText = sc.domain.replace('_', ' ');
  const riskBadge = document.getElementById('scenario-risk');
  riskBadge.className = `risk-badge risk-${sc.riskTier}`;
  riskBadge.innerText = `${sc.riskTier} RISK`;

  document.getElementById('scenario-title').innerText = sc.title;
  document.getElementById('scenario-desc').innerText = sc.description;

  // Parameters
  const paramsBody = document.getElementById('scenario-params-body');
  paramsBody.innerHTML = '';
  for (const [key, val] of Object.entries(sc.parameters || {})) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="param-key">${key}</td><td class="param-val">${val}</td>`;
    paramsBody.appendChild(tr);
  }

  // Diagnostic Logs
  const logsBlock = document.getElementById('scenario-logs-block');
  logsBlock.innerHTML = '';
  (sc.systemLogs || []).forEach(log => {
    const div = document.createElement('div');
    div.className = 'terminal-line';
    div.innerText = log;
    logsBlock.appendChild(div);
  });

  // AI Recommendation
  document.getElementById('ai-confidence-val').innerText = `CONFIDENCE: ${(sc.aiConfidence * 100).toFixed(1)}%`;
  document.getElementById('ai-action-val').innerText = sc.aiRecommendation;
  document.getElementById('ai-rationale-val').innerText = sc.aiRationale;
}

async function handleDecision(decision) {
  if (!participantState.participantId || !participantState.assignmentId) return;

  const dwellTimeMs = Date.now() - participantState.startTime;

  // Disable action buttons temporarily to prevent accidental double-clicks
  const buttons = document.querySelectorAll('.action-btn');
  buttons.forEach(b => b.disabled = true);

  try {
    const res = await fetch('/api/v1/participant/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode: participantState.sessionCode,
        participantId: participantState.participantId,
        queueIndex: participantState.currentQueueIndex,
        assignmentId: participantState.assignmentId,
        decision,
        dwellTimeMs,
        idempotencyKey: `idem-${participantState.assignmentId}`
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit decision');

    if (data.nextScenario.isCompleted) {
      renderCompletionScreen(data.nextScenario.scoreSummary);
    } else {
      renderScenario(data.nextScenario.queueItem, data.nextScenario.progress);
    }
  } catch (err) {
    alert(err.message);
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

function renderCompletionScreen(summary) {
  if (dwellTimer) clearInterval(dwellTimer);

  document.getElementById('participant-active-view').classList.add('hidden');
  document.getElementById('participant-completion-view').classList.remove('hidden');

  if (summary) {
    document.getElementById('final-score-val').innerText = summary.simulationOversightScore.toFixed(1);
    document.getElementById('final-metric-total').innerText = summary.totalScoredRequests;
    document.getElementById('final-metric-catch-rate').innerText = `${(summary.focalProbeCatchRate * 100).toFixed(1)}%`;
    document.getElementById('final-metric-catastrophic').innerText = summary.catastrophicApprovalCount;
    document.getElementById('final-metric-net-points').innerText = `${summary.netScore.toFixed(1)} / ${summary.maxScore.toFixed(1)}`;
  }
}

function resetParticipantView() {
  document.getElementById('participant-completion-view').classList.add('hidden');
  document.getElementById('participant-join-view').classList.remove('hidden');
  participantState.participantId = null;
}

function startHeartbeat() {
  setInterval(() => {
    if (participantState.participantId) {
      fetch('/api/v1/participant/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: participantState.sessionCode,
          participantId: participantState.participantId
        })
      }).catch(() => {});
    }
  }, 15000);
}

// ==========================================
// PRESENTER COMMAND CENTER
// ==========================================

async function refreshPresenterData() {
  const sessionCode = document.getElementById('presenter-session-code-display').innerText.trim() || 'DEMO-2026';

  try {
    const res = await fetch(`/api/v1/presenter/session/summary?sessionCode=${sessionCode}`);
    const data = await res.json();
    if (!res.ok) return;

    // Overview Stats
    document.getElementById('stat-total-enrolled').innerText = data.totalEnrolled;
    document.getElementById('stat-total-completed').innerText = data.completedCount;
    document.getElementById('stat-avg-score').innerText = data.overallMetrics.avgScore ? `${data.overallMetrics.avgScore}` : '--';
    document.getElementById('stat-total-catastrophic').innerText = data.overallMetrics.totalCatastrophicApprovals;

    // Condition Metrics (Masked until Reveal Unlocked)
    if (data.conditionAMetrics && data.conditionBMetrics) {
      document.getElementById('cond-a-count').innerText = data.conditionAMetrics.count;
      document.getElementById('cond-a-avg-score').innerText = data.conditionAMetrics.count > 0 ? `${data.conditionAMetrics.avgScore}` : '--';
      document.getElementById('cond-a-focal-catch').innerText = data.conditionAMetrics.count > 0 ? `${(data.conditionAMetrics.avgFocalCatchRate * 100).toFixed(1)}%` : '--';
      document.getElementById('cond-a-cat-approvals').innerText = data.conditionAMetrics.totalCatastrophicApprovals;

      document.getElementById('cond-b-count').innerText = data.conditionBMetrics.count;
      document.getElementById('cond-b-avg-score').innerText = data.conditionBMetrics.count > 0 ? `${data.conditionBMetrics.avgScore}` : '--';
      document.getElementById('cond-b-focal-catch').innerText = data.conditionBMetrics.count > 0 ? `${(data.conditionBMetrics.avgFocalCatchRate * 100).toFixed(1)}%` : '--';
      document.getElementById('cond-b-cat-approvals').innerText = data.conditionBMetrics.totalCatastrophicApprovals;
    } else {
      document.getElementById('cond-a-count').innerText = 'Masked';
      document.getElementById('cond-a-avg-score').innerText = '🔒 Masked';
      document.getElementById('cond-a-focal-catch').innerText = '🔒 Masked';
      document.getElementById('cond-a-cat-approvals').innerText = '🔒 Masked';

      document.getElementById('cond-b-count').innerText = 'Masked';
      document.getElementById('cond-b-avg-score').innerText = '🔒 Masked';
      document.getElementById('cond-b-focal-catch').innerText = '🔒 Masked';
      document.getElementById('cond-b-cat-approvals').innerText = '🔒 Masked';
    }

    // Reveal State
    const revealBtn = document.getElementById('btn-toggle-reveal');
    const revealBody = document.getElementById('reveal-content-body');
    if (data.revealUnlocked) {
      revealBtn.innerText = 'Educational Reveal Unlocked (Active)';
      revealBtn.style.background = 'rgba(16, 185, 129, 0.4)';
      revealBody.classList.remove('hidden');
    } else {
      revealBtn.innerText = 'Unlock Educational Reveal';
      revealBtn.style.background = '';
      revealBody.classList.add('hidden');
    }

    // Participants Roster
    const tbody = document.getElementById('roster-table-body');
    if (data.participantsList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No participants currently enrolled.</td></tr>';
    } else {
      tbody.innerHTML = '';
      data.participantsList.forEach(p => {
        const tr = document.createElement('tr');
        let condBadge = '<span style="color: var(--text-muted);">Operator (Masked)</span>';
        if (p.condition === 'EXTENDED_REVIEW') {
          condBadge = '<span style="color: var(--accent-rose); font-weight:700;">Condition A (Extended)</span>';
        } else if (p.condition === 'REDUCED_REVIEW') {
          condBadge = '<span style="color: var(--accent-emerald); font-weight:700;">Condition B (Reduced)</span>';
        }

        const statusBadge = p.isCompleted 
          ? '<span style="color: var(--accent-emerald);">COMPLETED</span>' 
          : `<span style="color: var(--accent-cyan); font-family: var(--font-mono);">${p.currentProgress} / ${p.totalRequests}</span>`;

        tr.innerHTML = `
          <td><strong>${p.alias}</strong></td>
          <td>${condBadge}</td>
          <td>${p.currentProgress} of ${p.totalRequests}</td>
          <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Error refreshing presenter data:', err);
  }
}

const PRESENTER_KEY = 'AIOCC_PRESENTER_SECRET_2026';

async function handleCreateSession() {
  const input = document.getElementById('presenter-new-session-code');
  const sessionCode = input.value.trim().toUpperCase();
  if (!sessionCode) {
    alert('Please enter a session code');
    return;
  }

  try {
    const res = await fetch('/api/v1/presenter/session/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-presenter-key': PRESENTER_KEY
      },
      body: JSON.stringify({ sessionCode, scoredRequestCount: 50 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create session');

    document.getElementById('presenter-session-code-display').innerText = data.sessionCode;
    input.value = '';
    await refreshPresenterData();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleEducationalReveal() {
  const sessionCode = document.getElementById('presenter-session-code-display').innerText.trim() || 'DEMO-2026';
  const isCurrentlyUnlocked = !document.getElementById('reveal-content-body').classList.contains('hidden');

  try {
    const res = await fetch('/api/v1/presenter/session/reveal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-presenter-key': PRESENTER_KEY
      },
      body: JSON.stringify({ sessionCode, unlocked: !isCurrentlyUnlocked })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    await refreshPresenterData();
  } catch (err) {
    alert(err.message);
  }
}
