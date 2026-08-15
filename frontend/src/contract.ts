import { createClient } from "genlayer-js";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import {
  ExecutionResult,
  TransactionStatus,
  type CalldataEncodable,
  type GenLayerTransaction,
  type Network,
} from "genlayer-js/types";
import schema from "../../contracts/aegis_flow.schema.json";
import {
  CONTRACT_ADDRESS,
  NETWORK_NAME,
  RPC_OVERRIDE,
} from "./config/contract";
import type { Policy, SourceUrls, TxStage, VaultState } from "./types";

const CHAINS = { studionet, localnet, testnetAsimov, testnetBradbury };
const CHAIN = CHAINS[NETWORK_NAME];

type Client = ReturnType<typeof createClient>;
type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>;
type EthereumProvider = NonNullable<ClientConfig["provider"]>;
type StageListener = (stage: TxStage, hash?: string) => void;

function clientConfig(extra: Partial<ClientConfig> = {}): ClientConfig {
  return {
    chain: CHAIN,
    ...(RPC_OVERRIDE ? { endpoint: RPC_OVERRIDE } : {}),
    ...extra,
  };
}

const readClient: Client = createClient(clientConfig());
let writeClient: Client | null = null;
let walletAddress: string | null = null;

export const NETWORK_LABEL = CHAIN.name;
export const METHOD_COUNT = Object.keys(schema.methods).length;

export function isConfigured(): boolean {
  return CONTRACT_ADDRESS !== null;
}

export function connectedAddress(): string | null {
  return walletAddress;
}

export async function connectWallet(): Promise<string> {
  const injected = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!injected) {
    throw new Error("No injected wallet was found in this browser.");
  }

  const accounts = (await injected.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("The wallet did not return an account.");

  writeClient = createClient(
    clientConfig({
      account: address as `0x${string}`,
      provider: injected,
    }),
  );
  await writeClient.connect(NETWORK_NAME as Network);
  walletAddress = address.toLowerCase();
  return walletAddress;
}

export function disconnectWallet(): void {
  writeClient = null;
  walletAddress = null;
}

function requireAddress(): `0x${string}` {
  if (!CONTRACT_ADDRESS) {
    throw new Error("No verified contract deployment is configured.");
  }
  return CONTRACT_ADDRESS;
}

function asRecord(value: CalldataEncodable): Record<string, CalldataEncodable> {
  if (value instanceof Map) {
    return Object.fromEntries(value) as Record<string, CalldataEncodable>;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, CalldataEncodable>;
  }
  throw new Error("The contract returned an unexpected response.");
}

function readString(value: CalldataEncodable | undefined): string {
  return value == null ? "" : String(value);
}

function readBig(value: CalldataEncodable | undefined): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.trim() !== "") return BigInt(value);
  return 0n;
}

function readNumber(value: CalldataEncodable | undefined): number {
  return Number(readBig(value));
}

function readBool(value: CalldataEncodable | undefined): boolean {
  return value === true || value === 1 || value === "true";
}

function requireSuccessfulExecution(
  receipt: GenLayerTransaction,
  status: "accepted" | "finalized",
): void {
  if (
    receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN ||
    receipt.txExecutionResult === 1
  ) {
    return;
  }
  const result =
    receipt.txExecutionResultName ?? receipt.txExecutionResult ?? "UNKNOWN";
  throw new Error(`Contract execution failed at ${status} status (${result}).`);
}

async function read(
  functionName: string,
  args: CalldataEncodable[] = [],
): Promise<CalldataEncodable> {
  return readClient.readContract({
    address: requireAddress(),
    functionName,
    args,
  });
}

export async function getVaultState(): Promise<VaultState> {
  const value = asRecord(await read("get_vault_state"));
  return {
    owner: readString(value.owner).toLowerCase(),
    paused: readBool(value.paused),
    premiumPoolAtto: readBig(value.premium_pool_atto),
    payoutReserveAtto: readBig(value.payout_reserve_atto),
    totalTvl: readBig(value.total_tvl),
    reservedAtto: readBig(value.reserved_atto),
    unreservedAtto: readBig(value.unreserved_atto),
    reserveAvailableAtto: readBig(value.reserve_available_atto),
    accountingInvariant: readBool(value.accounting_invariant),
    reserveInvariant: readBool(value.reserve_invariant),
    policyCount: readNumber(value.policy_count),
    settledCount: readNumber(value.settled_count),
    expiredCount: readNumber(value.expired_count),
    totalPremiumsAtto: readBig(value.total_premiums_atto),
    totalPayoutsAtto: readBig(value.total_payouts_atto),
  };
}

