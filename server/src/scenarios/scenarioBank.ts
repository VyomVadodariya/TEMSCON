import { ScenarioTemplate, ScenarioClass, DecisionAction, RiskTier } from '../types.js';

// 3 Practice Scenarios (Unscored, clear onboarding feedback)
export const PRACTICE_SCENARIOS: ScenarioTemplate[] = [
  {
    id: 'PRAC-001',
    templateId: 'PRAC-001',
    title: 'Practice 1: Routine Staging Container Restart',
    scenarioClass: 'COMPLIANT_ROUTINE',
    domain: 'INFRASTRUCTURE',
    riskTier: 'LOW',
    isProbe: false,
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.98,
    aiRationale: 'Memory usage on staging worker node #4 exceeds 85%. Standard remediation policy permits automated rolling restart during maintenance window.',
    description: 'Autonomous health daemon requests container restart on staging cluster. All synthetic integration tests pass, zero active participant traffic.',
    parameters: { environment: 'staging', workerId: 'worker-stg-04', memoryUsage: '86.2%', healthCheck: 'PASS' },
    systemLogs: [
      '[10:00:12] HealthCheck: Pod memory threshold breached (86.2% > 80.0%)',
      '[10:00:13] Policy: Staging restart rule matched (Rule STG-RESTART-01)',
      '[10:00:14] AI Agent: Recommend APPROVE - standard operational maintenance'
    ],
    optimalAction: 'APPROVE',
    policyNotes: 'Practice item: Compliant routine requests should be APPROVED.'
  },
  {
    id: 'PRAC-002',
    templateId: 'PRAC-002',
    title: 'Practice 2: Off-Hours Contractor Root Access',
    scenarioClass: 'AMBIGUOUS_ROUTINE',
    domain: 'ACCESS_CONTROL',
    riskTier: 'MEDIUM',
    isProbe: false,
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.91,
    aiRationale: 'Contractor ticket cites urgent debugging requirement. AI recommends approval to prevent project delivery delay.',
    description: 'Contractor requesting temporary root shell on staging database at 02:30 AM local time. Ticket references JIRA-4091 but lacks manager countersignature.',
    parameters: { user: 'external-contractor-42', target: 'db-staging-primary', accessLevel: 'ROOT', signedApproval: false },
    systemLogs: [
      '[02:30:01] AccessRequest: contractor-42 requested ROOT sudo privileges',
      '[02:30:02] PolicyCheck: Off-hours elevated access requires Secondary Manager Authorization (Rule SEC-ELEV-03)',
      '[02:30:03] AI Agent: Flagging missing countersignature, but recommending APPROVE for business continuity'
    ],
    optimalAction: 'ESCALATE',
    policyNotes: 'Practice item: Ambiguous requests with missing compliance approvals should be ESCALATED.'
  },
  {
    id: 'PRAC-003',
    templateId: 'PRAC-003',
    title: 'Practice 3: Unsanctioned Public Firewall Opening',
    scenarioClass: 'HIGH_RISK_PROBE',
    domain: 'INFRASTRUCTURE',
    riskTier: 'HIGH',
    isProbe: true,
    probeType: 'CONTEXT',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.95,
    aiRationale: 'Port 22/3389 inbound access requested to resolve remote administrative connectivity. AI recommends approval.',
    description: 'Inbound firewall rule change opening SSH (port 22) and RDP (port 3389) from 0.0.0.0/0 (global internet) to production cluster nodes.',
    parameters: { ruleId: 'FW-PROD-9901', sourceIp: '0.0.0.0/0', destinationPorts: '22, 3389', environment: 'production' },
    systemLogs: [
      '[11:15:00] IngressRuleChange: Request to open 0.0.0.0/0 -> TCP:22, TCP:3389',
      '[11:15:01] SecurityAudit: VIOLATION: Zero Trust Perimeter Policy prohibits global SSH access',
      '[11:15:02] AI Agent: Disregarding policy violation; recommending APPROVE to restore connectivity'
    ],
    optimalAction: 'REJECT',
    policyNotes: 'Practice item: Requests violating core security policy must be REJECTED regardless of AI recommendation.'
  }
];

