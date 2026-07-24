# Production migration-history reconciliation — 2026-07-24

## Result

`RECONCILIATION_BLOCKED`

No migration SQL was run. No migration-history row was inserted, updated, or
deleted. No production schema or application-data change was made.

The live schema re-verification found one material mismatch in migration
`20260720150000_platform_settings_foundation.sql`: that migration explicitly
revokes all privileges on `public.school_feature_availability` from `public`,
`anon`, and `authenticated`, then grants only `SELECT` to `anon` and
`authenticated`. Production currently grants `anon` and `authenticated`
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`.

This is security-relevant because `TRUNCATE` is not governed by row-level
security. Per the phase instructions, a material difference makes the migration
`BLOCKED`, and any blocked migration stops history reconciliation before the
first repair.

## Capture metadata

- Captured: `2026-07-24 17:45:03 UTC`
- Operator: Codex, on behalf of the repository owner
- Linked Supabase project: `aqofdpwnswydladodblc`
- Supabase CLI: `2.109.1`
- Git commit: `fa1dffa8ddec244639ed96fd5293bbbe504b5d81`
- Backup status reported by `supabase backups list`:
  - region: `us-west-2`
  - WAL-G enabled: `true`
  - PITR enabled: `false`
  - listed physical backups: none
- Local worktree was already dirty with the in-progress notification feature.
  This report is additive and does not modify those files.

## Migration ledger before reconciliation

The remote `supabase_migrations.schema_migrations` table contains only:

| Version | Name | Stored statement count |
| --- | --- | ---: |
| `20260713120000` | `enforce_schedule_tenant_isolation` | 60 |
| `20260713120100` | `create_ai_calendar_from_draft` | 3 |
| `20260713130000` | `school_lifecycle_management` | 87 |
| `20260713140000` | `school_setup_invitation_delivery` | 29 |

All 17 Phase 1 versions, the timezone version, and the notification version are
still local-only. The local migration directory contains the expected
chronological files through `20260724110000_notification_foundation.sql`.

## Migration evidence

| Migration | Expected production state | Production evidence captured on 2026-07-24 | Final status |
| --- | --- | --- | --- |
| `20260715190000` | AI analysis cache table, RLS, three calendar-admin policies | Table exists with RLS enabled and the three expected policies. | `VERIFIED_ALREADY_PRESENT` |
| `20260716010000` | `analysis_strategy`; five-column primary key | Non-null `analysis_strategy` exists; PK is `(school_id, pdf_sha256, analysis_strategy, model, prompt_schema_version)`. | `VERIFIED_ALREADY_PRESENT` |
| `20260716020000` | Progress/status columns, nullable result, status check | All six progress columns exist; `result` is nullable; status check allows pending/ready/failed. | `VERIFIED_ALREADY_PRESENT` |
| `20260716030000` | `finished_at` | Column exists. Historical stale-row update must not be replayed. | `VERIFIED_ALREADY_PRESENT` |
| `20260716040000` | heartbeat column and pending-heartbeat index | `last_heartbeat_at` and `ai_calendar_analysis_cache_pending_heartbeat_idx` exist. Historical cleanup updates must not be replayed. | `VERIFIED_ALREADY_PRESENT` |
| `20260716050000` | invalidation columns/check/index | Four invalidation columns, check constraint, and active-lookup index exist. | `VERIFIED_ALREADY_PRESENT` |
| `20260716060000` | synchronized final AI cache schema | `analysis_version` is non-null; invalidation check includes `pdf_analysis_timeout`; PK and both lookup indexes match the synchronized design. Historical cleanup updates must not be replayed. | `VERIFIED_ALREADY_PRESENT` |
| `20260716070000` | attempt ownership columns/index/RPC | Both attempt columns, the partial attempt index, and the eight-argument claim RPC exist. The destructive historical update must not be replayed. | `VERIFIED_ALREADY_PRESENT` |
| `20260716143000` | assignment-verifying legacy AI calendar wrapper | Eight-argument wrapper exists, calls the archive-aware unchecked implementation, and contains `calendar_assignment_digest_mismatch` verification. | `VERIFIED_ALREADY_PRESENT` |
| `20260717150000` | first review-audit design | The split-table intermediate model is obsolete. The canonical review table exists, and the current RPC writes only to it. No application query reads the obsolete split table. | `VERIFIED_SUPERSEDED` |
| `20260717160000` | severity-aware intermediate review design | Superseded by the canonical table/RPC. Canonical `count_review_status` and `acknowledged_issue_codes` exist; the current RPC does not write the obsolete split table. | `VERIFIED_SUPERSEDED` |
| `20260717213000` | one canonical ten-argument overload | Exactly one `create_available_ai_calendar_from_draft` overload exists. Its intermediate body was superseded by `20260717223000`. | `VERIFIED_SUPERSEDED` |
| `20260717223000` | canonical import-review audit table, indexes, RLS, policy, and RPC | All 17 canonical columns, seven indexes including the PK, expected read policy, and canonical audit-writing RPC exist. | `VERIFIED_ALREADY_PRESENT` |
| `20260720010000` | deterministic five-minute claim behavior | Live claim RPC permits takeover when status is non-pending or `updated_at` is older than five minutes. | `VERIFIED_ALREADY_PRESENT` |
| `20260720150000` | platform settings tables/seeds/RLS/functions and least-privilege feature table grants | Four tables, five policies, three functions, one settings row, and ten feature defaults exist. **However, `anon` and `authenticated` have full privileges on `school_feature_availability`, contrary to the migration's explicit revoke-and-SELECT-only contract.** | `BLOCKED` |
| `20260720170000` | subscription tables/seeds/RLS/functions | Five tables, five policies, four mutation functions, and all four plan templates exist. | `VERIFIED_ALREADY_PRESENT` |
| `20260720190000` | memberships, invite additions, audit, RLS, functions, backfill | Both tables, three policies, nine expected functions, invite columns/index, and two membership rows exist. Zero legacy users requiring a membership are missing one. | `VERIFIED_ALREADY_PRESENT` |

### Supersession checks

- `public.ai_calendar_import_reviews` is the canonical durable audit table.
- Its canonical constraints, columns, indexes, RLS policy, and service-role
  write access exist.
- The live ten-argument
  `public.create_available_ai_calendar_from_draft(...)` writes
  `public.ai_calendar_import_reviews` and does not insert into
  `public.ai_calendar_instructional_count_reviews`.
- Production application code does not query either review table directly.
  Payload fields such as `review_status` and
  `final_approved_instructional_day_count` are request-contract fields passed
  to the canonical RPC, not obsolete-table reads.
- No migration after `20260717223000` depends on replaying the obsolete
  split-table SQL.

## Critical data-preservation baseline

| Check | Before repair |
| --- | ---: |
| Completed/non-pending rows with a non-null `analysis_attempt_id` | 10 |
| Pending AI cache rows | 11 |
| Pending rows older than 15 minutes | 11 |
| Completed-attempt ownership fingerprint | `f4288508673f203ffd915764a352065a` |

The fingerprint is an MD5 aggregate of per-row MD5 values derived from the
tenant/key tuple and `analysis_attempt_id`; it does not expose production
payloads or raw identifiers. A final read-only check after writing this local
report returned the same `10 / 11 / 11` counts and the same fingerprint. No row
was modified.

Relevant live row counts:

| Object | Rows |
| --- | ---: |
| `ai_calendar_analysis_cache` | 28 |
| `ai_calendar_import_reviews` | 2 |
| `ai_calendar_instructional_count_reviews` | 0 |
| `platform_settings` | 1 |
| `platform_feature_defaults` | 10 |
| `school_feature_availability` | 0 |
| `subscription_plans` | 4 |
| `school_subscriptions` | 0 |
| `subscription_ledger_entries` | 0 |
| `school_memberships` | 2 |

## Read-only schema snapshot

The environment could not provide a Docker-backed `supabase db dump`, so the
snapshot was captured from PostgreSQL catalogs through the linked read-only
query endpoint. It covers the affected tables' columns, constraints, indexes,
RLS policies, grants, and the affected RPC definitions/ACLs.

| Snapshot component | Before fingerprint |
| --- | --- |
| columns + constraints + indexes | `b7cb125bd9ac4eb61666392762171736` |
| RLS policies | `cd97db2a4c48fffd65382887b3deb441` |
| table grants | `4c46a11cf7b75ebca4a5a4c48a5162f9` |
| affected RPC definitions + ACLs | `3b91f71b05638f238c28750d12385954` |

Important live function definition hashes:

| Function | Definition MD5 |
| --- | --- |
| `claim_ai_calendar_analysis_attempt(uuid,text,text,text,text,uuid,text,timestamptz)` | `4a53f0509bb0b403444230a61b741a9e` |
| `create_ai_calendar_from_draft(uuid,uuid,timestamptz,date,date,boolean,jsonb,jsonb)` | `7c4f71da8e3b3bc4e025b4bfd498fb67` |
| `create_available_ai_calendar_from_draft(uuid,uuid,timestamptz,date,date,boolean,jsonb,jsonb,jsonb,jsonb)` | `140fff489bdcc118c2cf5a1a7d379885` |
| `create_school_with_platform_defaults(text,text,text,uuid,timestamptz)` | `97219b49a5f5e3511410b1db9732e9fe` |
| `assign_school_subscription(uuid,text,bigint,bigint,date,date)` | `afb8619e9bb0d31b809042f169efadcb` |
| `search_platform_users(text,uuid,text,text,text,boolean,boolean,integer,integer)` | `1979f8a6f434867da2d7ed1a4d926462` |
| `current_user_can_access_school(uuid)` | `9935f6dab3af7db52728f4fac2e22b0c` |
| `current_user_can_manage_school_section(uuid,text)` | `53b37c50c4718c014752422162631b25` |

The exact SQL definitions remain queryable with:

```sql
select
  p.oid::regprocedure as signature,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_ai_calendar_analysis_attempt',
    'create_ai_calendar_from_draft',
    'create_available_ai_calendar_from_draft',
    'school_feature_is_enabled',
    'update_platform_settings',
    'create_school_with_platform_defaults',
    'assign_school_subscription',
    'update_school_subscription',
    'record_subscription_ledger_entry',
    'update_subscription_plan_template',
    'add_school_membership',
    'update_school_membership_role',
    'remove_school_membership',
    'cancel_platform_user_invitation',
    'claim_platform_password_reset_audit',
    'search_platform_users',
    'current_user_can_access_school',
    'current_user_can_manage_school_section',
    'platform_user_directory_summary'
  )
