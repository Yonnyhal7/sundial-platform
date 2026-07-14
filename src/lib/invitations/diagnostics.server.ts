import "server-only";

type InvitationAcceptanceDatabaseStage = "profile_insert";

type DatabaseErrorLike = {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
  details?: unknown;
};

const SAFE_DATABASE_ERROR_CODE = /^[a-z0-9_]{3,16}$/i;
const SAFE_CONSTRAINT_NAME = /^[a-z_][a-z0-9_$]{0,62}$/i;

function databaseErrorLike(error: unknown): DatabaseErrorLike {
  return typeof error === "object" && error !== null ? error : {};
}

function sanitizedDatabaseErrorCode(error: DatabaseErrorLike) {
  return typeof error.code === "string" && SAFE_DATABASE_ERROR_CODE.test(error.code)
    ? error.code
    : "unknown";
}

function sanitizedConstraintName(error: DatabaseErrorLike) {
  if (typeof error.constraint === "string" && SAFE_CONSTRAINT_NAME.test(error.constraint)) {
    return error.constraint;
  }

  for (const value of [error.message, error.details]) {
    if (typeof value !== "string") continue;
    const match = value.match(/\bconstraint\s+"([a-z_][a-z0-9_$]{0,62})"/i);
    if (match?.[1] && SAFE_CONSTRAINT_NAME.test(match[1])) return match[1];
  }

  return "unknown";
}

export function logInvitationAcceptanceDatabaseFailure(
  failedStage: InvitationAcceptanceDatabaseStage,
  error: unknown
) {
  const databaseError = databaseErrorLike(error);
  console.error({
    failedStage,
    databaseErrorCode: sanitizedDatabaseErrorCode(databaseError),
    constraintName: sanitizedConstraintName(databaseError),
  });
}
