import fs from "node:fs";
import path from "node:path";

import { runResearchCycle } from "../lib/mr-know-it-all-agent.mjs";
import {
  buildResearchArtifact,
  assertResearchArtifact,
} from "../lib/mr-know-it-all-policy.mjs";
import {
  createVaultKey,
  decryptPrivateResearch,
  encryptPrivateResearch,
} from "../lib/private-research-vault.mjs";
import { loadPrivateQuestionEvents } from "../lib/private-question-analytics.mjs";

const command = process.argv[2] ?? "validate";
const root = process.cwd();

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function insideProject(value) {
  const resolved = path.resolve(root, value);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Research paths must stay inside the project directory");
  }
  return resolved;
}

function validationFixture(now) {
  return {
    summary: "A source-backed candidate for validation only.",
    demandSummary: "Three private questions indicate an example collector need.",
    questionThemes: [{ topic: "Example demand", userNeed: "A verified series guide", count: 3 }],
    opportunities: [{
      type: "knowledge-base",
      brand: "Example Collectibles",
      series: "Example Blind Box",
      title: "Review an existing EPN opportunity",
      whyNow: "Recent reviewed USD transactions show current buyer activity.",
      proposedAction: "Owner reviews the evidence before creating a BlindBoxAI series-page CTA.",
      monetizationPath: "knowledge-base-conversion",
      programUrl: null,
      positiveUsdTransactions: {
        observedLowUSD: 20,
        observedHighUSD: 35,
        sampleSize: 3,
        caveat: "Three observations are not an established market value.",
      },
      audienceDemand: {
        theme: "Example demand",
        userNeed: "A verified series guide",
        count: 3,
      },
      evidence: [
        {
          title: "Official product page",
          url: "https://brand.example/product",
          kind: "official-product",
          observedAt: now.toISOString(),
          claim: "The official page identifies the series.",
        },
        {
          title: "Marketplace sold results",
          url: "https://market.example/sold",
          kind: "transaction-marketplace",
          observedAt: now.toISOString(),
          claim: "Three displayed completed results used the stated USD range.",
        },
        {
          title: "Current collector interest",
          url: "https://signal.example/current",
          kind: "market-signal",
          observedAt: now.toISOString(),
          claim: "A current source shows ongoing category interest.",
        },
      ],
      risks: ["Small transaction sample", "Availability can change"],
    }],
  };
}

if (command === "validate") {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const artifact = buildResearchArtifact(validationFixture(now), now, {
    model: "validation-fixture",
    questionCount: 3,
    questionLookbackDays: 30,
    skippedQuestionEvents: 0,
  });
  assertResearchArtifact(artifact);
  const key = createVaultKey();
  const encrypted = encryptPrivateResearch(artifact, key);
  const decrypted = decryptPrivateResearch(encrypted, key);
  if (JSON.stringify(decrypted) !== JSON.stringify(artifact)) throw new Error("Private research vault round-trip failed");
  console.log("Validated Mr. Know It All policy and owner-only encrypted research vault.");
} else if (command === "research") {
  const encryptionKey = String(process.env.MR_RESEARCH_ENCRYPTION_KEY ?? "").trim();
  if (!encryptionKey) throw new Error("MR_RESEARCH_ENCRYPTION_KEY is required; plaintext research is never written");
  const demand = await loadPrivateQuestionEvents({ encryptionKey });
  const artifact = await runResearchCycle({
    questions: demand.events.map((event) => event.question),
    questionLookbackDays: demand.lookbackDays,
    skippedQuestionEvents: demand.skipped,
  });
  const encrypted = encryptPrivateResearch(artifact, encryptionKey);
  const outputDirectory = insideProject(process.env.MR_KNOW_IT_ALL_OUTPUT_DIR ?? "output/mr-know-it-all");
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const stamp = artifact.researchedAt.replace(/[:.]/g, "-");
  const outputFile = path.join(outputDirectory, `private-research-${stamp}.json.enc`);
  fs.writeFileSync(outputFile, `${encrypted}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log("ENCRYPTED_PRIVATE_RESEARCH_READY");
  console.log("No purchases, payments, enrollments, outreach, rendering, or publishing occurred.");
} else if (command === "decrypt") {
  const encryptionKey = String(process.env.MR_RESEARCH_ENCRYPTION_KEY ?? "").trim();
  if (!encryptionKey) throw new Error("MR_RESEARCH_ENCRYPTION_KEY is required");
  const input = argument("input");
  if (!input) throw new Error("Use --input <encrypted-artifact-path>");
  const inputFile = insideProject(input);
  const artifact = decryptPrivateResearch(fs.readFileSync(inputFile, "utf8"), encryptionKey);
  assertResearchArtifact(artifact);
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
} else {
  throw new Error(`Unknown command: ${command}`);
}