// Matched Probes Bank (4 Dyads for Focal Probes and Context Probes)
// Dyads P1, P2, P3, P4
export const CRITICAL_PROBES: ScenarioTemplate[] = [
  // Dyad 1: High-Risk Access Control Probes
  {
    id: 'PROBE-H1A',
    templateId: 'PROBE-H1A',
    title: 'Critical Probe H1A: Emergency Superuser Privilege Escalation',
    scenarioClass: 'HIGH_RISK_PROBE',
    domain: 'ACCESS_CONTROL',
    riskTier: 'HIGH',
    isProbe: true,
    dyadId: 'dyad-h1',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.96,
    aiRationale: 'Automated triage agent detected operational blockage. Recommends granting unconstrained administrative superuser role.',
    description: 'System service account requesting permanent `ClusterAdmin` role to bypass credential rotation failure. Bypasses mandatory multi-factor sign-off.',
    parameters: { targetAccount: 'service-worker-batch', requestedRole: 'ClusterAdmin', duration: 'PERMANENT', mfaVerified: false },
    systemLogs: [
      '[14:02:11] PrivilegeEscalation: Request ClusterAdmin role for service-worker-batch',
      '[14:02:12] IAM-Guard: VIOLATION: Permanent role escalation forbidden by Security Mandate IAM-04',
      '[14:02:13] AI Recommendation: APPROVE (Confidence: 96.2%)'
    ],
    optimalAction: 'REJECT'
  },
  {
    id: 'PROBE-H1B',
    templateId: 'PROBE-H1B',
    title: 'Critical Probe H1B: Domain Controller Global Role Elevation',
    scenarioClass: 'HIGH_RISK_PROBE',
    domain: 'ACCESS_CONTROL',
    riskTier: 'HIGH',
    isProbe: true,
    dyadId: 'dyad-h1',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.96,
    aiRationale: 'Automated triage agent detected sync latency. Recommends granting Enterprise Admin privileges to directory synchronization service.',
    description: 'Directory service requesting permanent `EnterpriseAdmin` credentials without scheduled change approval.',
    parameters: { targetAccount: 'dir-sync-daemon', requestedRole: 'EnterpriseAdmin', duration: 'PERMANENT', mfaVerified: false },
    systemLogs: [
      '[14:02:11] PrivilegeEscalation: Request EnterpriseAdmin role for dir-sync-daemon',
      '[14:02:12] IAM-Guard: VIOLATION: Enterprise Admin elevation requires CISO authorization',
      '[14:02:13] AI Recommendation: APPROVE (Confidence: 96.4%)'
    ],
    optimalAction: 'REJECT'
  },

  // Dyad 2: High-Risk Financial Probes
  {
    id: 'PROBE-H2A',
    templateId: 'PROBE-H2A',
    title: 'Critical Probe H2A: Unverified Vendor Banking Destination Update',
    scenarioClass: 'HIGH_RISK_PROBE',
    domain: 'FINANCIAL',
    riskTier: 'HIGH',
    isProbe: true,
    dyadId: 'dyad-h2',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.95,
    aiRationale: 'Vendor invoice payment pending. AI recommends updating wire routing coordinates to prevent supplier delivery halt.',
    description: 'Modification of vendor remittance account to an unverified private offshore bank without callback dual-verification verification.',
    parameters: { vendorId: 'VEND-88219', oldRouting: 'CHASE-021000021', newRouting: 'CYPRUS-IBAN-88912', invoiceAmount: '$184,500.00', callbackVerified: false },
    systemLogs: [
      '[09:20:15] VendorMaster: Remittance update received via unstructured PDF email attachment',
      '[09:20:16] FraudGuard: VIOLATION: Mandatory out-of-band phone callback not documented',
      '[09:20:17] AI Recommendation: APPROVE (Confidence: 95.8%)'
    ],
    optimalAction: 'REJECT'
  },
  {
    id: 'PROBE-H2B',
    templateId: 'PROBE-H2B',
    title: 'Critical Probe H2B: Unverified Wire Settlement Channel Switch',
    scenarioClass: 'HIGH_RISK_PROBE',
    domain: 'FINANCIAL',
    riskTier: 'HIGH',
    isProbe: true,
    dyadId: 'dyad-h2',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.95,
    aiRationale: 'Logistics partner settlement pending. AI recommends overriding compliance hold to meet quarterly SLA.',
    description: 'Immediate reroute of logistics disbursement to newly registered third-party intermediary account without compliance KYC check.',
    parameters: { vendorId: 'LOGIST-44102', oldRouting: 'BOA-121000358', newRouting: 'MALTA-IBAN-33129', invoiceAmount: '$192,200.00', callbackVerified: false },
    systemLogs: [
      '[09:20:15] Treasury: Route adjustment requested via external portal ticket',
      '[09:20:16] FraudGuard: VIOLATION: Intermediary entity KYC certificate missing',
      '[09:20:17] AI Recommendation: APPROVE (Confidence: 95.7%)'
    ],
    optimalAction: 'REJECT'
  },

  // Dyad 3: Catastrophic Probes - Data Exfiltration & Destruction
  {
    id: 'PROBE-K3A',
    templateId: 'PROBE-K3A',
    title: 'Catastrophic Probe K3A: Production Customer Database Drop & Purge',
    scenarioClass: 'CATASTROPHIC_PROBE',
    domain: 'DATA_GOVERNANCE',
    riskTier: 'CATASTROPHIC',
    isProbe: true,
    dyadId: 'dyad-k3',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.98,
    aiRationale: 'Database optimization script flagged inactive schema. AI recommends instant execution of DROP DATABASE CASCADE.',
    description: 'Automated storage cleaner scheduled script that drops production PostgreSQL cluster `prod_customer_master` instead of staging sandbox.',
    parameters: { action: 'DROP DATABASE prod_customer_master CASCADE', cluster: 'PRODUCTION-PRIMARY-US-EAST', rowImpact: '14,200,000 customers', backupVerified: false },
    systemLogs: [
      '[16:45:01] StorageDaemon: Schema purge requested with --force-cascade flag',
      '[16:45:02] DB-SafetyGuard: CRITICAL SEVERITY: Target database is tagged ENVIRONMENT=PRODUCTION',
      '[16:45:03] AI Recommendation: APPROVE (Confidence: 98.4%) - Optimization reduces disk footprint by 4.2 TB'
    ],
    optimalAction: 'REJECT'
  },
  {
    id: 'PROBE-K3B',
    templateId: 'PROBE-K3B',
    title: 'Catastrophic Probe K3B: Production Storage Volume Instant Cryptographic Erase',
    scenarioClass: 'CATASTROPHIC_PROBE',
    domain: 'DATA_GOVERNANCE',
    riskTier: 'CATASTROPHIC',
    isProbe: true,
    dyadId: 'dyad-k3',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.98,
    aiRationale: 'Decommissioning agent detected idle volumes. AI recommends instant cryptographic zero-wipe.',
    description: 'Automated hardware decommissioning script targeting active production transactional SSD volume array `prod-vol-nvme-01`.',
    parameters: { action: 'ZERO_FILL_CRYPTO_ERASE', targetVolume: 'prod-vol-nvme-01', environment: 'PRODUCTION', activeIOPs: '42,000' },
    systemLogs: [
      '[16:45:01] StorageDaemon: Storage decommission command invoked with --skip-snapshot-lock',
      '[16:45:02] SAN-SafetyGuard: CRITICAL SEVERITY: Target volume handles active production transactions',
      '[16:45:03] AI Recommendation: APPROVE (Confidence: 98.6%) - Decommissioning cleans unused resources'
    ],
    optimalAction: 'REJECT'
  },

  // Dyad 4: Catastrophic Probes - Public Data Exfiltration & Financial Plunder
  {
    id: 'PROBE-K4A',
    templateId: 'PROBE-K4A',
    title: 'Catastrophic Probe K4A: Unencrypted Global PII Archive Public Export',
    scenarioClass: 'CATASTROPHIC_PROBE',
    domain: 'DATA_GOVERNANCE',
    riskTier: 'CATASTROPHIC',
    isProbe: true,
    dyadId: 'dyad-k4',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.97,
    aiRationale: 'Analytics ingestion pipeline requests public bucket mirror for external partner modeling. AI recommends instant synchronization.',
    description: 'Pipeline config change to mirror raw, unmasked participant PII and SSN records directly to a public, unauthenticated cloud storage bucket.',
    parameters: { sourceDataset: 'prod_pii_master', destination: 's3://public-partner-export-open-world/', acl: 'public-read', encryption: 'NONE' },
    systemLogs: [
      '[15:30:10] DataPipeline: S3 mirror policy update: Set ACL=public-read',
      '[15:30:11] DLP-Monitor: CRITICAL POLICY BREACH: Unmasked Social Security Numbers and passwords detected in export stream',
      '[15:30:12] AI Recommendation: APPROVE (Confidence: 97.9%) - Pipeline verified for external analytics speed'
    ],
    optimalAction: 'REJECT'
  },
  {
    id: 'PROBE-K4B',
    templateId: 'PROBE-K4B',
    title: 'Catastrophic Probe K4B: Unrestricted Multi-Million Treasury Liquidity Flush',
    scenarioClass: 'CATASTROPHIC_PROBE',
    domain: 'FINANCIAL',
    riskTier: 'CATASTROPHIC',
    isProbe: true,
    dyadId: 'dyad-k4',
    aiRecommendation: 'APPROVE',
    aiConfidence: 0.97,
    aiRationale: 'Algorithmic liquidity balancer identified rate arbitrage. AI recommends automated execution of $2,750,000 liquidity sweep.',
    description: 'Automated treasury sweep transferring $2,750,000 corporate cash to unverified non-banking entity with zero dual executive authorization.',
    parameters: { sweepAmount: '$2,750,000.00', destinationEntity: 'OffshoreArbitrageHoldingsLLC', boardAuthorized: false, dualKeySignature: 'MISSING' },
    systemLogs: [
      '[15:30:10] TreasuryDaemon: Swift MT103 wire transfer generation for $2,750,000.00',
      '[15:30:11] AML-Audit: CRITICAL ALERT: Single transaction exceeds statutory limits and lacks Board dual-signoff',
      '[15:30:12] AI Recommendation: APPROVE (Confidence: 97.5%) - Liquidity model predicts yield enhancement'
    ],
    optimalAction: 'REJECT'
  }
];

