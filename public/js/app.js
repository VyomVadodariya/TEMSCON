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
let resultsPollTimer = null;

// ==========================================
// VIEW SWITCHING
// ==========================================

function switchView(viewName) {
  currentView = viewName;

  const btnPart = document.getElementById('btn-nav-participant');
  const btnRes = document.getElementById('btn-nav-results');
  const btnPres = document.getElementById('btn-nav-presenter');

  const containerPart = document.getElementById('participant-container');
  const containerRes = document.getElementById('results-container');
  const containerPres = document.getElementById('presenter-container');

  // Clear polling timers
  if (presenterPollTimer) clearInterval(presenterPollTimer);
  if (resultsPollTimer) clearInterval(resultsPollTimer);

  if (btnPart) btnPart.classList.toggle('active', viewName === 'participant');
  if (btnRes) btnRes.classList.toggle('active', viewName === 'results');
  if (btnPres) btnPres.classList.toggle('active', viewName === 'presenter');

  if (containerPart) containerPart.classList.toggle('hidden', viewName !== 'participant');
  if (containerRes) containerRes.classList.toggle('hidden', viewName !== 'results');
  if (containerPres) containerPres.classList.toggle('hidden', viewName !== 'presenter');

  if (viewName === 'participant') {
    if (window.location.hash === '#presenter' || window.location.hash === '#results') {
      history.replaceState(null, '', window.location.pathname);
    }
  } else if (viewName === 'results') {
    window.location.hash = '#results';
    refreshResultsView();
    resultsPollTimer = setInterval(refreshResultsView, 3000);
  } else if (viewName === 'presenter') {
    window.location.hash = '#presenter';
    updatePresenterAuthIndicator();
    refreshPresenterData();
    presenterPollTimer = setInterval(refreshPresenterData, 3000);
  }
}

function handleHashRouting() {
  const hash = window.location.hash;
  if (hash === '#presenter') {
    switchView('presenter');
  } else if (hash === '#results') {
    switchView('results');
  } else {
    switchView('participant');
    updatePresenterAuthIndicator();
  }
}

