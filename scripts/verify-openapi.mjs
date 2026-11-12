import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const specUrl = new URL("../contracts/openapi.json", import.meta.url);
const specBytes = await readFile(specUrl);
const lock = JSON.parse(
  await readFile(
    new URL("../contracts/openapi.lock.json", import.meta.url),
    "utf8",
  ),
);
const spec = JSON.parse(specBytes.toString("utf8"));
const actualHash = createHash("sha256").update(specBytes).digest("hex");

if (lock.version !== spec.info?.version) {
  throw new Error(
    `OpenAPI version mismatch: lock=${lock.version}, spec=${spec.info?.version}`,
  );
}
if (lock.sha256 !== actualHash) {
  throw new Error(
    `OpenAPI snapshot hash mismatch: expected ${lock.sha256}, got ${actualHash}`,
  );
}

process.stdout.write(`OpenAPI ${lock.version} verified (${actualHash})\n`);
