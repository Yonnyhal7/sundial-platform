# School feature availability privilege reconciliation — 2026-07-24

## Result

`PRIVILEGE_RECONCILIATION_COMPLETE`

After the operator confirmed that the 18 historical migrations had been
executed manually and authorized an isolated production correction, exactly
four privilege statements were executed against linked project
`aqofdpwnswydladodblc` at approximately `2026-07-24 18:18 UTC`:

1. revoke all privileges from `anon`;
2. revoke all privileges from `authenticated`;
3. grant `SELECT` to `anon`;
4. grant `SELECT` to `authenticated`.

The SQL was executed directly through the linked SQL query endpoint. No
historical migration, timezone migration, notification migration, `db push`,
or migration-history repair was run.

## Migration created

`20260724105000_reconcile_school_feature_availability_grants.sql`

The timestamp intentionally places the security correction before
`20260724110000_notification_foundation.sql`.

The migration:

1. revokes all table privileges from `anon`;
2. revokes all table privileges from `authenticated`;
3. grants `SELECT` to `anon`;
4. grants `SELECT` to `authenticated`;
5. verifies effective privileges inside the same transaction so inherited
   write or `TRUNCATE` access aborts the migration;
6. does not mention `postgres`, `service_role`, or the owner in a revoke;
7. does not change tables, columns, constraints, indexes, triggers, functions,
   policies, or data.

## Production preflight

Captured from linked production before any application attempt.

- Table owner: `postgres`
- RLS enabled: `true`
- RLS forced: `false`
- Row count before: `0`
- Row count after: `0`
- Grant fingerprint before: `314ce422130988b285304cc5e0e686ec`
- Grant fingerprint after: `4d812787b4e0178ba78db84e537a0e21`

Application-role privileges:

| Role | Privileges before | Privileges after |
| --- | --- | --- |
| `anon` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` | `SELECT` |
| `authenticated` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` | `SELECT` |

Preserved roles:

| Role | Current privileges |
| --- | --- |
| `postgres` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |
| `service_role` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |

Existing policies:

| Policy | Role | Command | Predicate |
| --- | --- | --- | --- |
| `Authorized users read their school features` | `authenticated` | `SELECT` | `current_user_can_access_school(school_id)` |
| `Public reads available school features` | `anon` | `SELECT` | `school_is_publicly_available(school_id)` |

Post-application verification confirmed that these definitions and the RLS
flags are unchanged. The policy fingerprint remained
`f2afcc0f052143fee03b6bf3bfdc4078`.

## Application compatibility audit

Every repository reference to `school_feature_availability` was inspected.

| Path | Operation | Authorization context | Required privilege |
| --- | --- | --- | --- |
| `src/lib/schoolFeatures.server.ts` | Reads `enabled` | `server-only`; service-role client | Service-role `SELECT` |
| `src/app/admin/dashboard/schools/actions.ts` | Calls `create_school_with_platform_defaults` | Server action guarded by `requireSuperAdminAccess` | Authenticated `EXECUTE` on RPC |
| `create_school_with_platform_defaults` in `20260720150000_platform_settings_foundation.sql` | Inserts initial school feature rows | `SECURITY DEFINER`; verifies SuperAdmin | Function-owner write access |
| `school_feature_is_enabled` in `20260720150000_platform_settings_foundation.sql` | Reads a feature gate | `SECURITY DEFINER`; exposed to `anon` and `authenticated` | Function-owner `SELECT` |

No client component, browser Supabase client, server action, or API route
directly inserts, updates, upserts, or deletes
`school_feature_availability` as `anon` or `authenticated`.

The platform-settings mutation RPC updates `platform_settings` and
`platform_feature_defaults`; it does not directly mutate per-school feature
availability.

## Verification

Commands and results:

| Command | Result |
| --- | --- |
| Focused grant/platform tests | 13 passed |
| Complete Vitest suite | 93 files passed, 1 skipped; 694 tests passed, 3 skipped |
| `npx.cmd tsc --noEmit` | Passed |
| `npm.cmd run lint` | Passed with 6 pre-existing warnings and 0 errors |
| `npm.cmd run build` | Passed |
| `git diff --check` | Passed; only existing CRLF conversion warnings |
| `npx.cmd supabase migration list --linked` | New migration is local-only; all historical pending versions remain pending |
| `npx.cmd supabase db push --linked --dry-run` | No changes made; confirmed a normal push would also attempt all older migrations and therefore must not be used |
| Live anonymous REST read | Passed |
| Live service-role REST read | Passed |
| Live anonymous `school_feature_is_enabled` RPC | Passed |
| Effective privilege catalog checks | Both application roles have only `SELECT`; service role retains all privileges |
| Trusted RPC checks | Authenticated retains `EXECUTE` on school creation and platform settings RPCs; both definition fingerprints are unchanged |

The new regression contract proves:

- the migration revokes all from both application roles;
- only `SELECT` is granted back;
- `postgres` and `service_role` are not revoke targets;
- no schema object is created, altered, or dropped;
- effective write and `TRUNCATE` privileges are checked transactionally;
- no application source directly mutates the table;
- trusted school-creation writes remain in the existing security-definer RPC;
- the security migration sorts before the pending notification migration.

## Required next step

Repeat Phase 1 migration-history verification and stop at
`READY_FOR_MIGRATION_HISTORY_RECONCILIATION`.

Do not begin timezone, notification, or migration-history repair work.