window.addEventListener('hashchange', handleHashRouting);
handleHashRouting();

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

    // Reveal State & Hypothesis Privacy Masking
    const revealBtn = document.getElementById('btn-toggle-reveal');
    const revealBody = document.getElementById('reveal-content-body');
    const contrastLockedBanner = document.getElementById('conditions-contrast-locked-banner');
    const contrastGrid = document.getElementById('conditions-contrast-grid');
    const thCondition = document.getElementById('th-roster-condition');

    if (data.revealUnlocked) {
      // Reveal is UNLOCKED
      if (contrastLockedBanner) contrastLockedBanner.classList.add('hidden');
      if (contrastGrid) contrastGrid.classList.remove('hidden');
      if (revealBtn) {
        revealBtn.innerText = 'Lock Educational Reveal';
        revealBtn.style.background = 'rgba(16, 185, 129, 0.4)';
      }
      if (revealBody) revealBody.classList.remove('hidden');
      if (thCondition) thCondition.innerText = 'Experimental Condition (Revealed)';

      // Populate Condition A and B Metrics
      if (data.conditionAMetrics) {
        document.getElementById('cond-a-count').innerText = data.conditionAMetrics.count;
        document.getElementById('cond-a-avg-score').innerText = data.conditionAMetrics.count > 0 ? `${data.conditionAMetrics.avgScore}` : '--';
        document.getElementById('cond-a-focal-catch').innerText = data.conditionAMetrics.count > 0 ? `${(data.conditionAMetrics.avgFocalCatchRate * 100).toFixed(1)}%` : '--';
        document.getElementById('cond-a-cat-approvals').innerText = data.conditionAMetrics.totalCatastrophicApprovals;
      }
      if (data.conditionBMetrics) {
        document.getElementById('cond-b-count').innerText = data.conditionBMetrics.count;
        document.getElementById('cond-b-avg-score').innerText = data.conditionBMetrics.count > 0 ? `${data.conditionBMetrics.avgScore}` : '--';
        document.getElementById('cond-b-focal-catch').innerText = data.conditionBMetrics.count > 0 ? `${(data.conditionBMetrics.avgFocalCatchRate * 100).toFixed(1)}%` : '--';
        document.getElementById('cond-b-cat-approvals').innerText = data.conditionBMetrics.totalCatastrophicApprovals;
      }
    } else {
      // Reveal is LOCKED / MASKED
      if (contrastLockedBanner) contrastLockedBanner.classList.remove('hidden');
      if (contrastGrid) contrastGrid.classList.add('hidden');
      if (revealBtn) {
        revealBtn.innerText = 'Unlock Educational Reveal';
        revealBtn.style.background = '';
      }
      if (revealBody) revealBody.classList.add('hidden');
      if (thCondition) thCondition.innerText = 'Cohort Assignment (Masked)';
    }

    // Participants Roster
    const tbody = document.getElementById('roster-table-body');
    if (!data.participantsList || data.participantsList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No participants currently enrolled.</td></tr>';
    } else {
      tbody.innerHTML = '';
      data.participantsList.forEach(p => {
        const tr = document.createElement('tr');
        let condBadge = '<span class="badge-practice" style="background: rgba(148, 163, 184, 0.15); color: var(--text-muted);">Blind Assignment (Active)</span>';
        if (data.revealUnlocked) {
          if (p.condition === 'EXTENDED_REVIEW') {
            condBadge = '<span style="color: var(--accent-rose); font-weight:700;">Condition A (Extended)</span>';
          } else if (p.condition === 'REDUCED_REVIEW') {
            condBadge = '<span style="color: var(--accent-emerald); font-weight:700;">Condition B (Reduced)</span>';
          }
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

// ==========================================
// PRESENTER AUTHENTICATION & CONTROLS
// ==========================================

function getPresenterKey() {
  return sessionStorage.getItem('aiocc_presenter_key') || '';
}

function updatePresenterAuthIndicator() {
  const statusEl = document.getElementById('presenter-auth-status');
  const inputEl = document.getElementById('presenter-auth-key-input');
  const key = getPresenterKey();
  if (statusEl) {
    if (key) {
      statusEl.innerText = 'Key: Configured';
      statusEl.style.color = 'var(--accent-emerald)';
    } else {
      statusEl.innerText = 'Key: Not set';
      statusEl.style.color = 'var(--text-muted)';
    }
  }
  if (inputEl && key && !inputEl.value) {
    inputEl.value = key;
  }
}

function savePresenterKey() {
  const inputEl = document.getElementById('presenter-auth-key-input');
  if (!inputEl) return;
  const val = inputEl.value.trim();
  if (val) {
    sessionStorage.setItem('aiocc_presenter_key', val);
    updatePresenterAuthIndicator();
    alert('Presenter authentication key saved for this browser session.');
  } else {
    sessionStorage.removeItem('aiocc_presenter_key');
    updatePresenterAuthIndicator();
    alert('Presenter key cleared.');
  }
}

async function handleCreateSession() {
  const presenterKey = getPresenterKey();
  if (!presenterKey) {
    alert('Presenter Key required. Please enter and authorize your key in the top control panel.');
    document.getElementById('presenter-auth-key-input')?.focus();
    return;
  }

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
        'x-presenter-key': presenterKey
      },
      body: JSON.stringify({ sessionCode, scoredRequestCount: 50 })
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Authentication failed: Invalid presenter key. Please check the key configured on the server.');
      }
      throw new Error(data.error || 'Failed to create session');
    }

    document.getElementById('presenter-session-code-display').innerText = data.sessionCode;
    input.value = '';
    await refreshPresenterData();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleEducationalReveal() {
  const presenterKey = getPresenterKey();
  if (!presenterKey) {
    alert('Presenter Key required to toggle reveal. Please enter and authorize your key in the top control panel.');
    document.getElementById('presenter-auth-key-input')?.focus();
    return;
  }

  const sessionCode = document.getElementById('presenter-session-code-display').innerText.trim() || 'DEMO-2026';
  const contrastGrid = document.getElementById('conditions-contrast-grid');
  const isCurrentlyUnlocked = contrastGrid && !contrastGrid.classList.contains('hidden');

  try {
    const res = await fetch('/api/v1/presenter/session/reveal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-presenter-key': presenterKey
      },
      body: JSON.stringify({ sessionCode, unlocked: !isCurrentlyUnlocked })
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Authentication failed: Invalid presenter key. Please check the key configured on the server.');
      }
      throw new Error(data.error || 'Failed to toggle reveal');
    }

    await refreshPresenterData();
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================
// SIMULATOR RESULTS DASHBOARD LOGIC
// ==========================================

async function refreshResultsView() {
  const sessionInput = document.getElementById('results-session-input');
  const sessionCode = (sessionInput ? sessionInput.value.trim() : '') || participantState.sessionCode || 'DEMO-2026';

  try {
    const res = await fetch(`/api/v1/session/results?sessionCode=${encodeURIComponent(sessionCode)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to fetch results (HTTP ${res.status})`);
    }
    const data = await res.json();
    renderSimulatorResults(data);
  } catch (err) {
    renderResultsErrorState(err.message);
  }
}

function renderSimulatorResults(data) {
  // 1. Status badge
  const badge = document.getElementById('results-status-badge');
  if (badge) {
    badge.className = 'badge-status';
    if (data.sessionStatus === 'RESULTS_AVAILABLE') {
      badge.classList.add('available');
      badge.innerText = 'RESULTS AVAILABLE';
    } else if (data.sessionStatus === 'IN_PROGRESS') {
      badge.classList.add('in-progress');
      badge.innerText = 'SESSION IN PROGRESS';
    } else {
      badge.classList.add('awaiting');
      badge.innerText = 'AWAITING REAL DATA';
    }
  }

  // Helper to update individual card elements
  const updateCard = (prefix, card, isUnsafe = false) => {
    const valEl = document.getElementById(`res-val-${prefix}`);
    const pillEl = document.getElementById(`pill-${prefix}`);
    const subEl = document.getElementById(`sub-${prefix}`);
    const unitEl = document.getElementById(`unit-${prefix}`);

    if (valEl) {
      valEl.innerText = card.formattedValue || '—';
      if (isUnsafe) {
        if (typeof card.value === 'number' && card.value > 0) {
          valEl.classList.add('active-risk');
        } else {
          valEl.classList.remove('active-risk');
        }
      }
    }
    if (unitEl) {
      unitEl.innerText = card.unit || '';
    }
    if (pillEl) {
      pillEl.className = 'card-status-pill';
      if (card.status === 'AVAILABLE') {
        pillEl.classList.add('available');
        pillEl.innerText = isUnsafe
          ? (card.value === 0 ? 'Zero Violations' : 'Critical Flags')
          : 'Real Data';
      } else if (card.status === 'INSUFFICIENT_DATA') {
        pillEl.classList.add('insufficient');
        pillEl.innerText = 'Partial Data';
      } else {
        pillEl.classList.add('awaiting');
        pillEl.innerText = 'Awaiting real data';
      }
    }
    if (subEl) {
      subEl.innerText = card.subtext || '';
    }
  };

  const cards = data.cards || {};
  if (cards.totalApprovals) updateCard('approvals', cards.totalApprovals);
  if (cards.correctDecisions) updateCard('correct', cards.correctDecisions);
  if (cards.unsafeApprovals) updateCard('unsafe', cards.unsafeApprovals, true);
  if (cards.medianDecisionTime) updateCard('dwell', cards.medianDecisionTime);
  if (cards.earlyVsLateReview) updateCard('earlylate', cards.earlyVsLateReview);

  // Metadata summary counts
  const elEnrolled = document.getElementById('res-meta-enrolled');
  if (elEnrolled) elEnrolled.innerText = data.totalEnrolled || 0;

  const elCompleted = document.getElementById('res-meta-completed');
  if (elCompleted) elCompleted.innerText = data.completedCount || 0;

  const elDecisions = document.getElementById('res-meta-decisions');
  if (elDecisions) elDecisions.innerText = data.totalScoredDecisions || 0;
}

function renderResultsErrorState(message) {
  const badge = document.getElementById('results-status-badge');
  if (badge) {
    badge.className = 'badge-status awaiting';
    badge.innerText = 'CONNECTION ERROR';
  }
  const prefixes = ['approvals', 'correct', 'unsafe', 'dwell', 'earlylate'];
  prefixes.forEach(prefix => {
    const sub = document.getElementById(`sub-${prefix}`);
    if (sub) sub.innerText = `Unavailable: ${message}`;
    const pill = document.getElementById(`pill-${prefix}`);
    if (pill) {
      pill.className = 'card-status-pill awaiting';
      pill.innerText = 'Offline';
    }
  });
}
