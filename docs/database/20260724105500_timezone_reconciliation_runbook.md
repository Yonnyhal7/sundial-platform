# School timezone reconciliation runbook

Status: `READY_FOR_PRODUCTION_TIMEZONE_RECONCILIATION`

This runbook does not authorize production execution. It records the reviewed
state and the exact isolated procedure to use only after explicit approval.

## Target and approach

- Production project: `Sundial`
- Production project ref: `aqofdpwnswydladodblc`
- Staging project: `sundial-migration-staging`
- Staging project ref: `mdmfkbvmmswnghaupozl`
- Selected approach: Option B, narrow reconciliation migration
- Forward SQL:
  `supabase/migrations/20260724105500_reconcile_school_timezone_management.sql`
- Rollback SQL:
  `docs/database/20260724105500_timezone_reconciliation_rollback.sql`
- Read-only preflight:
  `supabase/tests/timezone_reconciliation_production_preflight.sql`

Do not run `supabase db push`. Do not run the notification migration.

## Component classification

| Historical component | Production state | Classification |
| --- | --- | --- |
| `schools.timezone_version` | `bigint not null default 1` | ALREADY_PRESENT |
| `schools.timezone_updated_at` | nullable `timestamptz` | ALREADY_PRESENT |
| `schools.timezone_updated_by` | nullable UUID FK to `users`, `on delete set null` | ALREADY_PRESENT |
| `school_timezone_audit` columns and constraints | Present and compatible | ALREADY_PRESENT |
| Audit school/created index | Present | ALREADY_PRESENT |
| Audit RLS flags | Enabled, not forced | ALREADY_PRESENT |
| Audit read policy | Exact intended membership-aware settings policy | ALREADY_PRESENT |
| Audit table grants | `authenticated` has `SELECT`; service role retains full access | ALREADY_PRESENT |
| `school_timezone_is_supported(text)` | Absent | MISSING |
| `enforce_supported_school_timezone()` | Absent | MISSING |
| School timezone validation trigger | Absent | MISSING |
| `update_platform_settings(text,bigint,jsonb)` | Existing signature, but no centralized timezone validation and `search_path=public` | DIFFERENT |
| `update_school_timezone(uuid,bigint,text,boolean)` | Existing membership-aware authorization, but inline validation permits `US/*` and archived/stale rejections are not audited | DIFFERENT |
| Historical table/index/policy/table-grant replay | Objects are already correct; replay would touch broader live security objects for no final-state benefit | UNSAFE_TO_REPLAY |
| Historical final function/trigger definitions | Installed by the narrow migration | SUPERSEDED |

## Validated production data

Captured read-only on 2026-07-24 immediately before the ready checkpoint:

- Schools: 5 total, 3 active, 2 archived
- Null timezones: 0
- Values longer than 100 characters: 0
- `US/*` aliases: 0
- `Etc/GMT*` values: 0
- Malformed values: 0
- Values absent from `pg_timezone_names`: 0
- Platform default: `America/Los_Angeles`
- Timezone audit: 2 rows, 2 successful, 0 rejected
- Audit data fingerprint: `f5ecc916734195299eb7f7948203a4ab`

No existing school would be rejected by the intended validation.

## Before-state fingerprints

| Scope | Fingerprint |
| --- | --- |
| `schools` and `school_timezone_audit` columns | `7d644fb943a1a6ae85626eb0a78dba2a` |
| Constraints | `2582e2c3fef6b0b22d7bc9ea4a28b925` |
| Indexes | `15894436d2f030ecacdf2ae215a85e65` |
| RLS policies | `cd0e733c5e616a776104d3c7542ea55e` |
| Table grants | `cec250dc349eb6339c25d40cee59da68` |
| `update_platform_settings` definition | `32d01f4ecb3713ca42cc7100f5d0a4da` |
| `update_school_timezone` definition | `dbdaaa112c976bd1f1cac932c6d40410` |

RLS is enabled and not forced on both `schools` and
`school_timezone_audit`. There are no user-defined triggers on `schools`.

## Expected after-state

The five structural fingerprints for columns, constraints, indexes, policies,
and table grants must remain byte-for-byte unchanged. Existing school timezone
values and the two existing audit rows must remain unchanged.

