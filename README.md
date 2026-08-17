# AegisFlow

AegisFlow is a GenLayer intelligent contract and operator console for
parametric insurance of renewable microgrids. A policy escrows its maximum
payout from a native GEN reserve, then settles from independently fetched
weather and infrastructure evidence under validator consensus.

The verified StudioNet deployment is available at
`0x2938DbD23bA845E0105AcC354B9071EE9A89643C`. The operator console uses this
address by default unless `VITE_CONTRACT_ADDRESS` explicitly overrides it.

## Components

| Path | Purpose |
| --- | --- |
| `contracts/aegis_flow.py` | Pinned-runner intelligent contract and native GEN custody |
| `contracts/aegis_flow.schema.json` | Generated contract ABI schema |
| `tests/direct/test_aegis_flow.py` | Fast custody, lifecycle, evidence, and comparator regression tests |
| `tests/integration/test_studionet.py` | Opt-in full-consensus StudioNet smoke tests |
| `scripts/deploy_studionet.py` | Environment-key deployment and post-deployment verification |
| `deployments/studionet.json` | Verified deployment metadata or explicit undeployed state |
| `frontend/` | React/Vite operator console using `genlayer-js` |

## Architecture

The contract owns four related responsibilities:

1. It accounts for native GEN in a premium pool and payout reserve.
2. It creates bounded policies only when their maximum payout is fully covered.
3. It derives fixed evidence URLs from policy data and bounded source IDs.
4. It settles only the discrete payout outcome accepted by GenLayer consensus.

The frontend uses one unsigned `genlayer-js` client for wallet-less reads and a
second injected-wallet client for signed writes. It displays the transaction
through wallet signature, pending execution, consensus accepted, and finalized
states. Claim evaluation is identified separately because validators perform
nondeterministic evidence retrieval and classification during that action. The
console checks the receipt execution result before showing either accepted or
finalized success; lifecycle status alone is not treated as successful execution.

## Money Flow

All values are integer atto-GEN, where `1 GEN = 10^18 atto-GEN`.

The vault enforces these equations after every money transition:

```text
total_tvl = premium_pool_atto + payout_reserve_atto
reserved_atto <= payout_reserve_atto
reserve_available_atto = payout_reserve_atto - reserved_atto
unreserved_atto = total_tvl - reserved_atto
total_pool_balance_atto = total_tvl
unreserved_available_atto = premium_pool_atto + reserve_available_atto
total_pool_balance_atto = reserved_atto + unreserved_available_atto
```

`fund_payout_reserve()` accepts native GEN from any account and credits the
payout reserve. A payable `create_policy(...)` credits its full premium to the
premium pool and locks exactly:

```text
maximum payout = premium * 10
```

Policy creation reverts unless the currently available reserve covers that
entire maximum payout. `allocate_premiums_to_reserve(amount_atto)` moves owner
capital between the two accounting pools without changing TVL.

`remove_liquidity(amount_atto, pool)` is owner-only. Premium withdrawals cannot
exceed the premium pool. Reserve withdrawals cannot touch locked policy capital,
and every withdrawal is also capped by unreserved TVL. Each recipient has an
isolated transfer escrow and monotonically increasing operation nonce. Accounting
effects and invariant checks complete before a finalized self-message can consume
that escrow, and stale or reordered dispatch messages are ignored.

Settlement releases the policy's entire reserve lock. Any payout is deducted
from the payout reserve and TVL before native GEN is queued for the holder. A
failed native send is credited back only to that recipient's escrow and advances
its nonce; `retry_pending_transfer()` schedules the caller's current escrow
generation. Expiry releases a stale lock without transferring value.

## Policy Lifecycle

```text
                      submit_claim
ACTIVE --------------------------------------> CLAIM_SUBMITTED
  |                                                |
  | expire_policy after claim close               | evaluate_claim
  |                                                |
  +------------------> EXPIRED <-------------------+ (after close only)
                                                   |
                                                   v
                                                SETTLED
```

