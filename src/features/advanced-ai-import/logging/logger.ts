type Metadata = Record<string, unknown>;

export const advancedImportLogger = {
  info(message: string, metadata: Metadata = {}) {
    console.info(`[Advanced Import] ${message}`, metadata);
  },
  error(message: string, metadata: Metadata = {}) {
    console.error(`[Advanced Import] ${message}`, metadata);
  },
};
