#!/usr/bin/env node

import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRS = ["app", "lib", "scripts", "supabase/functions"];
const SOURCE_EXTENSIONS = [".js", ".jsx", ".mjs", ".ts", ".tsx"];
const OTHER_APP_REFERENCES = /agentaiio\.com|getfintechai\.com|gpt5(?:io|zone|base)\.com|saas-acquisition-showroom/i;
const PUBLIC_SECRET_NAME = /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|SERVICE_ROLE|PRIVATE_KEY|API_KEY)/;
const SERVER_ONLY_NAME = /\b(?:SUPABASE_SERVICE_ROLE_KEY|EVIDENCE_UPLOAD_CODE|OWNER_CONTROL_CODE|BUFFER_API_TOKEN|EBAY_CLIENT_SECRET|OWNER_INTEGRATION_ENCRYPTION_KEY|AI_FAMILY_CORE_TOKEN)\b/;

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(absolute);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) &&
      entry.name !== "qa-boundaries.mjs" && !/\.test\.[cm]?[jt]sx?$/.test(entry.name)
      ? [absolute] : [];
  });
}

function localImports(text) {
  return [...text.matchAll(/\b(?:from|import|require)\s*(?:\(\s*)?["']([^"']+)["']/g)]
    .map((match) => match[1]);
}

function resolveImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  return [base, ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`))]
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

export function auditBoundaries(root) {
  const absoluteRoot = path.resolve(root);
  const failures = [];
  const runtime = RUNTIME_DIRS.flatMap((dir) => filesUnder(path.join(absoluteRoot, dir)));
  const clientRoots = [];

  for (const file of runtime) {
    const relative = path.relative(absoluteRoot, file);
    const source = fs.readFileSync(file, "utf8");
    if (OTHER_APP_REFERENCES.test(source)) failures.push(`${relative}: references another app's domain or repository`);
    if (PUBLIC_SECRET_NAME.test(source)) failures.push(`${relative}: exposes a server credential through NEXT_PUBLIC_`);
    if (/^[ \t]*["']use client["'];?/m.test(source.slice(0, 400))) clientRoots.push(file);
  }

  for (const entry of clientRoots) {
    const visited = new Set();
    const pending = [entry];
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(absoluteRoot, file);
      if (SERVER_ONLY_NAME.test(source)) failures.push(`${relative}: client import graph reaches a server credential`);
      for (const specifier of localImports(source)) {
        if (isBuiltin(specifier)) failures.push(`${relative}: client import graph reaches a Node-only module`);
        if (!specifier.startsWith(".")) continue;
        const resolved = resolveImport(file, specifier);
        if (resolved && !resolved.startsWith(absoluteRoot + path.sep)) {
          failures.push(`${relative}: imports code outside the BlindBoxAI repository`);
        } else if (resolved) {
          pending.push(resolved);
        }
      }
    }
  }
  return [...new Set(failures)].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = auditBoundaries(process.cwd());
  if (failures.length) {
    console.error("QA_BOUNDARIES: FAIL");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log("QA_BOUNDARIES: PASS");
  }
}
