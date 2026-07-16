import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const routePath = resolve(
  process.cwd(),
  ".next/server/app/api/admin/[school]/calendar/ai-import/route.js"
);
const route = require(routePath).routeModule?.userland;
const extract = route?.POST?.__runBuiltVectorBenchmark;
if (typeof extract !== "function") {
  throw new Error("Built AI calendar vector benchmark hook was not found. Run npm run build first.");
}

for (const input of process.argv.slice(2)) {
  const path = resolve(process.cwd(), input);
  const bytes = await readFile(path);
  const result = await extract(
    new File([bytes], basename(path), { type: "application/pdf" })
  );
  console.log(JSON.stringify({
    file: basename(path),
    supported: result.supported,
    confidence: result.confidence,
    reasonCodes: result.reasonCodes,
    firstTenAssignments: result.assignments.slice(0, 10),
  }));
}
