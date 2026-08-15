"""Deploy AegisFlow to StudioNet and record only a verified deployment.

Usage:

    DEPLOYER_PRIVATE_KEY=0x... python scripts/deploy_studionet.py

The signer key is read only from the environment and is never written to disk.
The deployment metadata file is replaced only after identity, vault invariants,
deployed code bytes, and the generated schema match the local artifacts.
"""

import base64
import hashlib
import json
import os
import pathlib
import sys
import time

from eth_account import Account
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py import create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus


GEN = 10**18
ACCOUNT_FUNDING = 100 * GEN

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "contracts" / "aegis_flow.py"
SCHEMA_PATH = ROOT / "contracts" / "aegis_flow.schema.json"
OUTPUT_PATH = ROOT / "deployments" / "studionet.json"


def main() -> int:
    private_key = os.environ.get("DEPLOYER_PRIVATE_KEY", "").strip()
    if private_key == "":
        print(
            "ERROR: DEPLOYER_PRIVATE_KEY is required so contract ownership is recoverable",
            file=sys.stderr,
        )
        return 2

    account = Account.from_key(private_key)
    client = create_client(chain=studionet, account=account)
    balance = client.get_balance(account.address)
    if balance < GEN:
        client.provider.make_request(
            method="sim_fundAccount", params=[account.address, ACCOUNT_FUNDING]
        )
        for _ in range(12):
            time.sleep(5)
            balance = client.get_balance(account.address)
            if balance >= GEN:
                break
    if balance < GEN:
        print("ERROR: StudioNet deployer funding did not arrive", file=sys.stderr)
        return 1

    code = CONTRACT_PATH.read_bytes()
    tx_hash = client.deploy_contract(code=code, args=[])
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        interval=10000,
        retries=120,
    )
    if not tx_execution_succeeded(receipt):
        raise RuntimeError("Finalized deployment transaction failed execution")
    address = receipt["tx_data_decoded"]["contract_address"]
    if not address:
        raise RuntimeError("Finalized deployment receipt did not contain an address")

    trust_model = client.read_contract(
        address=address, function_name="get_trust_model", args=[]
    )
    vault = client.read_contract(
        address=address, function_name="get_vault_state", args=[]
    )
    if trust_model.get("name") != "AegisFlow":
        raise RuntimeError("Deployed contract failed AegisFlow identity check")
    if not vault.get("accounting_invariant") or not vault.get("reserve_invariant"):
        raise RuntimeError("Deployed contract failed vault invariant checks")

    code_response = client.provider.make_request(
        method="gen_getContractCode", params=[address]
    )
    encoded_code = code_response.get("result")
    if not isinstance(encoded_code, str):
        raise RuntimeError("StudioNet did not return deployed contract code")
    try:
        deployed_code = base64.b64decode(encoded_code, validate=True)
    except ValueError as exc:
        raise RuntimeError("StudioNet returned invalid deployed contract code") from exc
    if deployed_code != code:
        raise RuntimeError("Deployed contract bytes do not match the local source")

    local_schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    schema_response = client.provider.make_request(
        method="gen_getContractSchema", params=[address]
    )
    if schema_response.get("result") != local_schema:
        raise RuntimeError("Deployed contract schema does not match the local schema")

    verified_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    canonical_schema = json.dumps(
        local_schema, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")

    transaction = tx_hash if isinstance(tx_hash, str) else tx_hash.hex()
    record = {
        "network": "studionet",
        "chain_id": studionet.id,
        "rpc_url": studionet.rpc_urls["default"]["http"][0],
        "contract_name": "AegisFlow",
        "deployment_status": "verified",
        "contract_address": address,
        "deployer": account.address,
        "owner": trust_model["owner"],
        "deployment_tx": transaction,
        "deployed_at": verified_at,
        "verified_at": verified_at,
        "verification_method": "deployment receipt plus trust model, vault invariants, decoded code-byte equality, and schema equality",
        "code_sha256": hashlib.sha256(deployed_code).hexdigest(),
        "schema_canonical_sha256": hashlib.sha256(canonical_schema).hexdigest(),
        "runner": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6",
        "payout_statuses": trust_model["payout_statuses"],
        "payout_bps": trust_model["payout_bps"],
    }
    OUTPUT_PATH.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print("Verified AegisFlow deployment:", address)
    print("Transaction:", transaction)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
