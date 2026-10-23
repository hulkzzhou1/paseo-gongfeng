# Changelog

## 0.2.0 — 2026-10-23

- Add a Milestones tab with aggregated added-repository browsing, repository/state filters, loaded-content search and floating details.
- Create, edit, close, reopen and explicitly confirm milestone deletion; deleting a milestone preserves its issues and merge requests.
- Draft issue/MR association changes, confirm migrations from other milestones, check current ownership before writing, and report partial or uncertain outcomes without automatic write retries.
- Show separate closed-issue, merged-MR and closed-unmerged-MR counts with loaded-data boundaries; navigate between milestones and existing MR details.
- Validate dates and strict mutation fields; retain action errors until an explicit successful refresh.

Requires Paseo 0.12.0 or later and a compatible Gongfeng OpenAPI v3 site. Native mobile, public SaaS accounts and all deployment variants remain unverified. No Agent Review dispatch, MR merging, pipeline triggering or new runtime dependencies.
