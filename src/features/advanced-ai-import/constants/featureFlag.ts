export const ADVANCED_AI_IMPORT_FEATURE_FLAG = "ENABLE_ADVANCED_AI_IMPORT";

export function isAdvancedAiImportEnabled() {
  return process.env.ENABLE_ADVANCED_AI_IMPORT !== "false";
}
