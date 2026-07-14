import "server-only";
import { resolveSchoolEmailConfig } from "./config";

export function getSchoolEmailConfig() {
  return resolveSchoolEmailConfig(process.env);
}
