import "server-only";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

type WorkerPathResolver = (specifier: string) => unknown;
type WorkerSourceReader = (path: string) => Promise<Uint8Array>;

const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
// Keep this specifier runtime-computed. A literal require.resolve argument is rewritten by
// Turbopack to its numeric module ID and must never reach fs.readFile.
const workerSpecifier = ["pdfjs-dist", "legacy", "build", "pdf.worker.mjs"].join("/");
let cachedWorkerDataUrl: string | null = null;

export class PdfjsWorkerResolutionError extends Error {
  readonly reasonCode = "pdfjs_worker_resolution_failed";

  constructor(message: string) {
    super(message);
    this.name = "PdfjsWorkerResolutionError";
  }
}

export async function loadPdfjsWorkerDataUrlForRuntime(options: {
  resolveWorkerPath?: WorkerPathResolver;
  readWorkerSource?: WorkerSourceReader;
  useCache?: boolean;
} = {}) {
  if (options.useCache !== false && cachedWorkerDataUrl) return cachedWorkerDataUrl;

  const resolveWorkerPath = options.resolveWorkerPath || ((specifier: string) =>
    runtimeRequire.resolve(specifier));
  const readWorkerSource = options.readWorkerSource || readFile;
  const resolved = resolveWorkerPath(workerSpecifier);
  const workerPathType = typeof resolved;

  if (workerPathType !== "string" || !(resolved as string).trim()) {
    console.warn("AI calendar import diagnostic", {
      event: "pdfjs_worker_initialization_failed",
      workerPathType,
      workerSourceLength: 0,
      workerResolved: false,
      runtime: "nodejs",
      reasonCode: "pdfjs_worker_path_not_string",
    });
    throw new PdfjsWorkerResolutionError(
      `PDF.js worker resolution returned ${workerPathType}; expected a filesystem path.`
    );
  }

  const source = await readWorkerSource(resolved as string);
  const workerSourceLength = source.byteLength;
  if (workerSourceLength === 0) {
    throw new PdfjsWorkerResolutionError("PDF.js worker source was empty.");
  }

  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  console.info("AI calendar import diagnostic", {
    event: "pdfjs_worker_initialized",
    workerPathType,
    workerSourceLength,
    workerResolved: true,
    runtime: "nodejs",
  });
  if (options.useCache !== false) cachedWorkerDataUrl = dataUrl;
  return dataUrl;
}
