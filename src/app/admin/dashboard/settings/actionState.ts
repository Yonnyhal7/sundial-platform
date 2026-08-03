export type SettingsActionState = {
  status: "idle" | "success" | "validation_error" | "stale" | "server_error";
  message?: string;
  version?: number;
};

export const INITIAL_SETTINGS_STATE: SettingsActionState = { status: "idle" };

export type TestEmailState = {
  status: "idle" | "success" | "validation_error" | "server_error";
  message?: string;
  providerMessageId?: string;
};

export const INITIAL_TEST_EMAIL_STATE: TestEmailState = { status: "idle" };