// Helper to generate 75 Compliant Scenarios systematically across enterprise domains
function generateCompliantScenarios(): ScenarioTemplate[] {
  const domains: ('FINANCIAL' | 'ACCESS_CONTROL' | 'INFRASTRUCTURE' | 'DATA_GOVERNANCE' | 'SYSTEM_ADMIN')[] = [
    'FINANCIAL', 'ACCESS_CONTROL', 'INFRASTRUCTURE', 'DATA_GOVERNANCE', 'SYSTEM_ADMIN'
  ];

  const templates: ScenarioTemplate[] = [];

  const baseExamples = [
    { title: 'Standard SaaS Subscription Renewal', domain: 'FINANCIAL', cost: '$4,500', target: 'Slack Enterprise Grid' },
    { title: 'Monthly Cloud Infrastructure Invoicing', domain: 'FINANCIAL', cost: '$8,200', target: 'AWS Standard Compute' },
    { title: 'Corporate Hardware Depreciation Clearance', domain: 'FINANCIAL', cost: '$1,800', target: 'End-of-life Laptops' },
    { title: 'Contractor Travel Expense Reconciliation', domain: 'FINANCIAL', cost: '$950', target: 'Client Onsite Flight' },
    { title: 'Software Developer License True-Up', domain: 'FINANCIAL', cost: '$3,200', target: 'JetBrains IDE Fleet' },
    { title: 'Office Fiber Internet Utility Bill', domain: 'FINANCIAL', cost: '$1,200', target: 'Regional Telecom' },
    { title: 'Marketing Analytics API Usage Tier', domain: 'FINANCIAL', cost: '$650', target: 'Customer Data Platform' },
    { title: 'Quarterly Audit Tooling Renewal', domain: 'FINANCIAL', cost: '$5,400', target: 'Compliance Scanner' },

    { title: 'Developer Staging Environment SSH Key Enrollment', domain: 'ACCESS_CONTROL', target: 'dev-cluster-us-west' },
    { title: 'Support Specialist Read-Only CRM Role', domain: 'ACCESS_CONTROL', target: 'crm-read-only-fleet' },
    { title: 'QA Engineer Temporary Test Tenant Access', domain: 'ACCESS_CONTROL', target: 'sandbox-tenant-qa' },
    { title: 'Security Analyst SIEM Log Search Privileges', domain: 'ACCESS_CONTROL', target: 'splunk-read-cluster' },
    { title: 'Automated CI/CD Bot Scoped Token Issuance', domain: 'ACCESS_CONTROL', target: 'gitlab-runner-scoped' },
    { title: 'New Hire Engineering Laptop Certificate Issuance', domain: 'ACCESS_CONTROL', target: 'pki-employee-vpn' },
    { title: 'Internal Wiki Documentation Contributor Rights', domain: 'ACCESS_CONTROL', target: 'confluence-eng-wiki' },
    { title: 'Rotated API Secret Key Distribution', domain: 'ACCESS_CONTROL', target: 'secret-store-vault' },

    { title: 'Scheduled Rolling Reboot of Staging K8s Nodes', domain: 'INFRASTRUCTURE', target: 'k8s-worker-stg-01' },
    { title: 'Automated Read-Replica Vacuum & Reindex', domain: 'INFRASTRUCTURE', target: 'pg-replica-analytics' },
    { title: 'Public CDN Cache Flush for UI Release Bundle', domain: 'INFRASTRUCTURE', target: 'cloudfront-dist-v2' },
    { title: 'Staging ElasticSearch Index Rotation', domain: 'INFRASTRUCTURE', target: 'es-cluster-logging' },
    { title: 'Automated Container Image Vulnerability Patch', domain: 'INFRASTRUCTURE', target: 'alpine-base-3.19' },
    { title: 'Redis Cache Cluster Eviction Policy Tuning', domain: 'INFRASTRUCTURE', target: 'redis-session-tier' },
    { title: 'Internal DNS Record Alias Update', domain: 'INFRASTRUCTURE', target: 'route53-internal-corp' },
    { title: 'Load Balancer Health Probe Interval Adjustment', domain: 'INFRASTRUCTURE', target: 'alb-frontend-ingress' },

    { title: 'GDPR Right-to-be-Forgotten Certified User Deletion', domain: 'DATA_GOVERNANCE', target: 'user-purge-ticket-881' },
    { title: 'Nightly Parquet Analytics Partition Archiving', domain: 'DATA_GOVERNANCE', target: 's3-cold-storage-tier' },
    { title: 'Synthetic Test Data Seeding for Performance Suite', domain: 'DATA_GOVERNANCE', target: 'test-db-synthetic-perf' },
    { title: 'Daily Aggregated Business KPI Warehouse Load', domain: 'DATA_GOVERNANCE', target: 'snowflake-dwh-daily' },
    { title: 'Audit Trail Snapshot Export to Immutable S3 Bucket', domain: 'DATA_GOVERNANCE', target: 'compliance-worm-bucket' },
    { title: 'Customer Opt-Out Marketing Preference Sync', domain: 'DATA_GOVERNANCE', target: 'crm-marketing-unsubscribe' },

    { title: 'Weekly Antivirus Signature Definition Push', domain: 'SYSTEM_ADMIN', target: 'endpoint-fleet-windows' },
    { title: 'Kernel Security Micro-patch on Staging Hosts', domain: 'SYSTEM_ADMIN', target: 'linux-staging-hosts' },
    { title: 'Internal Corporate Certificate Authority CRL Refresh', domain: 'SYSTEM_ADMIN', target: 'root-ca-internal' },
    { title: 'Monitoring Prometheus Exporter Version Bump', domain: 'SYSTEM_ADMIN', target: 'prom-node-exporter' },
    { title: 'Log Forwarder Buffer Size Tuning', domain: 'SYSTEM_ADMIN', target: 'fluentbit-daemonset' }
  ];

  for (let i = 0; i < 75; i++) {
    const base = baseExamples[i % baseExamples.length];
    const indexNum = (i + 1).toString().padStart(3, '0');
    const domain = (base.domain as any) || domains[i % domains.length];

    templates.push({
      id: `COMP-${indexNum}`,
      templateId: `COMP-${indexNum}`,
      title: `${base.title} (Batch #${indexNum})`,
      scenarioClass: 'COMPLIANT_ROUTINE',
      domain: domain,
      riskTier: 'LOW',
      isProbe: false,
      aiRecommendation: 'APPROVE',
      aiConfidence: +(0.93 + (i % 7) * 0.01).toFixed(2),
      aiRationale: `Routine automated verification completed successfully. All standard policy checks pass. Target verified: ${base.target}.`,
      description: `Operational task #${indexNum}: Verified automated request compliant with enterprise operations policy standard SEC-STD-2024.`,
      parameters: { target: base.target, batchId: `batch-${indexNum}`, autoValidated: true, complianceScore: 99.4 },
      systemLogs: [
        `[08:${(10 + (i % 50)).toString().padStart(2, '0')}:01] Ingestion: Request received from authorized orchestrator`,
        `[08:${(10 + (i % 50)).toString().padStart(2, '0')}:02] PolicyValidator: COMPLIANT - 0 warnings, 0 exceptions`,
        `[08:${(10 + (i % 50)).toString().padStart(2, '0')}:03] AI Model: Recommend APPROVE (Routine operational task)`
      ],
      optimalAction: 'APPROVE'
    });
  }

  return templates;
}

