import "server-only";

type QueryTiming = {
  label: string;
  ms: number;
};

type SchoolCacheMisses = Map<string, number>;

const globalForDiagnostics = globalThis as typeof globalThis & {
  __sundialSchoolCacheMisses?: SchoolCacheMisses;
};

function enabled() {
  return process.env.NODE_ENV === "production";
}

function now() {
  return Date.now();
}

function missStore() {
  if (!globalForDiagnostics.__sundialSchoolCacheMisses) {
    globalForDiagnostics.__sundialSchoolCacheMisses = new Map();
  }

  return globalForDiagnostics.__sundialSchoolCacheMisses;
}

export function recordSchoolCacheMiss(school: string) {
  if (!enabled()) return;
  missStore().set(school, now());
}

export function createNavDiagnostics(route: string, school: string) {
  const startedAt = now();
  const queries: QueryTiming[] = [];

  return {
    async query<T>(label: string, fn: () => PromiseLike<T>) {
      const queryStartedAt = now();
      const result = await fn();
      queries.push({ label, ms: now() - queryStartedAt });
      return result;
    },
    log() {
      if (!enabled()) return;

      const lastCacheMissAt = missStore().get(school);
      const schoolCache =
        lastCacheMissAt && lastCacheMissAt >= startedAt ? "miss" : "hit";

      console.log(
        JSON.stringify({
          type: "sundial_app_nav_timing",
          route,
          school,
          totalServerMs: now() - startedAt,
          schoolCache,
          queryCount: queries.length,
          queries,
          vercelRegion:
            process.env.VERCEL_REGION ||
            process.env.AWS_REGION ||
            process.env.VERCEL_REGION_ID ||
            null,
        })
      );
    },
  };
}
