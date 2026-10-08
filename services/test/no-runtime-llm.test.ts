import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * ADR-013 hard requirement: the design + marketing pipeline is fully
 * deterministic. No runtime LLM. This guard fails if OpenAI/Anthropic/LLM
 * machinery creeps back into the services runtime.
 */

const SRC = new URL("../src/", import.meta.url);

async function walk(dir: URL): Promise<URL[]> {
  const out: URL[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const child = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) out.push(...(await walk(child)));
    else if (e.name.endsWith(".ts")) out.push(child);
  }
  return out;
}

// Words that would indicate a runtime LLM dependency. Bare "AI" is too noisy;
// these are specific.
const FORBIDDEN = [
  /\bopenai\b/i,
  /\banthropic\b/i,
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /\bAI_PROVIDER\b/,
  /\bOPENAI_API_KEY\b/,
  /\bANTHROPIC_API_KEY\b/,
  /creative-director/i,
  /\bgenerateDesign\b/,
  /\bcallOpenAiResponses\b/,
  /\bcallAnthropic\b/,
];

// Lines that only DOCUMENT the absence are allowed.
const ALLOW_LINE = /no (openai|anthropic|llm|ai\/llm)|deterministic|ADR-013|There is NO LLM/i;

test("services/src contains no runtime LLM (OpenAI/Anthropic) dependency", async () => {
  const files = await walk(SRC);
  assert.ok(files.length > 10, "walked the source tree");
  const hits: string[] = [];
  for (const f of files) {
    const text = await readFile(f, "utf8");
    text.split("\n").forEach((line, i) => {
      if (!FORBIDDEN.some((re) => re.test(line))) return;
      if (ALLOW_LINE.test(line)) return;
      hits.push(`${f.pathname.split("/services/")[1]}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, [], `runtime LLM reference(s) found:\n${hits.join("\n")}`);
});

test("no creative-director / artifact-schema / generate-design modules remain", async () => {
  // The design tier that once held them was retired in ADR-069; check the whole tree.
  const names = (await walk(SRC)).map((f) => f.pathname.split("/").pop());
  for (const bad of [
    "creative-director-client.ts",
    "creative-director-core.ts",
    "creative-director-openai.ts",
    "creative-director-anthropic.ts",
    "artifact-schema.ts",
    "generate-design.ts",
  ]) {
    assert.ok(!names.includes(bad), `${bad} should have been deleted`);
  }
});

test(".env.example declares no AI/LLM variables", async () => {
  const env = await readFile(new URL("../../.env.example", import.meta.url), "utf8");
  for (const v of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "ANTHROPIC_API_KEY"]) {
    assert.ok(!new RegExp(`^${v}=`, "m").test(env), `${v} must not be in .env.example`);
  }
});
