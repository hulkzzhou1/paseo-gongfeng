# Gongfeng

Manage Gongfeng repositories and merge requests in Paseo. Browse accessible merge requests, filter by author or reviewer relationship, state and linked repository, and search titles, repository paths, numbers and author accounts across loaded pages. The interface is currently in Simplified Chinese.

Open a merge request in a floating drawer to view its description, line-numbered changes, discussion, reviewers, related TAPD items and commit check summaries. Discussion and descriptions support common Markdown and restricted HTML, including image badges. Search and discussion are paginated; the interface shows when more results remain.

## Milestones

Browse milestones across added repositories, filter by repository and state, and search loaded titles and descriptions. Floating details show paginated issues and merge requests with separate closed-issue and merged-MR counts. Create, edit, close, reopen or explicitly confirm deletion; edit associations as a draft, confirming before moving items from another milestone. These actions write to the configured Gongfeng API only after saving or confirming. Each save may partially succeed; check the refreshed state before retrying an uncertain outcome. Deleting a milestone preserves its issues and merge requests. Statistics and search cover loaded data.

## Setup

Requires Paseo 0.12.0 or later, a Gongfeng site compatible with the OpenAPI v3 endpoints used by this plugin, and network access from the daemon to that site. Set the HTTPS site root and a Private Token in the plugin's connection settings. The daemon uses one active Gongfeng account, shared by its authorized clients. Credentials and repository associations are retained separately for each site. Compatibility with every Gongfeng deployment, the public SaaS account flow and native mobile clients has not been fully verified.

Add accessible repositories, then associate them with existing local Paseo projects. One repository can map to multiple projects; each project maps to at most one repository. Cloning and registering a new project requires local Git, the Paseo CLI, and separately configured noninteractive SSH access to the site host on the standard SSH port. The target parent directory must exist. Submodules and LFS objects are not automatically downloaded. The plugin does not install additional software.

## Access and actions

The daemon sends the token only to the configured Gongfeng API and stores it in a private server-side file. It does not return it to clients or use it for Git, images or model prompts. API responses, repository information and review data are displayed to connected clients. External links and remote images can contact their own destinations from the client without the API token. The plugin does not send content to agent model providers.

Repository management reads local project information and Git remotes. An explicit clone action creates a new local directory, runs Git over SSH, registers a Paseo project and saves its association. Removing an association preserves local code, projects and existing workspaces.

You can edit ordinary and required reviewers, and submit an approval, request changes, rejection or comment when the current account is a reviewer. These actions write to Gongfeng only after saving or confirming in the interface. Gongfeng enforces account permissions and required-reviewer rules. Writes are not automatically retried; partial or unknown outcomes require checking the actual state. The final version check and the write are not an atomic operation. Real business merge-request writes have not been end-to-end verified.

The plugin does not launch Agent Review, merge requests or trigger pipelines. CI shows commit check summaries rather than full pipeline logs. TAPD links are generated only for recognized deployments; other sites retain the returned association data and report that a link is unavailable.
