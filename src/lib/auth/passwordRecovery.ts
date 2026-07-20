export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_RESET_CONFIRMATION = "If an account exists for that email, we sent instructions to reset your password.";
export const PASSWORD_RESET_COOLDOWN_SECONDS = 30;

export function validateRecoveryEmail(email: string) {
  const value = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function validateNewPassword(password: string, confirmation: string) {
  if (password !== confirmation) return "The passwords do not match.";
  if (password.length < PASSWORD_MIN_LENGTH) return `Use a password with at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  return null;
}
