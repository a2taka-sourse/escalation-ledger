// Creates a throwaway TESTNET wallet. The private key goes only into .env (gitignored, not mirrored).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, writeFileSync, readFileSync } from "node:fs";

if (existsSync(".env") && /EVM_PRIVATE_KEY=/.test(readFileSync(".env", "utf8"))) {
  const key = readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
  console.log("wallet already exists:", privateKeyToAccount(key).address);
  process.exit(0);
}
const key = generatePrivateKey();
writeFileSync(".env", `# TESTNET ONLY - never send real funds here\nEVM_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
console.log("new testnet wallet:", privateKeyToAccount(key).address);
