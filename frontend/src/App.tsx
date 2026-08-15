import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Banknote,
  Bolt,
  Check,
  ChevronRight,
  CircleDollarSign,
  CloudRain,
  Database,
  FileCheck2,
  Gauge,
  Landmark,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Pause,
  Play,
  Plus,
  Power,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Unplug,
  WalletCards,
  X,
} from "lucide-react";
import * as contract from "./contract";
import { CONTRACT_ADDRESS, DEPLOYMENT_STATUS } from "./config/contract";
import type {
  Policy,
  SourceUrls,
  TransactionState,
  TxStage,
  VaultState,
  ViewKey,
} from "./types";

const EMPTY_VAULT: VaultState = {
  owner: "",
  paused: false,
  premiumPoolAtto: 0n,
  payoutReserveAtto: 0n,
  totalTvl: 0n,
  reservedAtto: 0n,
  unreservedAtto: 0n,
  reserveAvailableAtto: 0n,
  accountingInvariant: true,
  reserveInvariant: true,
  policyCount: 0,
  settledCount: 0,
  expiredCount: 0,
  totalPremiumsAtto: 0n,
  totalPayoutsAtto: 0n,
};

const EMPTY_TX: TransactionState = {
  stage: "idle",
  action: "",
  hash: "",
  error: "",
  nondeterministic: false,
};

const NAV_ITEMS: Array<{
  key: ViewKey;
  label: string;
  icon: typeof Activity;
}> = [
  { key: "overview", label: "Exposure", icon: Gauge },
  { key: "underwrite", label: "Underwrite", icon: FileCheck2 },
  { key: "claims", label: "Claims", icon: SearchCheck },
  { key: "vault", label: "Vault", icon: Landmark },
];

type StageListener = (stage: TxStage, hash?: string) => void;
type RunAction = (
  label: string,
  nondeterministic: boolean,
  operation: (onStage: StageListener) => Promise<unknown>,
) => Promise<boolean>;

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function decimalToScaled(raw: string, decimals: number, label: string): bigint {
  const value = raw.trim();
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`${label} must be a decimal number.`);
  const fraction = match[3] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`${label} supports at most ${decimals} decimal places.`);
  }
  const magnitude = BigInt(match[2]) * 10n ** BigInt(decimals);
  const fractional = BigInt(
    (fraction + "0".repeat(decimals)).slice(0, decimals) || "0",
  );
  const scaled = magnitude + fractional;
  return match[1] === "-" ? -scaled : scaled;
}

function formatGen(value: bigint, precision = 2): string {
  const whole = value / 10n ** 18n;
  const remainder = value % 10n ** 18n;
  const fraction = remainder.toString().padStart(18, "0").slice(0, precision);
  return `${whole.toLocaleString()}${precision ? `.${fraction}` : ""}`;
}

function formatDate(ts: number): string {
  if (!ts) return "Not available";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ts * 1000));
}

function shortAddress(value: string | null): string {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortDigest(value: string): string {
  return value ? `${value.slice(0, 10)}...${value.slice(-8)}` : "Pending";
}

function percent(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 10_000n) / total) / 100;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^.*\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*/, "")
    .slice(0, 360);
}

function metricLabel(metric: string): string {
  return metric
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function statusTone(policy: Policy): string {
  if (policy.status === "SETTLED" && policy.outcome === "GRID_OUTAGE") {
    return "danger";
  }
  if (
    policy.status === "CLAIM_SUBMITTED" ||
    policy.outcome === "WEATHER_DEFICIT"
  ) {
    return "warning";
  }
  if (policy.status === "ACTIVE") return "active";
  if (policy.status === "EXPIRED") return "muted";
  return "neutral";
}

function outcomeLabel(policy: Policy): string {
  const label = policy.status === "SETTLED" ? policy.outcome : policy.status;
  return (label || "SETTLED").replace(/_/g, " ");
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function DeploymentEmpty() {
  return (
    <div className="deployment-empty">
      <div className="empty-symbol" aria-hidden="true">
        <Unplug size={30} />
      </div>
      <div>
        <span className="kicker">Contract link required</span>
        <h2>No verified StudioNet deployment</h2>
        <p>
          Set <code>VITE_CONTRACT_ADDRESS</code> or complete the verified
          deployment workflow. Live reads and transaction controls will then
          activate automatically.
        </p>
      </div>
    </div>
  );
}

function DataState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="deployment-empty">
      <div className="empty-symbol" aria-hidden="true">
        {loading ? <LoaderCircle size={30} className="spin" /> : <AlertTriangle size={30} />}
      </div>
      <div>
        <span className="kicker">Live contract read</span>
        <h2>{loading ? "Loading vault state" : "Vault data unavailable"}</h2>
        <p>
          {loading
            ? "Reading the deployed contract before showing policy or custody values."
            : error || "The configured RPC did not return a vault state."}
        </p>
        {!loading && (
          <button className="secondary-button data-retry" type="button" onClick={onRetry}>
            <RefreshCw size={16} /> Retry read
          </button>
        )}
      </div>
    </div>
  );
}

function InvariantBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`invariant ${ok ? "ok" : "fault"}`}>
      {ok ? <Check size={13} /> : <AlertTriangle size={13} />}
      {label}
    </span>
  );
}

function PolicyTable({ policies }: { policies: Policy[] }) {
  if (policies.length === 0) {
    return (
      <div className="table-empty">
        <Database size={22} />
        <span>No policies recorded</span>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Site / region</th>
            <th>Coverage</th>
            <th>Locked</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((policy) => (
            <tr key={policy.id}>
              <td className="mono">AF-{String(policy.id).padStart(4, "0")}</td>
              <td>
                <strong>{policy.siteName}</strong>
                <span>{policy.region}</span>
              </td>
              <td>
                <strong>{policy.coverageStart}</strong>
                <span>to {policy.coverageEnd}</span>
              </td>
              <td className="mono">{formatGen(policy.lockedReserveAtto)} GEN</td>
              <td>
                <span className={`status ${statusTone(policy)}`}>
                  {outcomeLabel(policy)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({
  configured,
  loading,
  vault,
  policies,
}: {
  configured: boolean;
  loading: boolean;
  vault: VaultState;
  policies: Policy[];
}) {
  if (!configured) return <DeploymentEmpty />;
  const utilization = percent(vault.reservedAtto, vault.payoutReserveAtto);
  const livePolicies = policies.filter(
    (policy) =>
      policy.status === "ACTIVE" || policy.status === "CLAIM_SUBMITTED",
  ).length;

  return (
    <div className="view-stack">
      <section className="instrument-hero">
        <div className="hero-reading">
          <div className="section-heading inverse">
            <span className="kicker">Vault capacity / native GEN</span>
            <h1>{loading ? "--" : formatGen(vault.totalTvl)}</h1>
          </div>
          <div className="capacity-rail" aria-label={`${utilization}% reserved`}>
            <span style={{ width: `${Math.min(utilization, 100)}%` }} />
          </div>
          <div className="rail-labels">
            <span>
              <b>{formatGen(vault.reservedAtto)} GEN</b> policy locked
            </span>
            <span>
              <b>{formatGen(vault.reserveAvailableAtto)} GEN</b> reserve available
            </span>
          </div>
        </div>
        <div className="hero-site">
          <img
            src="https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=1200&q=82"
            alt="Solar panels at a renewable generation site"
          />
          <span>Renewable microgrid risk pool</span>
        </div>
      </section>

      <section className="telemetry-grid" aria-label="Vault telemetry">
        <article>
          <span className="metric-icon"><ShieldCheck size={18} /></span>
          <div><span>Active exposure</span><strong>{livePolicies}</strong></div>
          <small>{formatGen(vault.reservedAtto)} GEN maximum liability</small>
        </article>
        <article>
          <span className="metric-icon"><Banknote size={18} /></span>
          <div><span>Premium pool</span><strong>{formatGen(vault.premiumPoolAtto)}</strong></div>
          <small>GEN earned and unallocated</small>
        </article>
        <article>
          <span className="metric-icon"><Activity size={18} /></span>
          <div><span>Settled claims</span><strong>{vault.settledCount}</strong></div>
          <small>{formatGen(vault.totalPayoutsAtto)} GEN paid</small>
        </article>
        <article>
          <span className="metric-icon"><BadgeCheck size={18} /></span>
          <div><span>Accounting state</span><strong>{vault.accountingInvariant && vault.reserveInvariant ? "Sound" : "Fault"}</strong></div>
          <small>Two custody invariants monitored</small>
        </article>
      </section>

      <section className="work-section">
        <div className="section-heading row-heading">
          <div>
            <span className="kicker">Latest on-chain records</span>
            <h2>Policy exposure</h2>
          </div>
          <div className="invariant-set">
            <InvariantBadge ok={vault.accountingInvariant} label="TVL balanced" />
            <InvariantBadge ok={vault.reserveInvariant} label="Reserve solvent" />
          </div>
        </div>
        <PolicyTable policies={policies} />
      </section>
    </div>
  );
}

function Underwrite({
  configured,
  wallet,
  vault,
  busy,
  runAction,
}: {
  configured: boolean;
  wallet: string | null;
  vault: VaultState;
  busy: boolean;
  runAction: RunAction;
}) {
  const [siteName, setSiteName] = useState("");
  const [region, setRegion] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [coverageStart, setCoverageStart] = useState(futureDate(30));
  const [coverageEnd, setCoverageEnd] = useState(futureDate(32));
  const [metric, setMetric] = useState("PRECIPITATION_SUM");
  const [direction, setDirection] = useState("BELOW");
  const [threshold, setThreshold] = useState("15");
  const [premium, setPremium] = useState("1");
  const [formError, setFormError] = useState("");

  let premiumAtto = 0n;
  try {
    premiumAtto = decimalToScaled(premium, 18, "Premium");
  } catch {
    premiumAtto = 0n;
  }
  const maximumPayout = premiumAtto > 0n ? premiumAtto * 10n : 0n;
  const hasCapacity = maximumPayout <= vault.reserveAvailableAtto;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      if (!siteName.trim() || !region.trim()) {
        throw new Error("Site name and region are required.");
      }
      if (coverageEnd < coverageStart) {
        throw new Error("Coverage end must follow coverage start.");
      }
      const amount = decimalToScaled(premium, 18, "Premium");
      if (amount <= 0n) throw new Error("Premium must be positive.");
      if (amount * 10n > vault.reserveAvailableAtto) {
        throw new Error("Available reserve cannot cover the maximum payout.");
      }
      await runAction("Underwrite policy", false, (onStage) =>
        contract.createPolicy(
          {
            siteName: siteName.trim(),
            region: region.trim(),
            latitudeE6: decimalToScaled(latitude, 6, "Latitude"),
            longitudeE6: decimalToScaled(longitude, 6, "Longitude"),
            coverageStart,
            coverageEnd,
            weatherMetric: metric,
            triggerDirection: direction,
            thresholdMilli: decimalToScaled(threshold, 3, "Threshold"),
            premiumAtto: amount,
          },
          onStage,
        ),
      );
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  if (!configured) return <DeploymentEmpty />;

  return (
    <div className="split-workspace">
      <section className="work-section form-section">
        <div className="section-heading">
          <span className="kicker">New policy</span>
          <h1>Underwrite a microgrid</h1>
        </div>
        <form onSubmit={submit} className="form-grid">
          <Field label="Site name">
            <input value={siteName} onChange={(event) => setSiteName(event.target.value)} maxLength={96} placeholder="West feeder solar array" required />
          </Field>
          <Field label="Region">
            <input value={region} onChange={(event) => setRegion(event.target.value)} maxLength={120} placeholder="New York, NY" required />
          </Field>
          <Field label="Latitude" hint="Decimal degrees">
            <input value={latitude} onChange={(event) => setLatitude(event.target.value)} inputMode="decimal" placeholder="40.7128" required />
          </Field>
          <Field label="Longitude" hint="Decimal degrees">
            <input value={longitude} onChange={(event) => setLongitude(event.target.value)} inputMode="decimal" placeholder="-74.006" required />
          </Field>
          <Field label="Coverage start">
            <input type="date" min={futureDate(2)} max={futureDate(365)} value={coverageStart} onChange={(event) => setCoverageStart(event.target.value)} required />
          </Field>
          <Field label="Coverage end" hint="31 days maximum">
            <input type="date" min={coverageStart} value={coverageEnd} onChange={(event) => setCoverageEnd(event.target.value)} required />
          </Field>
          <Field label="Weather signal">
            <select value={metric} onChange={(event) => setMetric(event.target.value)}>
              <option value="PRECIPITATION_SUM">Precipitation sum</option>
              <option value="TEMPERATURE_MAX">Maximum temperature</option>
              <option value="TEMPERATURE_MIN">Minimum temperature</option>
            </select>
          </Field>
          <Field label="Trigger direction">
            <select value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="BELOW">Below threshold</option>
              <option value="ABOVE">Above threshold</option>
            </select>
          </Field>
          <Field label="Threshold" hint={metric === "PRECIPITATION_SUM" ? "Millimeters" : "Degrees Celsius"}>
            <input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" required />
          </Field>
          <Field label="Premium" hint="Native GEN">
            <input value={premium} onChange={(event) => setPremium(event.target.value)} inputMode="decimal" required />
          </Field>

          {formError && <div className="form-error full-span"><AlertTriangle size={16} />{formError}</div>}
          <div className="form-actions full-span">
            <button className="primary-button" type="submit" disabled={!wallet || vault.paused || !hasCapacity || busy}>
              <Plus size={17} /> Underwrite policy
            </button>
            {!wallet && <span className="action-note">Connect a wallet to sign</span>}
            {vault.paused && <span className="action-note danger-text">Underwriting is paused</span>}
          </div>
        </form>
      </section>

      <aside className="inspection-panel">
        <div className="panel-title"><CircleDollarSign size={18} /><span>Capital check</span></div>
        <div className="capital-number"><span>Maximum payout</span><strong>{formatGen(maximumPayout)}<small> GEN</small></strong></div>
        <dl className="detail-list">
          <div><dt>Premium</dt><dd>{formatGen(premiumAtto)} GEN</dd></div>
          <div><dt>Reserve multiplier</dt><dd>10x</dd></div>
          <div><dt>Available reserve</dt><dd>{formatGen(vault.reserveAvailableAtto)} GEN</dd></div>
          <div><dt>Weather payout</dt><dd>50%</dd></div>
          <div><dt>Confirmed outage</dt><dd>100%</dd></div>
        </dl>
        <div className={`capacity-verdict ${hasCapacity ? "pass" : "fail"}`}>
          {hasCapacity ? <ShieldCheck size={19} /> : <AlertTriangle size={19} />}
          <div><strong>{hasCapacity ? "Capacity available" : "Reserve shortfall"}</strong><span>{hasCapacity ? "Maximum liability can be locked." : "Fund or allocate reserve before underwriting."}</span></div>
        </div>
        <div className="source-strip">
          <CloudRain size={16} /><span>Open-Meteo ERA5</span><ChevronRight size={14} /><Bolt size={16} /><span>Infrastructure report</span>
        </div>
      </aside>
    </div>
  );
}

function Claims({
  configured,
  wallet,
  policies,
  busy,
  runAction,
}: {
  configured: boolean;
  wallet: string | null;
  policies: Policy[];
  busy: boolean;
  runAction: RunAction;
}) {
  const [policyId, setPolicyId] = useState(0);
  const [source, setSource] = useState("NEWS");
  const [reference, setReference] = useState("");
  const [urls, setUrls] = useState<SourceUrls | null>(null);
  const [sourceError, setSourceError] = useState("");

  const selected = policies.find((policy) => policy.id === policyId) ?? policies[0];

  useEffect(() => {
    if (!selected) return;
    if (policyId === 0) setPolicyId(selected.id);
    let active = true;
    contract
      .getSourceUrls(selected.id)
      .then((value) => {
        if (active) setUrls(value);
      })
      .catch(() => {
        if (active) setUrls(null);
      });
    return () => {
      active = false;
    };
  }, [policyId, selected]);

  async function submitClaim(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSourceError("");
    if (source === "NEWS" && reference.trim()) {
      setSourceError("Google News claims require an empty reference.");
      return;
    }
    if (source !== "NEWS" && !reference.trim()) {
      setSourceError(`${source} requires a bounded event reference.`);
      return;
    }
    await runAction("Submit claim", false, (onStage) =>
      contract.submitClaim(selected.id, source, reference.trim(), onStage),
    );
  }

  if (!configured) return <DeploymentEmpty />;
  if (policies.length === 0) {
    return (
      <div className="deployment-empty">
        <div className="empty-symbol"><SearchCheck size={30} /></div>
        <div>
          <span className="kicker">Claims desk</span>
          <h2>No policies available</h2>
          <p>Underwrite a policy before opening an evidence record.</p>
        </div>
      </div>
    );
  }

  const isHolder = selected?.holder === wallet;
  const afterClaimWindow = selected
    ? Date.now() / 1000 > selected.claimClosesTs
    : false;
  const maySubmit =
    selected?.status === "ACTIVE" && selected.claimWindowOpen && isHolder;
  const mayEvaluate = selected?.status === "CLAIM_SUBMITTED";
  const mayExpire =
    (selected?.status === "ACTIVE" || selected?.status === "CLAIM_SUBMITTED") &&
    afterClaimWindow;

  return (
    <div className="claims-workspace">
      <section className="claim-index">
        <div className="section-heading compact-heading">
          <span className="kicker">Policy register</span>
          <h1>Claims</h1>
        </div>
        <div className="policy-selector" role="listbox" aria-label="Policies">
          {policies.map((policy) => (
            <button
              type="button"
              key={policy.id}
              className={selected?.id === policy.id ? "selected" : ""}
              onClick={() => setPolicyId(policy.id)}
            >
              <span className={`status-dot ${statusTone(policy)}`} />
              <span>
                <strong>AF-{String(policy.id).padStart(4, "0")}</strong>
                <small>{policy.siteName}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className="claim-record">
          <header className="record-header">
            <div>
              <span className="kicker">AF-{String(selected.id).padStart(4, "0")}</span>
              <h2>{selected.siteName}</h2>
              <p>{selected.region} / {selected.coverageStart} to {selected.coverageEnd}</p>
            </div>
            <span className={`status large ${statusTone(selected)}`}>
              {outcomeLabel(selected)}
            </span>
          </header>

          <div className="claim-facts">
            <div><span>Weather signal</span><strong>{metricLabel(selected.weatherMetric)}</strong><small>{selected.triggerDirection.toLowerCase()} {selected.thresholdMilli / 1000}</small></div>
            <div><span>Maximum payout</span><strong>{formatGen(selected.maxPayoutAtto)} GEN</strong><small>{formatGen(selected.lockedReserveAtto)} GEN still locked</small></div>
            <div><span>Claim window</span><strong>{selected.claimWindowOpen ? "Open" : "Closed"}</strong><small>{formatDate(selected.claimOpensTs)} to {formatDate(selected.claimClosesTs)}</small></div>
          </div>

          {selected.status === "ACTIVE" && (
            <form className="claim-form" onSubmit={submitClaim}>
              <div className="section-heading compact-heading">
                <span className="kicker">Infrastructure evidence</span>
                <h3>Open claim record</h3>
              </div>
              <div className="inline-fields">
                <Field label="Report source">
                  <select value={source} onChange={(event) => { setSource(event.target.value); setReference(""); }}>
                    <option value="NEWS">Google News</option>
                    <option value="FEMA">FEMA disaster declaration</option>
                    <option value="USGS">USGS event</option>
                  </select>
                </Field>
                <Field label="Event reference" hint={source === "NEWS" ? "Must remain empty" : source === "FEMA" ? "Numeric disaster number" : "USGS event ID"}>
                  <input value={reference} onChange={(event) => setReference(event.target.value)} disabled={source === "NEWS"} placeholder={source === "FEMA" ? "4724" : source === "USGS" ? "us6000jllz" : "Derived from region and dates"} />
                </Field>
                <button className="primary-button align-end" type="submit" disabled={!maySubmit || busy}>
                  <Link2 size={17} /> Submit claim
                </button>
              </div>
              {sourceError && <div className="form-error"><AlertTriangle size={16} />{sourceError}</div>}
              {!isHolder && <p className="permission-note"><LockKeyhole size={14} /> Only the connected policy holder can submit this claim.</p>}
              {isHolder && !selected.claimWindowOpen && <p className="permission-note"><LockKeyhole size={14} /> Claim submission opens {formatDate(selected.claimOpensTs)}.</p>}
            </form>
          )}

          {selected.status !== "ACTIVE" && (
            <div className="evidence-grid">
              <div className="evidence-source">
                <span className="source-icon weather"><CloudRain size={18} /></span>
                <div><span>Weather archive</span><strong>Open-Meteo ERA5</strong><code title={urls?.weatherUrl}>{urls?.weatherUrl || "Derived URL pending"}</code></div>
              </div>
              <div className="evidence-source">
                <span className="source-icon infrastructure"><Bolt size={18} /></span>
                <div><span>Infrastructure report</span><strong>{selected.claimSource || "Pending"}{selected.claimReference ? ` / ${selected.claimReference}` : ""}</strong><code title={urls?.reportUrl}>{urls?.reportUrl || "Derived URL pending"}</code></div>
              </div>
            </div>
          )}

          {selected.status === "SETTLED" && (
            <div className="settlement-ledger">
              <div className="payout-reading">
                <span>Final payout</span>
                <strong>{formatGen(selected.payoutAtto)}<small> GEN</small></strong>
                <em>{selected.payoutBps / 100}% of maximum</em>
              </div>
              <dl className="detail-list evidence-detail">
                <div><dt>Weather trigger</dt><dd>{selected.weatherTriggered ? "Yes" : "No"}</dd></div>
                <div><dt>Grid outage</dt><dd>{selected.outageTriggered ? "Yes" : "No"}</dd></div>
                <div><dt>Observed value</dt><dd>{selected.observedMilli / 1000}</dd></div>
                <div><dt>Report confidence</dt><dd>{selected.reportConfidenceBp / 100}%</dd></div>
                <div><dt>Reason code</dt><dd>{selected.reasonCode || "None"}</dd></div>
                <div><dt>Evidence digest</dt><dd className="mono" title={selected.evidenceDigest}>{shortDigest(selected.evidenceDigest)}</dd></div>
              </dl>
              <p className="settlement-reason">{selected.reason}</p>
            </div>
          )}

          <footer className="record-actions">
            {selected.status === "CLAIM_SUBMITTED" && (
              <button className="primary-button" type="button" disabled={!wallet || !mayEvaluate || busy} onClick={() => runAction("Evaluate claim", true, (onStage) => contract.evaluateClaim(selected.id, onStage))}>
                <SearchCheck size={17} /> Evaluate evidence
              </button>
            )}
            {(selected.status === "ACTIVE" || selected.status === "CLAIM_SUBMITTED") && (
              <button className="secondary-button" type="button" disabled={!wallet || !mayExpire || busy} onClick={() => runAction("Expire policy", false, (onStage) => contract.expirePolicy(selected.id, onStage))}>
                <X size={16} /> Expire policy
              </button>
            )}
          </footer>
        </section>
      )}
    </div>
  );
}

function Vault({
  configured,
  wallet,
  vault,
  busy,
  runAction,
}: {
  configured: boolean;
  wallet: string | null;
  vault: VaultState;
  busy: boolean;
  runAction: RunAction;
}) {
  const [fundAmount, setFundAmount] = useState("10");
  const [allocationAmount, setAllocationAmount] = useState("1");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [withdrawPool, setWithdrawPool] = useState<"PREMIUM" | "RESERVE">("PREMIUM");
  const [localError, setLocalError] = useState("");

  if (!configured) return <DeploymentEmpty />;
  const isOwner = Boolean(wallet && vault.owner && wallet === vault.owner);
  const reserveShare = percent(vault.payoutReserveAtto, vault.totalTvl);

  async function amountAction(
    event: FormEvent,
    label: string,
    raw: string,
    operation: (amount: bigint, onStage: StageListener) => Promise<unknown>,
  ) {
    event.preventDefault();
    setLocalError("");
    try {
      const amount = decimalToScaled(raw, 18, label);
      if (amount <= 0n) throw new Error(`${label} must be positive.`);
      await runAction(label, false, (onStage) => operation(amount, onStage));
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  return (
    <div className="view-stack">
      <section className="vault-balance">
        <div className="section-heading inverse">
          <span className="kicker">Custodied native GEN</span>
          <h1>{formatGen(vault.totalTvl)}</h1>
        </div>
        <div className="pool-composition" aria-label={`${reserveShare}% payout reserve`}>
          <span className="premium-part" style={{ width: `${100 - reserveShare}%` }} />
          <span className="reserve-part" style={{ width: `${reserveShare}%` }} />
        </div>
        <div className="pool-legend">
          <span><i className="premium-key" />Premium pool <b>{formatGen(vault.premiumPoolAtto)}</b></span>
          <span><i className="reserve-key" />Payout reserve <b>{formatGen(vault.payoutReserveAtto)}</b></span>
          <span><i className="locked-key" />Policy locked <b>{formatGen(vault.reservedAtto)}</b></span>
        </div>
      </section>

      <section className="vault-actions">
        <article className="action-module">
          <div className="module-heading"><ArrowDownToLine size={19} /><div><h2>Fund reserve</h2><p>Anyone may add payout liquidity.</p></div></div>
          <form onSubmit={(event) => amountAction(event, "Reserve funding", fundAmount, contract.fundReserve)}>
            <Field label="Amount / GEN"><input value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" /></Field>
            <button className="primary-button" disabled={!wallet || busy}><ArrowDownToLine size={16} /> Fund reserve</button>
          </form>
        </article>

        <article className="action-module">
          <div className="module-heading"><ArrowUpFromLine size={19} /><div><h2>Allocate premiums</h2><p>Move earned premiums into coverage capital.</p></div></div>
          <form onSubmit={(event) => amountAction(event, "Premium allocation", allocationAmount, contract.allocatePremiums)}>
            <Field label="Amount / GEN"><input value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} inputMode="decimal" /></Field>
            <button className="secondary-button" disabled={!isOwner || busy}><ArrowUpFromLine size={16} /> Allocate</button>
          </form>
        </article>

        <article className="action-module">
          <div className="module-heading"><Banknote size={19} /><div><h2>Remove liquidity</h2><p>Withdraw only unreserved capital.</p></div></div>
          <form onSubmit={(event) => amountAction(event, "Liquidity removal", withdrawAmount, (amount, onStage) => contract.removeLiquidity(amount, withdrawPool, onStage))}>
            <div className="two-control-row">
              <Field label="Pool"><select value={withdrawPool} onChange={(event) => setWithdrawPool(event.target.value as "PREMIUM" | "RESERVE")}><option value="PREMIUM">Premium</option><option value="RESERVE">Reserve</option></select></Field>
              <Field label="Amount / GEN"><input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} inputMode="decimal" /></Field>
            </div>
            <button className="secondary-button" disabled={!isOwner || busy}><Banknote size={16} /> Remove liquidity</button>
          </form>
        </article>

        <article className="action-module emergency-module">
          <div className="module-heading"><Power size={19} /><div><h2>Emergency control</h2><p>Pause underwriting and claim execution.</p></div></div>
          <div className={`pause-state ${vault.paused ? "paused" : "running"}`}><span>{vault.paused ? <Pause size={17} /> : <Play size={17} />}{vault.paused ? "Operations paused" : "Operations running"}</span><button className={vault.paused ? "secondary-button" : "danger-button"} type="button" disabled={!isOwner || busy} onClick={() => runAction(vault.paused ? "Resume operations" : "Pause operations", false, (onStage) => contract.setPaused(!vault.paused, onStage))}>{vault.paused ? <Play size={16} /> : <Pause size={16} />}{vault.paused ? "Resume" : "Pause"}</button></div>
        </article>
      </section>

      {localError && <div className="form-error"><AlertTriangle size={16} />{localError}</div>}
      <section className="owner-strip">
        <div><LockKeyhole size={16} /><span>Vault owner</span><code>{vault.owner || "Unavailable"}</code></div>
        <div className="invariant-set"><InvariantBadge ok={vault.accountingInvariant} label="TVL balanced" /><InvariantBadge ok={vault.reserveInvariant} label="Reserve solvent" /></div>
      </section>
    </div>
  );
}

function TransactionMonitor({ tx, onClose }: { tx: TransactionState; onClose: () => void }) {
  if (tx.stage === "idle") return null;
  const stages: Array<{ key: Exclude<TxStage, "idle" | "failed">; label: string; detail: string }> = [
    { key: "signing", label: "Wallet signature", detail: "Authorize transaction" },
    { key: "executing", label: "Pending execution", detail: tx.nondeterministic ? "Validators fetch and classify evidence" : "GenVM applies the state transition" },
    { key: "accepted", label: "Consensus reached", detail: "Validator outcome accepted" },
    { key: "finalized", label: "Finalized", detail: "State is settled on-chain" },
  ];
  const order = ["signing", "executing", "accepted", "finalized"];
  const activeIndex = tx.stage === "failed" ? -1 : order.indexOf(tx.stage);

  return (
    <aside className={`tx-monitor ${tx.stage === "failed" ? "failed" : ""}`} aria-live="polite">
      <header><div><span className="kicker">Transaction</span><strong>{tx.action}</strong></div>{(tx.stage === "finalized" || tx.stage === "failed") && <button className="icon-button" onClick={onClose} aria-label="Close transaction monitor"><X size={16} /></button>}</header>
      {tx.stage === "failed" ? (
        <div className="tx-error"><AlertTriangle size={18} /><p>{tx.error}</p></div>
      ) : (
        <ol>
          {stages.map((item, index) => (
            <li key={item.key} className={index < activeIndex ? "complete" : index === activeIndex ? "current" : "pending"}>
              <span>{index < activeIndex || tx.stage === "finalized" ? <Check size={13} /> : index === activeIndex ? <LoaderCircle size={13} /> : index + 1}</span>
              <div><strong>{item.label}</strong><small>{item.detail}</small></div>
            </li>
          ))}
        </ol>
      )}
      {tx.hash && <code title={tx.hash}>{shortDigest(tx.hash)}</code>}
    </aside>
  );
}

export default function App() {
  const [view, setView] = useState<ViewKey>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [wallet, setWallet] = useState<string | null>(contract.connectedAddress());
  const [vault, setVault] = useState<VaultState>(EMPTY_VAULT);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(contract.isConfigured());
  const [dataReady, setDataReady] = useState(false);
  const [readError, setReadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [tx, setTx] = useState<TransactionState>(EMPTY_TX);

  useEffect(() => {
    if (!contract.isConfigured()) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setDataReady(false);
    setReadError("");
    contract
      .getVaultState()
      .then(async (state) => ({ state, records: await contract.getRecentPolicies(state.policyCount) }))
      .then(({ state, records }) => {
        if (!active) return;
        setVault(state);
        setPolicies(records);
        setDataReady(true);
      })
      .catch((error) => {
        if (active) setReadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function connect() {
    try {
      setReadError("");
      setWallet(await contract.connectWallet());
    } catch (error) {
      setReadError(errorMessage(error));
    }
  }

  function disconnect() {
    contract.disconnectWallet();
    setWallet(null);
  }

  async function runAction(
    label: string,
    nondeterministic: boolean,
    operation: (onStage: StageListener) => Promise<unknown>,
  ): Promise<boolean> {
    setTx({ ...EMPTY_TX, stage: "signing", action: label, nondeterministic });
    try {
      await operation((stage, hash) => {
        setTx((current) => ({ ...current, stage, hash: hash || current.hash }));
      });
      setRefreshKey((value) => value + 1);
      return true;
    } catch (error) {
      setTx((current) => ({ ...current, stage: "failed", error: errorMessage(error) }));
      return false;
    }
  }

  const busy = tx.stage === "signing" || tx.stage === "executing" || tx.stage === "accepted";
  const title = NAV_ITEMS.find((item) => item.key === view)?.label ?? "Exposure";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><ShieldCheck size={22} /></span><div><strong>AEGISFLOW</strong><small>PARAMETRIC CONTROL</small></div></div>
        <nav aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.key} className={view === item.key ? "active" : ""} onClick={() => { setView(item.key); setMobileNav(false); }}><Icon size={18} /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar-status">
          <span className={`network-light ${contract.isConfigured() ? "online" : "offline"}`} />
          <div><small>{contract.NETWORK_LABEL}</small><strong>{DEPLOYMENT_STATUS.replace(/_/g, " ")}</strong></div>
        </div>
        <div className="method-stamp"><span>{contract.METHOD_COUNT}</span> ABI METHODS</div>
      </aside>

      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main>
        <header className="topbar">
          <div className="topbar-title"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><div><span className="kicker">Operations / {title}</span><strong>{title}</strong></div></div>
          <div className="topbar-actions">
            {contract.isConfigured() && <button className="icon-button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh contract data" title="Refresh contract data"><RefreshCw size={17} className={loading ? "spin" : ""} /></button>}
            <span className="network-pill"><span className={contract.isConfigured() ? "online" : "offline"} />{contract.NETWORK_LABEL}</span>
            {wallet ? <button className="wallet-button connected" type="button" onClick={disconnect} title="Disconnect wallet"><WalletCards size={16} />{shortAddress(wallet)}</button> : <button className="wallet-button" type="button" onClick={connect} disabled={!contract.isConfigured()}><WalletCards size={16} />Connect wallet</button>}
          </div>
        </header>

        {readError && <div className="read-error"><AlertTriangle size={16} /><span>{readError}</span><button className="icon-button" onClick={() => setReadError("")} aria-label="Dismiss read error"><X size={15} /></button></div>}
        {!contract.isConfigured() && <div className="configuration-strip"><AlertTriangle size={15} /><span>Deployment status: not deployed. No sample or fabricated contract data is shown.</span><code>{CONTRACT_ADDRESS || "VITE_CONTRACT_ADDRESS unset"}</code></div>}

        <div className="workspace">
          {!contract.isConfigured() && <Overview configured={false} loading={false} vault={vault} policies={policies} />}
          {contract.isConfigured() && !dataReady && <DataState loading={loading} error={readError} onRetry={() => setRefreshKey((value) => value + 1)} />}
          {contract.isConfigured() && dataReady && view === "overview" && <Overview configured loading={loading} vault={vault} policies={policies} />}
          {contract.isConfigured() && dataReady && view === "underwrite" && <Underwrite configured wallet={wallet} vault={vault} busy={busy} runAction={runAction} />}
          {contract.isConfigured() && dataReady && view === "claims" && <Claims configured wallet={wallet} policies={policies} busy={busy} runAction={runAction} />}
          {contract.isConfigured() && dataReady && view === "vault" && <Vault configured wallet={wallet} vault={vault} busy={busy} runAction={runAction} />}
        </div>
      </main>

      <TransactionMonitor tx={tx} onClose={() => setTx(EMPTY_TX)} />
    </div>
  );
}
