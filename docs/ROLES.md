# Backend roles

Canonical roles after migration `009_merge_resume_reviewer_role.sql`:

| Role | Responsibilities |
| --- | --- |
| `member` | Customer account and owned cards, subject to plan limits; Resume Enhancement submission requires eligibility including active Pro. |
| `cv_specialist` | Work on assigned resume requests, request information, upload drafts and deliverables for review. No final release permission. |
| `resume_service_admin` | Resume queue, specialist assignment, work, quality review, final release, specialist management and audit access. Includes the former reviewer responsibilities. |
| `super_admin` | Platform administration and all seeded permissions, including controlled administrative data CRUD. |

Role grants in `user_roles` and `role_permissions` are authoritative. A user
can hold multiple roles. The `users.role` column is the compatibility snapshot
of the highest-priority active role. Plans (Starter/Basic/Pro) are separate.

## Reviewer consolidation

The former `resume_quality_reviewer` role is retired. Its active users become
`resume_service_admin`, gaining that role's full operational access. Existing
admin grants are deduplicated, and a revoked admin grant is reactivated only
when the source reviewer grant is active. Revoked reviewer grants do not confer
new access. Custom reviewer permissions are merged into the target role.

Original reviewer grants, including revocation metadata, are archived in
`activity_logs` as `rbac.resume-reviewer-merged` before the old role and its
join rows are removed. Resume assignments, review records, files, and reviewer
user IDs remain unchanged. Historical migrations retain the retired code.

Deploy with role-management writes paused, run `npm run migrate`, then restart
the backend. Users with old reviewer access tokens should log in again (or
refresh their session) to receive the canonical role from the database.
Old reviewer JWT claims and new grants using the retired code are rejected;
they are not silently translated into a more privileged role.

This merge is forward-only: its Down section does not split roles or revoke
the merged permissions. Use a reviewed corrective migration to reverse the
business decision; an ordinary rollback does not restore the retired role.

Frontend handoff: remove `resume_quality_reviewer` from role selection and
navigation logic; expose its quality-review/release workflow under
`resume_service_admin`. Prefer returned permissions for action visibility.
Backend permission, ownership, assignment, and state checks remain authoritative.
