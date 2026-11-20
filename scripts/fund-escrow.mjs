// One-time: fund the Telegraph escrow on Ethereum Sepolia. Needs a little Sepolia ETH for gas (3 transactions, well under 0.001 ETH each).
// 1) mint test USDC (anyone can, it is a test token)  2) approve the Diamond  3) LedgerFacet.depositUSDC(amount)
// Usage: node scripts/fund-escrow.mjs [usdc=5]
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, formatEther } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";      // Telegraph test USDC (6 decimals)
const DIAMOND = "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";   // from the node's 402 challenge and docs
const amount = BigInt(Math.round(Number(process.argv[2] || 5) * 1e6));

const key = process.env.EVM_PRIVATE_KEY || readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wal = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const erc20 = parseAbi(["function mint(address,uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const ledger = parseAbi(["function depositUSDC(uint256)"]);

const eth = await pub.getBalance({ address: account.address });
console.log("wallet", account.address, "Sepolia ETH", formatEther(eth));
if (eth < 1_000_000_000_000_000n / 1000n) { console.log("not enough Sepolia ETH for gas (need ~0.0005). Get some from a faucet first."); process.exitCode = 1; }
else {
  const send = async (label, req) => {
    const hash = await wal.writeContract(req);
    const rc = await pub.waitForTransactionReceipt({ hash });
    console.log(label, rc.status, hash);
    if (rc.status !== "success") throw new Error(`${label} failed`);
    return hash;
  };
  const bal = await pub.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [account.address] });
  if (bal < amount) await send("mint   ", { address: USDC, abi: erc20, functionName: "mint", args: [account.address, amount - bal] });
  await send("approve", { address: USDC, abi: erc20, functionName: "approve", args: [DIAMOND, amount] });
  await send("deposit", { address: DIAMOND, abi: ledger, functionName: "depositUSDC", args: [amount] });
  console.log(`deposited ${Number(amount) / 1e6} test USDC into the Telegraph escrow. Sepolia ETH left: ${formatEther(await pub.getBalance({ address: account.address }))}`);
}
