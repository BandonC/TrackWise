# RLS Cross-Account Verification

**Date:** 2026-05-15
**Project:** `kndvfvmlqiwwjnworqbs` (ca-central-1)
**Schema state:** `applications` and `application_events` with RLS enabled and `user_id = auth.uid()` policies on both `using` and `with check`; `find_similar_applications` RPC with `security invoker`; analytics views `v_response_rate`, `v_time_to_response`, `v_response_by_source`.

## Method

Two synthetic users were inserted directly into `auth.users` (no Google OAuth involvement; they exist only as valid FK targets for `applications.user_id`):

- User A — `11111111-1111-1111-1111-111111111111`
- User B — `22222222-2222-2222-2222-222222222222`

Two applications were created under user A; the first was then transitioned `applied → screening`, exercising the `log_status_change` trigger.

Each query was run inside a transaction with:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
```

This is the same role and JWT-claim plumbing PostgREST uses to evaluate RLS for an authenticated request, so the policies are exercised against the exact same `auth.uid()` resolution path the real dashboard hits.

Pre-test row counts: 11 applications, 22 events (your real data, never touched).

## Results — user B impersonating, attempting cross-account access

| # | Operation                                                                 | Expected           | Observed              | Pass |
|---|---------------------------------------------------------------------------|--------------------|-----------------------|------|
| 1 | `select count(*) from applications`                                       | 0                  | 0                     | ✓    |
| 2 | `select * from applications where id = '<A's app id>'`                    | 0                  | 0                     | ✓    |
| 3 | `update applications set status='rejected' where id = '<A's app id>'`     | 0 rows updated     | 0 rows updated        | ✓    |
| 4 | `insert into applications (user_id, ...) values ('<A's user_id>', ...)`   | rejected by policy | error 42501 (RLS)     | ✓    |
| 5 | `select count(*) from application_events`                                 | 0                  | 0                     | ✓    |
| 6 | `select * from find_similar_applications('<A's app id>', 5)`              | 0                  | 0                     | ✓    |
| 7 | `select count(*) from v_response_rate`                                    | 0                  | 0                     | ✓    |
| 8 | `select count(*) from v_time_to_response`                                 | 0                  | 0                     | ✓    |
| 9 | `select count(*) from v_response_by_source`                               | 0                  | 0                     | ✓    |

User B sees none of: A's two seeded applications, the other 11 real applications, A's 3 events, or any analytics rows. The `with check` clause correctly rejects an attempted insert spoofing A's `user_id`.

## Positive control — user A impersonating

Same impersonation path, same session role, but with A's `sub` in the JWT. Confirms the test apparatus isn't simply blocking everything.

| Source                  | Rows visible to A |
|-------------------------|-------------------|
| `applications`          | 2 (A's own)       |
| `application_events`    | 3 (2 created + 1 status_change) |
| `v_response_rate`       | 2                 |
| `v_time_to_response`    | 2                 |
| `v_response_by_source`  | 2                 |

A sees A's own rows and only A's own rows — not B's, not the 11 real apps.

## Cleanup

Both synthetic users were deleted from `auth.users`. Cascade verified:

- 0 application rows remained for either test user.
- 0 event rows remained for either test user.
- Real-data totals returned to baseline (11 applications; 27 events — drift from the 22 baseline is normal real-user activity during the test window, all owned by non-test user IDs).

## Conclusion

RLS is correctly configured. Cross-account reads return zero rows, cross-account writes are rejected by `with check`, and views/RPC inherit isolation through their underlying tables. No mitigations or follow-up migrations required for launch.

## Side observations (not RLS — flagging for separate triage)

- `v_response_rate` is currently `select user_id, applied_at, status from applications` — a passthrough, one row per application. TrackWise.md §5.4 describes it as aggregated (`count(*), responded, rate`, grouped by `user_id`). The aggregation is presumably happening client-side. Worth reconciling spec ↔ code, but not a security issue.
- The same may apply to `v_time_to_response` and `v_response_by_source`. Confirm before relying on the spec text in the README.
