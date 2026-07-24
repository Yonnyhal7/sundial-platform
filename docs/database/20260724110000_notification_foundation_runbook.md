# Notification foundation production runbook

Status: `READY_FOR_PRODUCTION_NOTIFICATION_FOUNDATION`

This runbook does not authorize execution. Production application requires a
separate explicit approval.

## Scope and project guard

- Production Supabase project: `aqofdpwnswydladodblc`
- Validated staging project: `mdmfkbvmmswnghaupozl`
- Migration:
  `C:\Users\jonny\OneDrive\Desktop\sundial\supabase\migrations\20260724110000_notification_foundation.sql`
- Rollback:
  `C:\Users\jonny\OneDrive\Desktop\sundial\docs\database\20260724110000_notification_foundation_rollback.sql`

Immediately before any production command, read
`supabase\.temp\project-ref` and stop unless it is exactly
`aqofdpwnswydladodblc`.
Also confirm a recent physical backup is available in the Supabase dashboard.

## Production preflight baseline

Captured on 2026-07-24:

| Check | Baseline |
| --- | ---: |
| New notification tables | 0 |
| New notification functions | 0 |
| `notifications` permission rows | 0 |
| Missing dependencies | 0 |
| Active / archived schools | 3 / 2 |
| Schools / users / memberships | 5 / 4 / 2 |
| Permissions / user-permission rows | 16 / 0 |
| Announcements / events / teams | 0 / 0 / 0 |
| Calendar days | 844 |
| Columns, constraints, indexes | `688801a1c6b232d15e1a7e0120dd5f2d` |
| RLS policies | `31b83cb260350d21228b438bd62226f7` |
| Table grants | `015a54d60cac20ee5b4bd37e025d2eda` |
| Function definitions and ACLs | `3ea654a789b393f9621c591499fc3d62` |
| Triggers | `d8d0ef1bec493f8fdc9d71135cdc8c36` |
| Completed AI attempt IDs | 10 |
| Pending / stale-pending AI attempts | 11 / 11 |

Repeat the read-only preflight:

```powershell
npx.cmd supabase db query --linked --file "C:\Users\jonny\OneDrive\Desktop\sundial\supabase\tests\notification_foundation_production_preflight.sql"
```

Stop if the linked project, object absence, dependency count, row counts, or
fingerprints differ unexpectedly.

## Isolated production command

Do not use `supabase db push`. After explicit approval, execute only:

```powershell
npx.cmd supabase db query --linked --file "C:\Users\jonny\OneDrive\Desktop\sundial\supabase\migrations\20260724110000_notification_foundation.sql"
```

After all post-apply verification passes, record only this migration:

```powershell
npx.cmd supabase migration repair --status applied 20260724110000 --linked
npx.cmd supabase migration list --linked
```

## Expected database result

- 8 RLS-enabled tables
- 21 indexes, including primary-key and unique indexes
- 15 foreign keys
- 5 authenticated-manager SELECT policies
- 9 functions
- 3 triggers
- 1 `notifications` permission
- Settings rows for active schools only
- No policies or application-role grants on device, preference, or push-secret
  tables
- `authenticated` receives SELECT only on settings, campaigns, audiences,
  delivery metadata, and audit
- Campaign mutation RPCs are executable by `authenticated`
- Queue claim RPC is executable only by `service_role`
- Trigger helpers are not executable by `anon` or `authenticated`

Post-apply, repeat all baseline fingerprints and row counts. Expected
differences must be limited to the new objects, the `notifications` permission,
and one settings row per active school. Existing school, user, membership,
announcement, event, team, calendar-day, and AI-cache rows must remain
unchanged.

## Runtime configuration

Generate one VAPID key pair outside Git:

```powershell
npx.cmd web-push generate-vapid-keys --json
```

Configure these in the Vercel project before deploying the notification
application:

| Variable | Configuration |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public VAPID key; Production and the controlled Preview environment |
| `VAPID_PRIVATE_KEY` | Matching private key; Sensitive; Production only unless a separate staging pair is used |
| `VAPID_SUBJECT` | `mailto:support@sundialk12.com` |
| `CRON_SECRET` | New random value of at least 32 bytes; Sensitive; Production only |

Never reuse production VAPID keys or `CRON_SECRET` in staging or preview.
Changing Vercel variables requires a new deployment before the application can
read the new values.

`vercel.json` schedules:

```text
/api/cron/notifications  * * * * *
```

That cadence requires a Vercel plan supporting one-minute cron jobs. Vercel
will send `CRON_SECRET` as a Bearer authorization header to the route.

## Controlled smoke test

1. Deploy the reviewed application only after the database postflight passes.
2. Use one designated internal test school.
3. Register one controlled test PWA device as one audience.
4. Confirm one device row, recommended per-device preferences, and one active
   subscription. Confirm no application role can read endpoint, `p256dh`, or
   auth values.
5. Create a harmless draft, schedule it, reschedule it, and cancel it.
6. Create one harmless send-now campaign for only the controlled audience.
7. Verify one queue claim, one delivery row, inbox content, purple unread dot,
   mark-one-read, mark-all-read, and tenant-local notification-click routing.
8. Verify campaign totals and audit history.
9. Confirm no other school, audience, device, or browser received the message.
10. Do not use Push All or a schoolwide audience in this smoke test.

## Rollback

Before onboarding or any real registration, the rollback file can remove the
foundation cleanly. It deletes all notification data and the permission, so
export notification records first if any real campaign or device has been
created.

After rollback, mark `20260724110000` reverted only if its production migration
history had already been marked applied.

## User onboarding still excluded

Do not enable or announce Student, Parent, or Staff onboarding yet. The next
phase must finish and separately validate:

- first-launch audience choice and consent copy;
- iPhone/iPad Add-to-Home-Screen and permission guidance;
- denied-permission recovery without repeated prompting;
- preference management for every allowed audience/category combination;
- unregister/re-register and expired-subscription recovery UX;
- verified signed-in staff association without treating audience as a role;
- anonymous Student and Parent privacy/retention rules;
- multi-device management and audience changes;
- accessibility and real-device Safari/Chrome testing.
