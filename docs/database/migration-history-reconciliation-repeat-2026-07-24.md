# Repeated production migration-history reconciliation — 2026-07-24

## Result

`MIGRATION_HISTORY_RECONCILIATION_COMPLETE`

The 17 approved `migration repair --status applied` commands were executed
individually and chronologically against linked production project
`aqofdpwnswydladodblc`. Every command was followed by a linked migration-list
check that compared the complete remote-applied set to the expected set before
the next command ran.

No migration SQL was executed. Production application schema, data, policies,
grants, functions, and triggers are unchanged. Only
`supabase_migrations.schema_migrations` metadata changed.

## Current state

- Supabase CLI: `2.109.1`
- Linked project: `aqofdpwnswydladodblc`
- Git commit: `fa1dffa8ddec244639ed96fd5293bbbe504b5d81`
- Git worktree: dirty with the existing notification work, reconciliation
  reports, grant migration, and tests
- Remote migration ledger contains only:
  - `20260713120000`
  - `20260713120100`
  - `20260713130000`
  - `20260713140000`
- Before execution, none of the 17 reconciliation targets was recorded
  remotely.
- After execution, all 17 reconciliation targets are recorded remotely.
- Supabase reports a completed physical backup at
  `2026-07-24 18:12:17 UTC`, a second completed backup at
  `2026-07-24 13:06:33 UTC`, and completed daily backups through July 17.
- WAL-G is enabled; PITR is not enabled.

## Verification of all 17 migrations

| Version | Status | Current production evidence |
| --- | --- | --- |
| `20260715190000` | `VERIFIED_ALREADY_PRESENT` | AI analysis cache table exists with RLS and all three calendar-admin policies. |
| `20260716010000` | `VERIFIED_ALREADY_PRESENT` | Non-null `analysis_strategy` and the five-column primary key exist. |
| `20260716020000` | `VERIFIED_ALREADY_PRESENT` | All progress/status columns, nullable result, and pending/ready/failed status check exist. |
| `20260716030000` | `VERIFIED_ALREADY_PRESENT` | `finished_at` exists. The historical stale-row update must not be replayed. |
| `20260716040000` | `VERIFIED_ALREADY_PRESENT` | `last_heartbeat_at` and the partial heartbeat index exist. The historical cleanup must not be replayed. |
| `20260716050000` | `VERIFIED_ALREADY_PRESENT` | Invalidation columns, reason check, and active-lookup index exist. |
| `20260716060000` | `VERIFIED_ALREADY_PRESENT` | Synchronized final cache schema exists; `analysis_version` is non-null and the reason check includes `pdf_analysis_timeout`. |
| `20260716070000` | `VERIFIED_ALREADY_PRESENT` | Attempt columns, attempt index, and eight-argument claim RPC exist. Replaying would erase valid ownership values. |
| `20260716143000` | `VERIFIED_ALREADY_PRESENT` | Archive-aware eight-argument calendar wrapper includes `calendar_assignment_digest_mismatch` verification. |
| `20260717150000` | `VERIFIED_SUPERSEDED` | Split review model was replaced by the canonical `ai_calendar_import_reviews` table and RPC from `20260717223000`. |
| `20260717160000` | `VERIFIED_SUPERSEDED` | Severity-aware split review model was replaced by the canonical count-review fields and audit RPC. |
| `20260717213000` | `VERIFIED_SUPERSEDED` | Its overload cleanup persists, but its intermediate body was replaced by the current canonical `20260717223000` body. |
| `20260717223000` | `VERIFIED_ALREADY_PRESENT` | Canonical table has all 17 columns, seven indexes including its PK, RLS/read policy, and the sole ten-argument audit-writing RPC. |
| `20260720010000` | `VERIFIED_ALREADY_PRESENT` | Live claim RPC uses deterministic non-pending or five-minute-stale takeover behavior. |
| `20260720150000` | `VERIFIED_ALREADY_PRESENT` | Four platform tables, five policies, three RPCs, settings seed, ten feature defaults, and corrected least-privilege feature grants exist. |
| `20260720170000` | `VERIFIED_ALREADY_PRESENT` | Five subscription tables, five policies, four RPCs, and four plan templates exist. |
| `20260720190000` | `VERIFIED_ALREADY_PRESENT` | Membership/audit tables, three policies, nine RPCs, invite additions, and complete legacy-user backfill exist. |

Supersession checks:

- The live ten-argument `create_available_ai_calendar_from_draft` is the only
  overload.
