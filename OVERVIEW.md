# Gongfeng

Manage Gongfeng repositories, merge requests, issues and milestones in Paseo. Browse accessible merge requests, filter by author or reviewer relationship, state and linked repository, and search titles, repository paths, numbers and author accounts across loaded pages. The interface is currently in Simplified Chinese.

Open a merge request in a floating drawer to view its description, line-numbered changes, discussion, reviewers, related TAPD items and commit check summaries. Discussion and descriptions support common Markdown and restricted HTML, including image badges. Search and discussion are paginated; the interface shows when more results remain.

## Milestones

Browse milestones across added repositories, filter by repository and state, and search loaded titles and descriptions. Floating details show paginated issues and merge requests with separate closed-issue and merged-MR counts. Create, edit, close, reopen or explicitly confirm deletion; edit associations as a draft, confirming before moving items from another milestone. These actions write to the configured Gongfeng API only after saving or confirming. Each save may partially succeed; check the refreshed state before retrying an uncertain outcome. Deleting a milestone preserves its issues and merge requests. Statistics and search cover loaded data.

## Issues

Browse added repositories together or filter one repository, state, author/assignee relationship, keyword or local issue number. Results load progressively with per-repository failures; sorting covers fetched data. Floating details render Markdown safely. Create/edit issues, close/reopen, select up to ten repository members and existing labels, change priority and resolution, associate a same-repository milestone, and post or edit your own non-system comments. Confidential issues are marked; making one public requires separate confirmation. Writes check the current account and revision, read back the result and never retry automatically. The final check and write are not atomic. Issue/comment deletion has no verified official API contract and is not offered; nested replies, attachments and repository-label administration are excluded. Member/new-label verification scans at most 2000 candidates and fails closed beyond that limit.

## Setup

Requires Paseo main with defineAgentTool (deployed commit 6b7d49f0, version label 0.13.2; the version number alone is insufficient), a Gongfeng site compatible with the OpenAPI v3 endpoints used by this plugin, and network access from the daemon to that site. Set the HTTPS site root and a Private Token in the plugin's connection settings. The daemon uses one active Gongfeng account, shared by its authorized clients. Credentials and repository associations are retained separately for each site. Compatibility with every Gongfeng deployment, the public SaaS account flow and native mobile clients has not been fully verified.

Add accessible repositories, then associate them with existing local Paseo projects. One repository can map to multiple projects; each project maps to at most one repository. Cloning and registering a new project requires local Git, the Paseo CLI, and separately configured noninteractive SSH access to the site host on the standard SSH port. The target parent directory must exist. Submodules and LFS objects are not automatically downloaded. The plugin has no standalone MCP service or runtime dependencies. It does not install Git, the Paseo CLI or provider executables.

## Access and actions

The daemon sends the token only to the configured Gongfeng API and stores it in a private server-side file. It does not return it to clients or use it for Git, images or model prompts. API responses, repository information and review data are displayed to connected clients. External links and remote images can contact their own destinations from the client without the API token. With Agent tools disabled, the plugin does not send content to agent model providers. When enabled, tool results are returned to the calling Agent and may be processed by its model provider.

Repository management reads local project information and Git remotes. An explicit clone action creates a new local directory, runs Git over SSH, registers a Paseo project and saves its association. Removing an association preserves local code, projects and existing workspaces.

You can edit ordinary and required reviewers, and submit an approval, request changes, rejection or comment when the current account is a reviewer. These actions write to Gongfeng only after saving or confirming in the interface. Gongfeng enforces account permissions and required-reviewer rules. Writes are not automatically retried; partial or unknown outcomes require checking the actual state. The final version check and the write are not an atomic operation. Real business merge-request writes have not been end-to-end verified.

After confirmation, you can close an open MR or reopen a closed MR. Reopening may reset review rules from the latest OWNERS configuration. Merged, locked and unknown states are excluded. Gongfeng enforces permissions; state changes use a fresh revision check and readback, with no automatic write retries. Real lifecycle writes have not been verified.

The plugin does not launch Agent Review, merge requests or trigger pipelines. CI shows commit check summaries rather than full pipeline logs. TAPD links are generated only for recognized deployments; other sites retain the returned association data and report that a link is unavailable.

## Optional Agent tools (unpublished)

The host-scoped Agent tools switch is off by default and preserves the previous switch preference. The agent.session_open hook attaches 35 gongfeng_-prefixed tools only to projects with valid Gongfeng associations on the current host and site, including their worktrees and subdirectories. Unassociated, stale, ambiguous and history-only sessions receive no tools. Calls recheck association and connection, share UI business handlers and write queues, and require explicit authorization and confirm:true for writes. The flag itself does not show an approval dialog.

Paseo owns tool delivery. This plugin no longer opens an HTTP listener or persists Agent MCP connections. Reopen an Agent session after enabling tools or changing connections; no Agent is proactively restarted. Disabling, stopping, credential rotation or invalid association rejects old calls. Previously saved gongfeng-workbench MCP entries are not rewritten: remove them manually or create a new Agent.

Tokens stay in the plugin and never enter tool schemas, outputs or Agent configuration. Results may be processed by the calling model provider. Canceled or uncertain writes must be read back before retrying. This migration is local only: no release or community submission, model call or native mobile acceptance.

## Browsing and refresh

The desktop workbench uses compact tables and narrow screens use lists. Switching modules retains filters, loaded pages and scroll position in the current client. MR changes and discussion load when their section is opened. List freshness is 30 seconds, detail freshness 60 seconds, and candidate freshness 10 minutes; remote content is cached only in client memory.

A host-scoped automatic refresh setting defaults to off and offers 30, 60, 120 or 300 seconds. Only visible sections poll; background clients pause and revalidate stale data on return. Loading multiple pages pauses automatic refresh with a notice; manual refresh returns to page one. Background updates retain content and the last successful timestamp. Authorization loss hides old data. Leaving an unsaved editor prompts to continue or discard; account/site changes clear the old identity's drafts. Existing revision and uncertain-write safeguards remain in place.