Coverage dates use `YYYY-MM-DD`. The start must be at least 24 hours in the
future and no more than 365 days ahead. Coverage may span at most 31 inclusive
days. The claim window opens at 00:00 UTC on the day after coverage ends and
closes 14 days later.

Only the policy holder may submit a claim. The owner pause control blocks new
underwriting, claim submission, and claim evaluation. It does not prevent stale
policies from being expired and their reserve from being released.

## Payouts

Payout is derived from a fixed outcome, never from model prose.

| Outcome | Payout basis points | Share of maximum payout | Condition |
| --- | ---: | ---: | --- |
| `NO_TRIGGER` | 0 | 0% | Neither qualifying condition is present |
| `WEATHER_DEFICIT` | 5,000 | 50% | The normalized weather threshold is met |
| `GRID_OUTAGE` | 10,000 | 100% | A qualifying regional outage is confirmed |

`GRID_OUTAGE` takes precedence over `WEATHER_DEFICIT`. An outage requires an
explicit utility or power disruption, region match, coverage-date match, and at
least 7,500 confidence basis points. Free-form reasoning cannot choose a payout.

## Evidence Sources

The caller never supplies an origin or URL. The contract derives every endpoint
from stored policy terms and a bounded source identity.

Weather always uses Open-Meteo's ERA5 archive:

```text
https://archive-api.open-meteo.com/v1/archive
  ?latitude={stored latitude}
  &longitude={stored longitude}
  &start_date={coverage start}
  &end_date={coverage end}
  &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,
         shortwave_radiation_sum,wind_speed_10m_max
  &timezone=UTC
  &models=era5
```

Infrastructure evidence uses exactly one of these templates:

```text
FEMA
https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries
  ?$filter=disasterNumber%20eq%20{numeric reference}&$top=10

USGS
https://earthquake.usgs.gov/fdsnws/event/1/query
  ?format=geojson&eventid={bounded event ID}&includesuperseded=false

Google News RSS
https://news.google.com/rss/search
  ?q=power+outage+{stored region}+after:{start}+before:{end exclusive}
  &hl=en-US&gl=US&ceid=US:en
```

FEMA references must contain one to eight digits. USGS IDs are 4 to 32 bounded
ASCII letters, digits, hyphens, or underscores. A NEWS claim must provide an
empty reference because its query is derived entirely from stored policy data.

Responses are size-bounded and HTTP failures are classified as `[EXPECTED]`,
`[EXTERNAL]`, `[TRANSIENT]`, or `[LLM_ERROR]` so validators can distinguish
stable failures from temporary source failures.

## Normalization And Consensus

Open-Meteo daily arrays must exactly match every coverage date. Decimal values
are converted to deterministic fixed-point milli-units before they cross the
nondeterministic result boundary. Precipitation and shortwave radiation are
summed; maximum temperature and maximum wind speed use the daily maximum;
minimum temperature uses the daily minimum. Policies can therefore cover rain,
temperature, solar-production, and wind-production deficits without floating
point settlement arithmetic.

Infrastructure report bytes are untrusted. Before classification, the contract:

1. Bounds the response size.
2. Computes SHA-256 over the exact response bytes.
3. Fences normalized weather facts with the full uppercase weather-response
   digest and the bounded report body with the full uppercase report digest.
   Report content containing either exact fence token is rejected before model
   execution.
4. Requires a strict JSON classification schema.
5. Sanitizes and bounds the returned reason.

The leader and each validator independently fetch both sources and derive a
complete outcome. Consensus accepts only exact agreement on:

```text
status
payout_bps
weather_triggered
outage_triggered
observed_milli
reason_code
```

Report prose and raw response digests may vary because sources can change while
validators execute; those values do not control payout. The accepted status is
mapped back to its fixed basis points before settlement, providing another
closed check against model-controlled amounts.