export async function getPolicy(id: number): Promise<Policy> {
  const value = asRecord(await read("get_policy", [BigInt(id)]));
  return {
    id: readNumber(value.id),
    holder: readString(value.holder).toLowerCase(),
    status: readString(value.status) as Policy["status"],
    siteName: readString(value.site_name),
    region: readString(value.region),
    latitudeE6: readNumber(value.latitude_e6),
    longitudeE6: readNumber(value.longitude_e6),
    coverageStart: readString(value.coverage_start),
    coverageEnd: readString(value.coverage_end),
    claimOpensTs: readNumber(value.claim_opens_ts),
    claimClosesTs: readNumber(value.claim_closes_ts),
    claimWindowOpen: readBool(value.claim_window_open),
    weatherMetric: readString(value.weather_metric),
    triggerDirection: readString(value.trigger_direction),
    thresholdMilli: readNumber(value.threshold_milli),
    premiumAtto: readBig(value.premium_atto),
    maxPayoutAtto: readBig(value.max_payout_atto),
    lockedReserveAtto: readBig(value.locked_reserve_atto),
    claimSource: readString(value.claim_source),
    claimReference: readString(value.claim_reference),
    outcome: readString(value.outcome) as Policy["outcome"],
    payoutBps: readNumber(value.payout_bps),
    payoutAtto: readBig(value.payout_atto),
    observedMilli: readNumber(value.observed_milli),
    weatherTriggered: readBool(value.weather_triggered),
    outageTriggered: readBool(value.outage_triggered),
    reportConfidenceBp: readNumber(value.report_confidence_bp),
    reasonCode: readString(value.reason_code),
    reason: readString(value.reason),
    weatherDigest: readString(value.weather_digest),
    reportDigest: readString(value.report_digest),
    evidenceDigest: readString(value.evidence_digest),
  };
}

export async function getRecentPolicies(count: number): Promise<Policy[]> {
  const first = Math.max(1, count - 23);
  const ids = Array.from(
    { length: Math.max(0, count - first + 1) },
    (_, index) => count - index,
  );
  return Promise.all(ids.map(getPolicy));
}

export async function getSourceUrls(id: number): Promise<SourceUrls> {
  const value = asRecord(await read("get_source_urls", [BigInt(id)]));
  return {
    weatherUrl: readString(value.weather_url),
    reportUrl: readString(value.report_url),
  };
}

async function write(
  functionName: string,
  args: CalldataEncodable[],
  value: bigint,
  onStage: StageListener,
): Promise<string> {
  if (!writeClient) {
    throw new Error("Connect a wallet before sending a transaction.");
  }

  onStage("signing");
  const hash = await writeClient.writeContract({
    address: requireAddress(),
    functionName,
    args,
    value,
  });
  const textHash = String(hash);
  onStage("executing", textHash);

  const acceptedReceipt = await readClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 10_000,
    retries: 120,
  });
  requireSuccessfulExecution(acceptedReceipt, "accepted");
  onStage("accepted", textHash);

  const finalizedReceipt = await readClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 10_000,
    retries: 120,
  });
  requireSuccessfulExecution(finalizedReceipt, "finalized");
  onStage("finalized", textHash);
  return textHash;
}

export interface CreatePolicyInput {
  siteName: string;
  region: string;
  latitudeE6: bigint;
  longitudeE6: bigint;
  coverageStart: string;
  coverageEnd: string;
  weatherMetric: string;
  triggerDirection: string;
  thresholdMilli: bigint;
  premiumAtto: bigint;
}

export function createPolicy(input: CreatePolicyInput, onStage: StageListener) {
  return write(
    "create_policy",
    [
      input.siteName,
      input.region,
      input.latitudeE6,
      input.longitudeE6,
      input.coverageStart,
      input.coverageEnd,
      input.weatherMetric,
      input.triggerDirection,
      input.thresholdMilli,
    ],
    input.premiumAtto,
    onStage,
  );
}

export function submitClaim(
  policyId: number,
  source: string,
  reference: string,
  onStage: StageListener,
) {
  return write("submit_claim", [BigInt(policyId), source, reference], 0n, onStage);
}

export function evaluateClaim(policyId: number, onStage: StageListener) {
  return write("evaluate_claim", [BigInt(policyId)], 0n, onStage);
}

export function expirePolicy(policyId: number, onStage: StageListener) {
  return write("expire_policy", [BigInt(policyId)], 0n, onStage);
}

export function fundReserve(amount: bigint, onStage: StageListener) {
  return write("fund_payout_reserve", [], amount, onStage);
}

export function allocatePremiums(amount: bigint, onStage: StageListener) {
  return write("allocate_premiums_to_reserve", [amount], 0n, onStage);
}

export function removeLiquidity(
  amount: bigint,
  pool: "PREMIUM" | "RESERVE",
  onStage: StageListener,
) {
  return write("remove_liquidity", [amount, pool], 0n, onStage);
}

export function setPaused(paused: boolean, onStage: StageListener) {
  return write("set_paused", [paused], 0n, onStage);
}
