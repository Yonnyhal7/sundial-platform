const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;

/** Conservative schedule identity: formatting variants collapse; semantic words remain. */
export function canonicalScheduleName(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(DASHES, "-")
    .replace(/[‘’`']/g, "").replace(/\bperiod\b/g, "periods")
    .replace(/\b(?:day|schedule)\b/g, " ")
    .replace(/\s*-\s*/g, "-").replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}
