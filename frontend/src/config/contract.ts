import deployment from "../../../deployments/studionet.json";

const envAddress = (
  import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined
)?.trim();
const verifiedAddress =
  deployment.deployment_status === "verified"
    ? deployment.contract_address
    : null;
const selectedAddress = envAddress || verifiedAddress;

export const CONTRACT_ADDRESS = selectedAddress
  ? (selectedAddress as `0x${string}`)
  : null;
export const DEPLOYMENT_STATUS = envAddress
  ? "configured"
  : verifiedAddress
    ? "verified"
    : "not_deployed";
export const RPC_OVERRIDE = (
  import.meta.env.VITE_GENLAYER_RPC_URL as string | undefined
)?.trim();
export const NETWORK_NAME = (
  (import.meta.env.VITE_GENLAYER_NETWORK as string | undefined)?.trim() ||
  deployment.network ||
  "studionet"
) as "studionet" | "localnet" | "testnetAsimov" | "testnetBradbury";