## Threat Model

AegisFlow addresses these risks:

- Caller-controlled SSRF: origins and URLs are fixed by the contract.
- Prompt injection: untrusted report text is hash-fenced and cannot set payout.
- Model variability: validators compare the complete payout-affecting outcome.
- Floating-point divergence: weather observations become integer milli-units.
- Insolvent underwriting: each policy locks its full 10x maximum payout.
- Reserve theft: owner withdrawals cannot consume `reserved_atto`.
- Reentrancy around payout: effects and invariant checks precede native transfer.
- Reordered transfer failures: recipient-local nonces make stale dispatches no-op.
- Cross-recipient rollback: failed sends recredit only the intended user escrow.
- Unbounded external data: response, prompt, reason, input, and date limits apply.

Residual trust remains. Open-Meteo, FEMA, USGS, and Google News can be wrong,
late, unavailable, or revise data. The LLM classifies ambiguous report language,
although it cannot choose a payout amount. GenLayer validator selection and
consensus remain part of the security model. The owner can pause operational
paths and move only unreserved capital; owner key security is therefore still
important. This repository has not received an external production audit.

## Local Setup

Python 3 and Node.js 18 or newer are required. Install the contract tooling:

```bash
python3 -m pip install -r requirements.txt
```

Install the frontend:

```bash
cd frontend
npm install
```

No private key is required for direct tests or wallet-less frontend reads.

## Verification

Run the complete offline contract suite:

```bash
pytest tests/direct/test_aegis_flow.py -v
genvm-lint check contracts/aegis_flow.py --json
genvm-lint typecheck contracts/aegis_flow.py --json
```

Build the operator console:

```bash
cd frontend
npm run build
```

The StudioNet suite is opt-in and uses network consensus:

```bash
gltest tests/integration/test_studionet.py \
  -m integration -v -s --network studionet
```

Direct mode provides deterministic mocks for all settlement tiers and failures.
It also replays the captured validator callback to prove independent two-source
evaluation accepts matching status and rejects a different validator status.
StudioNet integration remains required to exercise network-level multi-validator
consensus and real native balance settlement.

## StudioNet Deployment

Network settings are checked into `gltest.config.yaml`:

```text
chain ID: 61999
RPC: https://studio.genlayer.com/api
poll interval: 10 seconds
```

Use a recoverable deployer account supplied only through the environment:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
python3 scripts/deploy_studionet.py
```

The script funds the deployer through StudioNet simulation only when needed,
waits for finalization, rejects failed contract execution, obtains the deployed
address from the decoded receipt, then reads `get_trust_model()` and
`get_vault_state()`. It writes verified metadata only after the contract
identifies itself as AegisFlow, all three vault invariants are true, and the
decoded contract bytes and generated schema match the local artifacts. The
private key is never written to disk.

The superseded record was verified independently through read-only StudioNet
RPC before the final audit changes. It reports the expected AegisFlow identity, owner
`0x1f9813eeB2de53134af5C824cA156CE82C4EB0fa`, payout statuses, weather and
infrastructure source model, and the earlier accounting and reserve invariants.
Its decoded `gen_getContractCode` payload and recorded code hash describe the
superseded source, not the final audited `contracts/aegis_flow.py` bytes.

## Operator Console

The console uses a checked-in address only when its deployment record is marked
`verified`. A local `.env` can select another supported network or provide a
newly deployed address:

```text
VITE_GENLAYER_NETWORK=studionet
VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
# VITE_CONTRACT_ADDRESS=0x...
```

Start the console:

```bash
cd frontend
npm run dev
```

The first screen is the live exposure console. Reads do not require a wallet.
Wallet connection is requested only for underwriting, claim, settlement, and
vault writes. Owner actions are disabled unless the connected address matches
the owner returned by `get_vault_state()`.

When no deployment is configured, the console renders an explicit undeployed
state and no fabricated policy or vault values.
