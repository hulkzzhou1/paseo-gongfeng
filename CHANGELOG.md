# Changelog

## 0.4.0 — 2026-10-28

- Add issue browsing, editing, state changes and comments.
- Add compact workbench tables, floating details, retained navigation state and configurable refresh.
- Replace the plugin HTTP MCP service with 35 project-scoped native Agent tools, off by default. Remove old saved Gongfeng MCP connections or create a new Agent.
- Prevent truncated milestone descriptions from overwriting full remote content; confirm draft navigation; retain loaded rows after transient pagination errors; unlock uncertain issue actions only after an explicit successful refresh.
- Require Paseo 0.14.0-beta.1 or later compatible versions and use its published SDK. Paseo 0.13.2 stable users should remain on plugin v0.3.0. No runtime dependencies or install build step.

Validation: TypeScript and 203 automated tests. Native mobile clients, public SaaS accounts and real MR writes remain incompletely verified.

## 0.3.0 — 2026-10-25

- Add an opt-in local HTTP MCP service exposing 27 explicit Gongfeng tools. UI RPC and MCP share the same business handlers, credentials and write queues.
- Use Paseo's existing agent.create hook to inject MCP only into new Agents in projects with a valid Gongfeng repository association on the active host/site. Preserve unrelated and same-name MCP settings; include associated worktrees and subdirectories, excluding ambiguous or unbound nested projects.
- Keep MCP off by default. Disabling, unloading or changing credentials stops old endpoints without rewriting existing Agent configuration. New Agents receive new definitions; provider HTTP MCP support is required.
- Add confirmed MR close/reopen in the overview and MCP, with identity/revision checks, strict mutation fields, readback and no automatic write retries. Refresh milestone-linked MR lists after changes.
- Keep the published Paseo SDK 0.12.0 baseline. Git installation now installs locked runtime MCP dependencies with npm ci --omit=dev --ignore-scripts.

New-hook real provider verification, native mobile and real MR lifecycle writes remain unverified. MCP call results may be sent to the calling Agent's model provider; the Gongfeng token stays server-side.

## 0.2.0 — 2026-10-23

- Add a Milestones tab with aggregated added-repository browsing, repository/state filters, loaded-content search and floating details.
- Create, edit, close, reopen and explicitly confirm milestone deletion; deleting a milestone preserves its issues and merge requests.
- Draft issue/MR association changes, confirm migrations from other milestones, check current ownership before writing, and report partial or uncertain outcomes without automatic write retries.
- Show separate closed-issue, merged-MR and closed-unmerged-MR counts with loaded-data boundaries; navigate between milestones and existing MR details.
- Validate dates and strict mutation fields; retain action errors until an explicit successful refresh.

Requires Paseo 0.12.0 or later and a compatible Gongfeng OpenAPI v3 site. Native mobile, public SaaS accounts and all deployment variants remain unverified. No Agent Review dispatch, MR merging, pipeline triggering or new runtime dependencies.