Expected function definitions, proven in staging:

| Function | Expected definition hash | Execution |
| --- | --- | --- |
| `school_timezone_is_supported(text)` | `5deb6cced7de376ab6b659197cd8489a` | owner only |
| `enforce_supported_school_timezone()` | `e1432ac05ef6f8b56319652d582c0f98` | owner only |
| `update_platform_settings(text,bigint,jsonb)` | `c25f4420fee4e62878e5ff030f1da856` | authenticated and service role |
| `update_school_timezone(uuid,bigint,text,boolean)` | `91204ec0b24a37030d4ce923397cc68c` | authenticated and service role |

Expected trigger:

```sql
CREATE TRIGGER enforce_supported_school_timezone
BEFORE INSERT OR UPDATE OF timezone ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supported_school_timezone();
```

Expected behavior:

- Direct invalid writes fail with SQLSTATE `22023`.
- Only SuperAdmin can update the platform default.
- An active SchoolAdmin can update only a school owned through the legacy
  relationship or an active `SchoolAdmin` membership.
- Editor, inactive-user, and cross-school attempts return `permission_error`.
- Archived schools return `school_unavailable`.
- Unconfirmed, stale, unsupported, alias, and fixed-offset attempts are
  rejected; applicable rejections are audited.
- The server action resolves the target school from the authorized school
  context and passes `schoolData.id`; a submitted UUID is not trusted.

## Staging evidence

The forward migration was executed twice against synthetic fixtures in
`mdmfkbvmmswnghaupozl`. The rollback was executed between the two runs.

Both forward runs passed:

- Existing audit row count, audit data, audit columns, audit policy, and audit
  grants preserved
- SuperAdmin valid update passed
- Authorized SchoolAdmin own-school update passed
- Cross-school SchoolAdmin denied
- Editor denied
- Inactive SchoolAdmin denied
- Archived school denied and audited
- Unconfirmed and stale requests denied and audited
- Malformed/unknown, `US/*`, and `Etc/GMT*` values denied and audited
- Direct invalid table update blocked by the trigger
- Platform default used the same validation helper
- SchoolAdmin platform-default update denied
- RPC/helper ACLs matched the intended contract
- Rollback removed the trigger and both helpers and restored the prior RPCs

Final synthetic result:

```json
{
  "status": "timezone_reconciliation_staging_passed",
  "existing_audit_rows_preserved": 2,
  "total_audit_rows_after_tests": 10,
  "school_a_timezone": "America/Denver",
  "school_a_version": 3,
  "platform_default_timezone": "America/New_York"
}
```

## Exact production procedure after approval

First confirm the main checkout is linked to `aqofdpwnswydladodblc`, then rerun
the read-only preflight and compare it with the fingerprints above.

Execute only:

```powershell
npx.cmd supabase db query --linked --file "C:\Users\jonny\OneDrive\Desktop\sundial\supabase\migrations\20260724105500_reconcile_school_timezone_management.sql"
```

The exact SQL executed by that command is the complete contents of
`supabase/migrations/20260724105500_reconcile_school_timezone_management.sql`.
It is wrapped in one transaction.

After successful structural and functional verification, record migration
history without replaying SQL, one version at a time:

```powershell
npx.cmd supabase migration repair --status applied 20260720200000 --linked
npx.cmd supabase migration list --linked
npx.cmd supabase migration repair --status applied 20260724105500 --linked
npx.cmd supabase migration list --linked
```

Expected ledger afterward:

- `20260720200000`: applied
- `20260724105000`: pending
- `20260724105500`: applied
- `20260724110000`: pending

The historical version is marked applied only after its intended final state is
proven represented. The narrow reconciliation version is also recorded because
its SQL is what was actually executed.

## Rollback

If structural or functional verification fails, execute only:

```powershell
npx.cmd supabase db query --linked --file "C:\Users\jonny\OneDrive\Desktop\sundial\docs\database\20260724105500_timezone_reconciliation_rollback.sql"
```

The rollback restores the two exact pre-reconciliation RPC behaviors and ACLs,
then removes the trigger and private helpers. It intentionally does not delete
legitimate timezone updates or audit rows created after reconciliation.

Do not record either migration version as applied if the forward migration was
rolled back.
