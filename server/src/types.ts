export type ExperimentCondition = 'EXTENDED_REVIEW' | 'REDUCED_REVIEW';

export type ScenarioClass = 
  | 'COMPLIANT_ROUTINE'
  | 'AMBIGUOUS_ROUTINE'
  | 'HIGH_RISK_PROBE'
  | 'CATASTROPHIC_PROBE';

export type DecisionAction = 'APPROVE' | 'REJECT' | 'ESCALATE' | 'TIMEOUT';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CATASTROPHIC';

export interface ScenarioTemplate {
  id: string;
  templateId: string;
  title: string;
  scenarioClass: ScenarioClass;
  domain: 'FINANCIAL' | 'ACCESS_CONTROL' | 'INFRASTRUCTURE' | 'DATA_GOVERNANCE' | 'SYSTEM_ADMIN';
  riskTier: RiskTier;
  isProbe: boolean;
  probeType?: 'FOCAL' | 'CONTEXT';
  dyadId?: string; // Links matched pairs P_ma / P_mb
  aiRecommendation: DecisionAction;
  aiConfidence: number; // e.g. 0.94 to 0.98
  aiRationale: string;
  description: string;
  parameters: Record<string, string | number | boolean>;
  systemLogs: string[];
  optimalAction: DecisionAction;
  policyNotes?: string;
}

export interface QueueItem {
  queueIndex: number; // 1-indexed (1 to K)
  isPractice: boolean;
  scenario: ScenarioTemplate;
}

export interface DecisionSubmission {
  sessionId: string;
  participantId: string;
  queueIndex: number;
  assignmentId: string;
  decision: DecisionAction;
  dwellTimeMs: number;
  clientTimestamp: number;
  idempotencyKey: string;
}

export interface RecordedDecision {
  assignmentId: string;
  queueIndex: number;
  scenarioClass: ScenarioClass;
  decision: DecisionAction;
  optimalAction: DecisionAction;
  isOptimal: boolean;
  dwellTimeMs: number;
  submittedAt: number;
  rawPoints: number;
  isCatastrophicApproval: boolean;
}

export interface SessionScoringSummary {
  rawScore: number;
  catastrophicApprovalCount: number;
  compoundingPenalty: number;
  netScore: number;
  maxScore: number;
  simulationOversightScore: number; // Clamped to [0.0, 100.0]
  compliantCount: number;
  ambiguousCount: number;
  highRiskCount: number;
  catastrophicCount: number;
  totalScoredRequests: number;
  focalProbeCatchRate: number; // Catch rate on matched focal probes (pos [9, 21, 33, 45])
  contextProbeCatchRate: number;
  inappropriateEscalationRate: number;
}

export interface ParticipantSession {
  id: string;
  alias: string;
  condition: ExperimentCondition;
  sessionCode: string;
  currentQueueIndex: number;
  totalRequests: number; // practice + scored
  practiceCount: number; // 3
  scoredCount: number; // 50 default, 30-80 configurable
  queue: QueueItem[];
  decisions: Map<string, RecordedDecision>; // Keyed by assignmentId
  startedAt: number;
  completedAt?: number;
  isWithdrawn: boolean;
}

export interface ExperimentSession {
  sessionCode: string;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CONCLUDED';
  scoredRequestCount: number; // default 50
  createdAt: number;
  revealUnlocked: boolean; // Educational reveal toggle
  participants: Map<string, ParticipantSession>;
}
