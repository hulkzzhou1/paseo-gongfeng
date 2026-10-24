# Gongfeng

Manage Gongfeng repositories and merge requests in Paseo. Browse accessible merge requests, filter by author or reviewer relationship, state and linked repository, and search titles, repository paths, numbers and author accounts across loaded pages. The interface is currently in Simplified Chinese.

Open a merge request in a floating drawer to view its description, line-numbered changes, discussion, reviewers, related TAPD items and commit check summaries. Discussion and descriptions support common Markdown and restricted HTML, including image badges. Search and discussion are paginated; the interface shows when more results remain.

## Milestones

Browse milestones across added repositories, filter by repository and state, and search loaded titles and descriptions. Floating details show paginated issues and merge requests with separate closed-issue and merged-MR counts. Create, edit, close, reopen or explicitly confirm deletion; edit associations as a draft, confirming before moving items from another milestone. These actions write to the configured Gongfeng API only after saving or confirming. Each save may partially succeed; check the refreshed state before retrying an uncertain outcome. Deleting a milestone preserves its issues and merge requests. Statistics and search cover loaded data.

## Setup

Requires Paseo 0.12.0+, a Gongfeng site compatible with the OpenAPI v3 endpoints used by this plugin, and network access from the daemon to that site. Set the HTTPS site root and a Private Token in the plugin's connection settings. The daemon uses one active Gongfeng account, shared by its authorized clients. Credentials and repository associations are retained separately for each site. Compatibility with every Gongfeng deployment, the public SaaS account flow and native mobile clients has not been fully verified.

Add accessible repositories, then associate them with existing local Paseo projects. One repository can map to multiple projects; each project maps to at most one repository. Cloning and registering a new project requires local Git, the Paseo CLI, and separately configured noninteractive SSH access to the site host on the standard SSH port. The target parent directory must exist. Submodules and LFS objects are not automatically downloaded. Git installation/update runs locked `npm ci --omit=dev --ignore-scripts` for the MCP JavaScript dependencies. It does not install Git, the Paseo CLI or provider executables.

## Access and actions

The daemon sends the token only to the configured Gongfeng API and stores it in a private server-side file. It does not return it to clients or use it for Git, images or model prompts. API responses, repository information and review data are displayed to connected clients. External links and remote images can contact their own destinations from the client without the API token. With MCP disabled, the plugin does not send content to agent model providers. When enabled, tool results are returned to the calling Agent and may be processed by its model provider.

Repository management reads local project information and Git remotes. An explicit clone action creates a new local directory, runs Git over SSH, registers a Paseo project and saves its association. Removing an association preserves local code, projects and existing workspaces.

You can edit ordinary and required reviewers, and submit an approval, request changes, rejection or comment when the current account is a reviewer. These actions write to Gongfeng only after saving or confirming in the interface. Gongfeng enforces account permissions and required-reviewer rules. Writes are not automatically retried; partial or unknown outcomes require checking the actual state. The final version check and the write are not an atomic operation. Real business merge-request writes have not been end-to-end verified.

After confirmation, you can close an open MR or reopen a closed MR. Reopening may reset review rules from the latest OWNERS configuration. Merged, locked and unknown states are excluded. Gongfeng enforces permissions; state changes use a fresh revision check and readback, with no automatic write retries. Real lifecycle writes have not been verified.

The plugin does not launch Agent Review, merge requests or trigger pipelines. CI shows commit check summaries rather than full pipeline logs. TAPD links are generated only for recognized deployments; other sites retain the returned association data and report that a link is unavailable.

## Optional MCP access

The connection settings include a host-scoped MCP switch, off by default. When enabled and configured, the existing agent.create hook adds a local HTTP MCP connection only to new Agents in Paseo projects with a valid Gongfeng repository association on the current host and site. Associated worktrees and subdirectories are included. Unbound, invalid or ambiguous project ownership does not receive the connection. Removing an association affects future injection, not saved Agent configuration. The provider must support HTTP MCP. Existing Agent settings and other MCP connections are preserved; an existing gongfeng-workbench connection is not overwritten. Explicit tools cover repositories, local project associations, MR reads and reviews, MR close/reopen and milestone management. MCP write calls require confirm:true, and callers must obtain user authorization; this flag does not itself show a human approval dialog. Provider tool permissions govern Agent calls.

Disabling or uninstalling stops the endpoint but does not remove or update saved Agent connections. Reloading the plugin or changing credentials invalidates old endpoints; create a new Agent to receive the new connection. Resuming or refreshing an existing Agent does not run this creation hook. No existing Agent is automatically restarted. This uses Paseo's existing hooks and does not require Hosted MCP management.

Providers receive a local service definition with temporary authentication, never the Gongfeng token. The token is not injected into Agent configuration, prompts or environment. Tool results can be processed by the calling Agent's model provider. Real provider verification of this hook path and native mobile remain pending.
