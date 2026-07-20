import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const [input, countArg = "10", outputArg = ".local-benchmarks/ai-calendar/full-analyzer-v13.json"] = process.argv.slice(2);
if (!input) throw new Error("Usage: node scripts/run-built-ai-calendar-full-benchmark.mjs <pdf> [count] [output]");
const count = Number(countArg);
if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");

const require = createRequire(import.meta.url);
const routePath = resolve(process.cwd(), ".next/server/app/api/admin/[school]/calendar/ai-import/route.js");
const route = require(routePath).routeModule?.userland;
const analyze = route?.POST?.__runBuiltFullAnalyzerBenchmark;
if (typeof analyze !== "function") throw new Error("Built full analyzer benchmark hook was not found. Run npm run build first.");

const path = resolve(process.cwd(), input);
const bytes = await readFile(path);
const runs = [];
for (let index = 1; index <= count; index += 1) {
  const diagnostics = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const capture = (level) => (message, payload, ...rest) => {
    if (typeof message === "string" && message.startsWith("AI calendar")) {
      diagnostics.push({ level, message, payload });
    }
    (level === "warn" ? originalWarn : originalInfo)(message, payload, ...rest);
  };
  console.info = capture("info");
  console.warn = capture("warn");
  let output;
  try {
    output = await analyze(new File([bytes], basename(path), { type: "application/pdf" }));
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
  const timeline = output.stageTimeline || [];
  const stageDurations = timeline.map((item, stageIndex) => ({
    stage: item.stage,
    strategy: item.strategy,
    elapsedMs: item.elapsedMs,
    durationUntilNextStageMs: (timeline[stageIndex + 1]?.elapsedMs ?? output.elapsedMs) - item.elapsedMs,
  }));
  const run = {
    run: index,
    ...output.summary,
    elapsedMs: output.elapsedMs,
    stageDurations,
    terminalResult: output.result.status,
    safeReasonCode: output.result.status === "success" ? null : output.result.reasonCode || output.result.status,
    diagnosticEvents: diagnostics.map(({ level, payload }) => ({
      level,
      event: payload?.event,
      reasonCode: payload?.reasonCode,
      durationMs: payload?.durationMs,
    })),
  };
  runs.push(run);
  console.log(`BENCHMARK_RUN ${JSON.stringify(run)}`);
  if (run.terminalResult !== "success") break;
}

const resultPath = resolve(process.cwd(), outputArg);
await mkdir(dirname(resultPath), { recursive: true });
await writeFile(resultPath, `${JSON.stringify({
  analyzerVersion: "calendar-v13-page-selection-v1",
  fixtureSha256: "650e51ee79e38cff1da5c35fd07127b598b2383a2f8f9672d6b77288f0db53c0",
  runs,
}, null, 2)}\n`);
console.log(`BENCHMARK_OUTPUT ${resultPath}`);