order by p.oid::regprocedure::text;
```

## Confirmed future-pending boundaries

`20260720200000_school_timezone_management.sql` remains partially represented
and must remain pending:

- `schools.timezone`: present
- `platform_settings.default_timezone`: present
- `school_timezone_audit`: present
- `school_timezone_is_supported`: absent
- timezone enforcement trigger function: absent
- timezone enforcement trigger: absent

`20260724110000_notification_foundation.sql` remains genuinely absent:

- notification foundation tables found: 0
- `notifications` permission found: false

## CLI repair mechanism

Installed CLI help reports:

```text
supabase migration repair [flags] <version...>
--status choice  Version status to update. (choices: applied, reverted)
--linked         Repairs the migration history of the linked project.
```

Supabase's CLI documentation states that `--status applied` inserts migration
history records without running the migration SQL. The CLI accepts one or more
14-digit migration versions; this phase requires individual chronological
repairs so each result can be verified before continuing.

## Commands not approved for execution

Because `20260720150000` is blocked, the mandatory
`READY_FOR_MIGRATION_HISTORY_RECONCILIATION` checkpoint has not been reached.
No repair command is approved or should be run.

After the grant mismatch is explicitly resolved or accepted through a revised
operator decision, the chronological repair command shape would be:

```powershell
npx.cmd supabase migration repair --linked --status applied <14-digit-version>
```

The intended version sequence would be:

```text
20260715190000
20260716010000
20260716020000
20260716030000
20260716040000
20260716050000
20260716060000
20260716070000
20260716143000
20260717150000
20260717160000
20260717213000
20260717223000
20260720010000
20260720150000
20260720170000
20260720190000
```

Before any future repair, re-check:

1. `supabase/.temp/project-ref` equals `aqofdpwnswydladodblc`.
2. `npx.cmd supabase migration list --linked` still shows the target version as
   local-only and no unexpected history row.
3. The critical data counts and fingerprints still match a newly captured
   baseline.

After each future repair, immediately re-run the migration list and verify that
exactly that version gained a remote history row before proceeding.

## Required next decision

Do not begin Phase 2 yet. First decide how to handle the excessive
`school_feature_availability` grants:

- restore the migration's intended least-privilege `SELECT`-only grants through
  an explicitly authorized database change, then rerun this Phase 1
  verification; or
- explicitly accept the current grants as a later production override and
  authorize history repair despite that material difference.

The safer choice is to restore least privilege before marking
`20260720150000` applied.
