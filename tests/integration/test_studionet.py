"""StudioNet smoke tests for AegisFlow.

These tests deploy the real GenVM contract and verify native GEN custody,
underwriting, and deterministic source derivation. The live evidence settlement
path is time-dependent by design: a policy must be purchased before its coverage
window, while Open-Meteo's archive is available only after that window. Direct
tests cover the complete mocked settlement path; an already matured policy is
required to exercise live leader-plus-validator evidence consensus.

Run explicitly:

    gltest tests/integration/test_studionet.py -m integration -v -s --network studionet
"""

import time
from datetime import datetime, timedelta, timezone

import pytest

from gltest import get_contract_factory, get_default_account, get_gl_client
from gltest.assertions import tx_execution_succeeded


pytestmark = pytest.mark.integration

GEN = 10**18
RESERVE = 30 * GEN
PREMIUM = GEN


@pytest.fixture(scope="module")
def client():
    return get_gl_client()


@pytest.fixture(scope="module")
def funded_account(client):
    account = get_default_account()
    client.provider.make_request(
        method="sim_fundAccount", params=[account.address, 100 * GEN]
    )
    time.sleep(12)
    assert client.get_balance(account.address) >= RESERVE + PREMIUM
    return account


@pytest.fixture(scope="module")
def contract(funded_account):
    deployed = get_contract_factory("AegisFlow").deploy(args=[])
    print("\nAegisFlow deployed at", deployed.address)
    return deployed


def test_deployment_reports_security_model(contract):
    model = contract.get_trust_model(args=[]).call()
    assert model["name"] == "AegisFlow"
    assert model["caller_supplied_urls"] is False
    assert model["payout_statuses"] == [
        "NO_TRIGGER",
        "WEATHER_DEFICIT",
        "GRID_OUTAGE",
    ]
    assert model["payout_bps"] == [0, 5000, 10000]
    assert model["maximum_payout_multiplier"] == 10
    assert model["weather_metrics"] == [
        "PRECIPITATION_SUM",
        "TEMPERATURE_MAX",
        "TEMPERATURE_MIN",
        "SOLAR_RADIATION_SUM",
        "WIND_SPEED_MAX",
    ]
    assert "full sha256 digests" in model["prompt_fencing"]


def test_native_custody_and_policy_reserve_hold_in_genvm(contract, client):
    contract_balance_before = client.get_balance(contract.address)
    funding = contract.fund_payout_reserve(args=[]).transact(value=RESERVE)
    assert tx_execution_succeeded(funding)

    start = datetime.now(timezone.utc) + timedelta(days=30)
    end = start + timedelta(days=2)
    start_date = start.strftime("%Y-%m-%d")
    end_date = end.strftime("%Y-%m-%d")
    creation = contract.create_policy(
        args=[
            "StudioNet Solar Array",
            "New York, NY",
            40712800,
            -74006000,
            start_date,
            end_date,
            "PRECIPITATION_SUM",
            "BELOW",
            15000,
        ]
    ).transact(value=PREMIUM)
    assert tx_execution_succeeded(creation)

    assert client.get_balance(contract.address) == (
        contract_balance_before + RESERVE + PREMIUM
    )
    vault = contract.get_vault_state(args=[]).call()
    assert vault["accounting_invariant"] is True
    assert vault["reserve_invariant"] is True
    assert int(vault["premium_pool_atto"]) == PREMIUM
    assert int(vault["payout_reserve_atto"]) == RESERVE
    assert int(vault["reserved_atto"]) == 10 * PREMIUM

    policy = contract.get_policy(args=[1]).call()
    assert policy["status"] == "ACTIVE"
    assert policy["max_payout_atto"] == str(10 * PREMIUM)
    urls = contract.get_source_urls(args=[1]).call()
    assert urls["weather_url"].startswith(
        "https://archive-api.open-meteo.com/v1/archive?latitude=40.7128"
    )
    assert "shortwave_radiation_sum" in urls["weather_url"]
    assert "wind_speed_10m_max" in urls["weather_url"]
    assert "models=era5" in urls["weather_url"]
    assert urls["report_url"] == ""
