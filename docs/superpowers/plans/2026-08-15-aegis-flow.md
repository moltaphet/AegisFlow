# AegisFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GenLayer parametric insurance vault for renewable microgrids with two-source weather and infrastructure evidence, solvent native GEN custody, strict outcome consensus, direct tests, StudioNet configuration, and an operator frontend.

**Architecture:** One pinned-runner Python contract owns policy state, dual-pool accounting, deterministic Open-Meteo extraction, fenced infrastructure-report classification, and native settlement. A React/Vite console reads the contract through `genlayer-js` and exposes underwriting, claims, settlement, and vault operations with explicit transaction lifecycle states.

**Tech Stack:** GenLayer Python intelligent contract, `genlayer-test`, `genvm-linter`, pytest, React 18, TypeScript, Vite, `genlayer-js`, and Lucide React.

## Global Constraints

- Work only inside `/Users/ehs4n/AegisFlow`.
- Pin `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` on line 1 of the contract.
- Keep every repository file ASCII-only.
- Bind all storage values to local primitives before entering nondeterministic closures.
- Fetch at least two independently operated sources and fence untrusted report content with SHA-256.
- Enforce exact `leader_status == validator_status` and exact payout basis-point agreement.
- Preserve `total_tvl == premium_pool_atto + payout_reserve_atto` and `reserved_atto <= payout_reserve_atto` after every money transition.
- Apply checks-effects-interactions before every native GEN transfer.
- Never store private keys or secrets.

---

### Task 1: Contract and custody invariants

**Files:**
- Create: `contracts/aegis_flow.py`
- Test: `tests/direct/test_aegis_flow.py`

**Interfaces:**
- Produces: `fund_payout_reserve()`, `allocate_premiums_to_reserve(amount_atto)`, `remove_liquidity(amount_atto, pool)`, `create_policy(...)`, `submit_claim(...)`, `evaluate_claim(policy_id)`, `expire_policy(policy_id)`, `set_paused(paused)`, `get_policy(policy_id)`, `get_vault_state()`, `get_trust_model()`, and `get_source_urls(policy_id)`.

- [x] Write direct tests for dual-pool inflows, exact reserve locking, underfunded rejection, reserve-capped liquidity removal, owner authorization, pause behavior, and invariant reporting.
- [x] Implement `Policy` storage and dual-pool state with exact atto arithmetic.
- [x] Implement payable reserve funding and policy premium routing.
- [x] Implement CEI reserve settlement and owner liquidity removal.
- [x] Run `pytest tests/direct/test_aegis_flow.py -v` and require zero failures.

### Task 2: Evidence normalization and strict consensus

**Files:**
- Modify: `contracts/aegis_flow.py`
- Modify: `tests/direct/test_aegis_flow.py`

**Interfaces:**
- Consumes: locally bound policy coordinates, dates, metric, threshold, coverage mode, and report reference.
- Produces: a consensus result with `status`, `payout_bps`, `weather_triggered`, `outage_triggered`, `observed_milli`, `report_confidence_bp`, `evidence_digest`, and `reason`.

- [x] Test fixed URL derivation for Open-Meteo, FEMA, USGS, and Google News RSS without caller-controlled origins.
- [x] Test decimal-to-milli conversion and deterministic weather threshold evaluation.
- [x] Test fenced and sanitized LLM report output, malformed output failures, and prompt injection containment.
- [x] Test validator acceptance for identical status and rejection for any status or payout split.
- [x] Implement bounded fetches, error classification, SHA-256 fences, report schema parsing, outcome derivation, and `run_nondet_unsafe` validation.
- [x] Run direct tests and `genvm-lint check contracts/aegis_flow.py`.

### Task 3: Network and integration configuration

**Files:**
- Create: `gltest.config.yaml`
- Create: `pytest.ini`
- Create: `requirements.txt`
- Create: `tests/integration/test_studionet.py`
- Create: `deployments/studionet.json`

**Interfaces:**
- Produces: opt-in full-consensus StudioNet smoke tests and deployment metadata consumed by the frontend configuration.

- [x] Add direct-test default markers and StudioNet network timing.
- [x] Add an integration smoke test for deployment, funding, vault reads, and source URL derivation.
- [x] Record an explicit undeployed deployment state until a verified address and transaction exist.
- [x] Run the offline test suite before attempting any network deployment.

### Task 4: Operator console

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles.css`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/contract.ts`
- Create: `frontend/src/config/contract.ts`
- Create: `frontend/.env.example`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`

**Interfaces:**
- Consumes: the public contract methods and deployment metadata from Tasks 1-3.
- Produces: responsive overview, underwriting, claims, and vault views using real `readContract` and `writeContract` calls.

- [x] Implement wallet connection and wallet-less reads.
- [x] Implement policy, claim, evaluation, reserve funding, allocation, withdrawal, and pause actions.
- [x] Expose pending, nondeterministic execution, consensus reached, and finalized transaction stages.
- [x] Build a responsive control-room interface with accessible focus states and reduced-motion handling.
- [x] Run `npm run build` and inspect desktop and mobile layouts.

### Task 5: Documentation and final verification

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: architecture, money-flow, consensus, source, threat-model, local setup, test, deployment, and frontend documentation.

- [x] Document the state machine, payout table, dual-pool equations, source URL templates, prompt fencing, strict validator rule, and residual trust.
- [x] Scan all repository text for non-ASCII characters and forbidden runner aliases.
- [x] Run `genvm-lint check`, `genvm-lint typecheck`, the complete direct test suite, and the frontend production build.
- [x] Update deployment metadata only with evidence from a successful StudioNet deployment.
