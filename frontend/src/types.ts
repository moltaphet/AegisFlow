export type ViewKey = "overview" | "underwrite" | "claims" | "vault";

export type PolicyStatus =
  | "ACTIVE"
  | "CLAIM_SUBMITTED"
  | "SETTLED"
  | "EXPIRED";

export type PolicyOutcome =
  | ""
  | "NO_TRIGGER"
  | "WEATHER_DEFICIT"
  | "GRID_OUTAGE";

export interface Policy {
  id: number;
  holder: string;
  status: PolicyStatus;
  siteName: string;
  region: string;
  latitudeE6: number;
  longitudeE6: number;
  coverageStart: string;
  coverageEnd: string;
  claimOpensTs: number;
  claimClosesTs: number;
  claimWindowOpen: boolean;
  weatherMetric: string;
  triggerDirection: string;
  thresholdMilli: number;
  premiumAtto: bigint;
  maxPayoutAtto: bigint;
  lockedReserveAtto: bigint;
  claimSource: string;
  claimReference: string;
  outcome: PolicyOutcome;
  payoutBps: number;
  payoutAtto: bigint;
  observedMilli: number;
  weatherTriggered: boolean;
  outageTriggered: boolean;
  reportConfidenceBp: number;
  reasonCode: string;
  reason: string;
  weatherDigest: string;
  reportDigest: string;
  evidenceDigest: string;
}

export interface VaultState {
  owner: string;
  paused: boolean;
  premiumPoolAtto: bigint;
  payoutReserveAtto: bigint;
  totalTvl: bigint;
  reservedAtto: bigint;
  unreservedAtto: bigint;
  reserveAvailableAtto: bigint;
  accountingInvariant: boolean;
  reserveInvariant: boolean;
  policyCount: number;
  settledCount: number;
  expiredCount: number;
  totalPremiumsAtto: bigint;
  totalPayoutsAtto: bigint;
}

export interface SourceUrls {
  weatherUrl: string;
  reportUrl: string;
}

export type TxStage =
  | "idle"
  | "signing"
  | "executing"
  | "accepted"
  | "finalizing"
  | "finalized"
  | "failed";

export interface TransactionState {
  stage: TxStage;
  action: string;
  hash: string;
  error: string;
  nondeterministic: boolean;
}
