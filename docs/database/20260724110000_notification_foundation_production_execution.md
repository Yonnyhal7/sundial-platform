# Notification foundation production execution

## Result

`NOTIFICATION_DATABASE_FOUNDATION_COMPLETE`

- Production project: `aqofdpwnswydladodblc`
- Applied migration: `20260724110000_notification_foundation.sql`
- Migration SHA-256:
  `1E980C942D3BC6288633989A77AC308FEE46940215F460C9F45D2A624721D725`
- Latest verified physical backup:
  `2026-07-24T18:12:17.591Z`, `COMPLETED`
- Rollback required: no
- External pushes sent: 0
- Real devices registered: 0
- Application deployed: no
- VAPID/cron configuration changed: no

## Command executed

```powershell
npx.cmd supabase db query --linked --file "C:\Users\jonny\OneDrive\Desktop\sundial\supabase\migrations\20260724110000_notification_foundation.sql"
```

No `supabase db push` command was run.

## Database result

- 8 exact notification tables, all with RLS enabled
- 21 exact indexes
- 15 foreign keys
- 5 authenticated-manager SELECT policies
- 9 expected functions
- 3 enabled triggers
- 1 `notifications` permission
- 3 active-school settings rows
- 0 archived-school settings rows
- 0 `anon` notification-table grants
- `authenticated` has SELECT only on settings, campaigns, audiences,
  deliveries, and audit
- 0 application-role grants on device, preference, or push-secret tables
- 0 application-role EXECUTE privileges on private helpers, triggers, or the
  service-role queue claim function

Unrelated fingerprints remained:

| Component | Before and after |
| --- | --- |
| Columns, constraints, indexes | `688801a1c6b232d15e1a7e0120dd5f2d` |
| Policies | `31b83cb260350d21228b438bd62226f7` |
| Grants | `015a54d60cac20ee5b4bd37e025d2eda` |
| Functions and ACLs | `3ea654a789b393f9621c591499fc3d62` |
| Triggers | `d8d0ef1bec493f8fdc9d71135cdc8c36` |

## Preservation result

- Completed AI attempt IDs: 10
- Pending AI attempts: 11
- Stale pending AI attempts: 11
- AI fingerprint: `f4288508673f203ffd915764a352065a`
- Five school timezone values unchanged
- Timezone audit rows: 2
- Timezone audit fingerprint: `f5ecc916734195299eb7f7948203a4ab`
- `school_feature_availability` rows: 0
- `anon` and `authenticated`: SELECT only
- Existing school, user, membership, announcement, event, athletics, calendar,
  platform, subscription, and AI row counts remained at their approved
  baselines

## Transactional smoke test

The production smoke test ran inside an explicit transaction and ended with
`ROLLBACK`. It verified campaign lifecycle and idempotency, optimistic locking,
rate limiting, archived/cross-school rejection, membership-aware Editor
permission, anonymous and authenticated devices, Student/Parent/Staff
audiences, per-device preferences, subscription replacement, inbox-only
delivery, unread/read state, terminal-delivery retry protection, simulated
permanent 410 handling, and atomic/stale queue claims.

An additional two-session production probe overlapped calls using the same
campaign idempotency key. The second transaction waited on the unique-key lock,
then completed only after the first transaction rolled back. Both transactions
rolled back, both assertions passed, and no campaign or audit residue remained.

The first run rolled back at a smoke-harness assertion because an existing
campaign/audience pair reached the primary key before the intended cross-school
foreign key. The probe was changed to a fresh audience and the complete
transaction then passed. Both runs left zero synthetic campaigns, audiences,
devices, subscriptions, preferences, deliveries, or audit rows.

No Web Push provider was invoked.

## Migration history

Executed:

```powershell
npx.cmd supabase migration repair --status applied 20260724110000 --linked
npx.cmd supabase migration list --linked
```

Local and remote migration versions now align through `20260724110000`. No
production migration remains pending.

## Next checkpoint

Configure VAPID and cron secrets, deploy the notification-aware application,
and perform a one-device production smoke test. This phase was not started.