- It writes `public.ai_calendar_import_reviews`.
- It does not write `public.ai_calendar_instructional_count_reviews`.
- Application source has no direct reference to either audit table.
- Migrations after `20260717223000` do not depend on replaying the obsolete
  split-table SQL.

## Security verification

Current application-role grants on
`public.school_feature_availability` are exactly:

| Role | Privilege |
| --- | --- |
| `anon` | `SELECT` |
| `authenticated` | `SELECT` |

Neither role has `DELETE`, `INSERT`, `REFERENCES`, `TRIGGER`, `TRUNCATE`, or
`UPDATE`. `postgres` and `service_role` retain full access. RLS remains enabled
and the two existing SELECT policies are unchanged.

## Critical data-preservation verification

| Check | Current value |
| --- | ---: |
| Completed/non-pending rows with non-null `analysis_attempt_id` | 10 |
| Pending AI cache rows | 11 |
| Pending rows older than 15 minutes | 11 |
| Completed-attempt fingerprint | `f4288508673f203ffd915764a352065a` |

These values exactly match the earlier preservation baseline. No row was
modified.

## Confirmed CLI repair syntax

Installed CLI help reports:

```text
supabase migration repair [flags] <version...>
--status choice  Version status to update. (choices: applied, reverted)
--linked         Repairs the migration history of the linked project.
```

With `--status applied`, `migration repair` inserts the specified version into
the remote migration-history table. It does not execute the migration file's
SQL.

## Commands executed

Each command below succeeded and passed its immediate linked migration-list
assertion:

```powershell
npx.cmd supabase migration repair --status applied 20260715190000 --linked
npx.cmd supabase migration repair --status applied 20260716010000 --linked
npx.cmd supabase migration repair --status applied 20260716020000 --linked
npx.cmd supabase migration repair --status applied 20260716030000 --linked
npx.cmd supabase migration repair --status applied 20260716040000 --linked
npx.cmd supabase migration repair --status applied 20260716050000 --linked
npx.cmd supabase migration repair --status applied 20260716060000 --linked
npx.cmd supabase migration repair --status applied 20260716070000 --linked
npx.cmd supabase migration repair --status applied 20260716143000 --linked
npx.cmd supabase migration repair --status applied 20260717150000 --linked
npx.cmd supabase migration repair --status applied 20260717160000 --linked
npx.cmd supabase migration repair --status applied 20260717213000 --linked
npx.cmd supabase migration repair --status applied 20260717223000 --linked
npx.cmd supabase migration repair --status applied 20260720010000 --linked
npx.cmd supabase migration repair --status applied 20260720150000 --linked
npx.cmd supabase migration repair --status applied 20260720170000 --linked
npx.cmd supabase migration repair --status applied 20260720190000 --linked
```

Each command was followed by a migration-list check proving that exactly the
intended version was added before execution continued.

## Before-and-after preservation comparison

| Component | Before | After |
| --- | --- | --- |
| Public columns, constraints, and indexes | `e036fe7bfdafeecdfaca852a596986d5` | `e036fe7bfdafeecdfaca852a596986d5` |
| Public RLS policies | `5f7237cef2026a4a3332ec5d4d38e495` | `5f7237cef2026a4a3332ec5d4d38e495` |
| Public table grants | `d502b599740634559cc3ad603eb8f70b` | `d502b599740634559cc3ad603eb8f70b` |
| Public function definitions and ACLs | `1a28a93c7aa5fd3b80f21ce34935c376` | `1a28a93c7aa5fd3b80f21ce34935c376` |
| Public triggers | `5f0af3259f0346d76a9a90b4d769b7a8` | `5f0af3259f0346d76a9a90b4d769b7a8` |
| Completed attempt IDs | 10 | 10 |
| Pending attempts | 11 | 11 |
| Stale pending attempts | 11 | 11 |
| Completed-attempt fingerprint | `f4288508673f203ffd915764a352065a` | `f4288508673f203ffd915764a352065a` |

## Migrations that must remain pending

- `20260720200000_school_timezone_management.sql`
- `20260724105000_reconcile_school_feature_availability_grants.sql`
- `20260724110000_notification_foundation.sql`

No `db push` should be used. No timezone, grant-reconciliation, or notification
migration should be applied during the history repair.

## Next phase

Phase 2: reconcile or complete
`20260720200000_school_timezone_management.sql`.

Do not begin Phase 2 automatically.