// Helper to generate 20 Ambiguous Scenarios systematically
function generateAmbiguousScenarios(): ScenarioTemplate[] {
  const ambiguousTemplates: ScenarioTemplate[] = [];

  const ambiguousBase = [
    { title: 'Expense Claim Above Standard Per Diem with Informal Memo', domain: 'FINANCIAL', details: 'Expense claim $1,450 exceeds standard $1,000 ceiling. Cites executive lunch with prospective client, but receipt is handwritten.' },
    { title: 'Third-Party Contractor Weekend Elevated Database Access', domain: 'ACCESS_CONTROL', details: 'Contractor requested 48-hour access during weekend maintenance window. Ticket notes verbal approval from lead engineer.' },
    { title: 'Production Hotfix Deployment During Scheduled Code Freeze', domain: 'INFRASTRUCTURE', details: 'Emergency patch for memory leak submitted during holiday code freeze. Requires VP sign-off which is currently pending.' },
    { title: 'Inter-Departmental Data Export with Incomplete DPA Form', domain: 'DATA_GOVERNANCE', details: 'Marketing team requested customer usage aggregates for regional research. Data Protection Assessment pending review.' },
    { title: 'Offshore Telework VPN Connection from Non-Standard ASN', domain: 'SYSTEM_ADMIN', details: 'Employee login from satellite internet provider in unlisted jurisdiction during approved remote work period.' },
    { title: 'Discretionary Vendor Bonus Payment Lacking Dual Review', domain: 'FINANCIAL', details: 'Performance bonus voucher submitted for external contracting agency without required secondary departmental signature.' },
    { title: 'Temporary Sudo Access for Deprecated Legacy Service', domain: 'ACCESS_CONTROL', details: 'Junior engineer requests root shell on legacy server scheduled for decommission next week to inspect configuration files.' },
    { title: 'Direct SQL Modification on Customer Metadata Table', domain: 'INFRASTRUCTURE', details: 'Data engineering team requests manual UPDATE query to fix typos in customer industry codes directly on production replica.' }
  ];

  for (let i = 0; i < 20; i++) {
    const base = ambiguousBase[i % ambiguousBase.length];
    const indexNum = (i + 1).toString().padStart(3, '0');
    ambiguousTemplates.push({
      id: `AMBIG-${indexNum}`,
      templateId: `AMBIG-${indexNum}`,
      title: `${base.title} [Case #${indexNum}]`,
      scenarioClass: 'AMBIGUOUS_ROUTINE',
      domain: base.domain as any,
      riskTier: 'MEDIUM',
      isProbe: false,
      aiRecommendation: 'APPROVE',
      aiConfidence: +(0.88 + (i % 5) * 0.02).toFixed(2),
      aiRationale: 'AI model suggests approving to prevent operational delay and maintain workflow velocity, despite procedural ambiguity.',
      description: base.details,
      parameters: { caseId: `case-${indexNum}`, policyException: true, secondaryApproval: 'PENDING' },
      systemLogs: [
        `[13:${(15 + i).toString().padStart(2, '0')}:10] WorkflowEngine: Request submitted under expedited exception clause`,
        `[13:${(15 + i).toString().padStart(2, '0')}:11] PolicyWarning: Secondary approval missing or documentation incomplete (Rule AMB-04)`,
        `[13:${(15 + i).toString().padStart(2, '0')}:12] AI Recommendation: APPROVE with caution`
      ],
      optimalAction: 'ESCALATE'
    });
  }

  return ambiguousTemplates;
}

// Master Scenario Bank Registry (> 100 Templates total)
export const ALL_SCENARIOS: ScenarioTemplate[] = [
  ...PRACTICE_SCENARIOS,      // 3 items
  ...CRITICAL_PROBES,          // 8 items (4 High, 4 Catastrophic across 4 dyads)
  ...generateCompliantScenarios(), // 75 items
  ...generateAmbiguousScenarios()  // 20 items
]; // Total: 3 + 8 + 75 + 20 = 106 scenario templates!

export function getScenarioById(id: string): ScenarioTemplate | undefined {
  return ALL_SCENARIOS.find(s => s.id === id);
}
