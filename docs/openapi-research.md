# Paseo 工蜂工作台：OpenAPI 调研与最小方案

核查日期：2026-10-22。本文区分已确认约束、官方文档契约、本机实测与建议；功能建议不是实现授权。

实施后更新：任务 01 已实现、本地安装并通过带 Token 的真实 `/user` 请求，用户确认设置保存成功；深浅主题与手机布局按用户选择保留待验收。当前证据见 [账号连接验证记录](connection-validation.md)。下文保留实施前调研快照，其中「尚未实现／未配置」描述不代表当前状态；其他接口和仓库操作仍未验证。

## 结论与项目状态

- 已确认技术方向：插件服务端直接调用工蜂官方 OpenAPI；不使用工蜂 MCP，也不把 MCP 作为回退。
- 用户已明确可提供 Private Token，首期按服务端 Token 认证准备；尚未接收或配置凭据，其具体令牌类型、有效期与权限范围待配置时核实。
- 已确认交付范围：仅内部使用和分发；唯一推送目标为 `git@git.woa.com:hulkzzhou/paseo-gongfeng.git`，不规划公共社区发布。
- 当前只有项目文档、工程技能配置及已确认的首期实施规格，没有 manifest、依赖安装或插件代码；`main` 尚无提交。原先没有 remote，调研阶段按明确授权添加上述 `origin`，没有推送，也没有检查远端仓库是否已存在或 SSH 写权限。
- 调研时本项目及所检查祖先目录未发现适用的 `AGENTS.md`；后续按用户确认的草稿创建了本项目工程技能配置。规格及任务只使用本地 Markdown，不接入 TAPD。未修改 GitHub 插件、模型供应商项目、TAPD 工作台或共享配置。
- 本机 `paseo --version` 返回 `0.12.0`；模型供应商项目已安装的 `@getpaseo/plugin` 0.12 类型作为只读契约参考。daemon 版本与 pluginsEnabled 的前任报告未重新通过配置文件核实；本轮没有安装需求。
- 工蜂内网版官方文档已读取。未经认证的 `GET https://git.woa.com/api/v3/user` 返回 HTTP 401，证明入口可达，**不代表已经完成认证或业务读取联调**。没有为直连测试读取共享凭据，也没有进行任何远程写操作。
- 技术方向变更前做过 MCP 只读抽样，变更后已停止。那些返回结果不计入下列 OpenAPI 验证结论；不保存其私有仓库、用户或正文数据，也不依赖其参数扩展。

最小可行方向是“只读 MR 看板与 Review 上下文 → 用户主动派发 Agent”。已有官方接口足以支撑这一设计，但带凭据联调、准确审查待办语义和运行时兼容性仍是实现前置条件。完整流水线任务／日志和提到我不能先承诺支持。

## 参考插件许可证与复用边界

本地参考：`~/.paseo/plugins/github-integration/cd1bba5d-ac31-42f1-b179-877f359437e0/checkout/`。

核实 Git HEAD 为 `d6f7184a4db16fb1be930700d1e960872caf8c2e`，remote 为 `https://github.com/alysnnix/paseo-github-integration.git`；`package.json` 版本 1.0.1。根 `LICENSE` 是 MIT，版权人为 **Copyright (c) 2026 Gustavo Ambrozio**。证据：[该版本 LICENSE](https://github.com/alysnnix/paseo-github-integration/blob/d6f7184a4db16fb1be930700d1e960872caf8c2e/LICENSE)。本轮直接读取了本地许可证，未以仓库名、package 的 private 标记推断许可。

MIT 允许使用、修改与分发，不要求将衍生项目开源；复制代码或实质部分时须保留版权及许可声明。建议复制发生时，在本项目加入包含完整原 MIT 文本（含免责声明）的第三方许可文件，并列明来源版本和实际复用文件。内部 Git 分发及插件包也要携带该声明，不能把上游版权替换为本项目版权。本轮只形成方案，没有复制插件实现，故尚未添加第三方代码许可文件。后续引入依赖仍需核查其独立许可。

| 参考代码 | 可借鉴部分 | 必须调整／不直接移植的部分 |
| --- | --- | --- |
| `client/board/`、`client/detail/` | 看板、详情布局、加载与失败状态 | GitHub 专有标签、Issue/Discussion、批准／合并 UI；按工蜂数据重建精简页面 |
| `server/board/buckets.ts` | 多关系去重思想 | GitHub 查询语法；新键使用 host + projectId + mrId |
| `server/launch/project-index.ts` | SDK 获取项目、解析 SSH/HTTPS remote、匹配项目 | 多匹配不能静默取第一个；完整子组路径、主机别名、路径大小写须验证 |
| `server/launch/handler.ts` | workspace → agent 创建顺序及部分失败反馈 | GitHub 上下文、持久缓存；不能声称自动切到了 MR 源 SHA |
| `server/github/`、`shared/board.ts` | 只参考职责划分 | `gh`、GraphQL、GitHub 认证和字段契约不能作为工蜂实现 |

本地参考 checkout 已有两文件共四处 `Github` → `GitBranch` 图标替换，本轮只读确认未再修改。其 package 使用 0.8 beta SDK，查询硬编码 `state:open`，不能整库换名后当作 0.12 工蜂插件。上游文件链接：[查询](https://github.com/alysnnix/paseo-github-integration/blob/d6f7184a4db16fb1be930700d1e960872caf8c2e/server/board/pull-requests.ts)、[项目匹配](https://github.com/alysnnix/paseo-github-integration/blob/d6f7184a4db16fb1be930700d1e960872caf8c2e/server/launch/project-index.ts)、[派发](https://github.com/alysnnix/paseo-github-integration/blob/d6f7184a4db16fb1be930700d1e960872caf8c2e/server/launch/handler.ts)。

## OpenAPI 契约与能力矩阵

以下主要证据来自 **git.woa.com 的工蜂内网版文档**，不是 GitLab 文档或合作伙伴版推测。基址为 `https://git.woa.com/api/v3`；表中路径相对此基址，方法均为 GET。所有业务接口状态均为“已核对官方文档、未带凭据实测”。

| 需求 | 官方路径／参数 | 分页、权限与缺口 | 证据 |
| --- | --- | --- | --- |
| 当前用户 | `/user` | 用响应的 `id` 和 `username`，不能写死用户名；本轮无凭据返回 401 | [用户](https://git.woa.com/help/menu/api/users.html) |
| 仓库检索／详情 | `/projects`：`search`、`type=GIT`；`/projects/:id` | 列表默认每页 20、最大 100；搜索模糊匹配 path/name/description；项目详情至少 Guest，不等于有权查看代码 | [项目](https://git.woa.com/help/menu/api/projects.html) |
| 跨仓库“我创建／我参与评审” | `/dashboard/merge_requests`：`author_user_name` 或 `reviewer_user_name`，`state`，`sort` | `state=opened/merged/closed/reopened/all`，默认 opened；`page` 默认 1，`per_page` 默认 20、最大 100；响应示例按 `{project, merge_requests}` 分组。分组与分页总量语义需联调 | [MR Review](https://git.woa.com/help/menu/api/cr/mr_review.html) |
| 指定项目 MR | `/projects/:id/merge_requests`：`author_id`、`reviewer_id`、`assignee_id`、`iids[]`、状态及时间过滤 | `state` 不填为所有，不能传 dashboard 的 `all`；`page` 文档最大 100，`per_page` 最大 100；支持 `order_by` + `sort` | [MR](https://git.woa.com/help/menu/api/merge_requests.html) |
| MR 详情 | `/projects/:id/merge_request/:mrId`；或 `/projects/:id/merge_request/iid/:iid` | 注意单数 `merge_request`，`mrId` 与 `iid` 不可混用；示例含描述、源／目标项目与分支 | [MR](https://git.woa.com/help/menu/api/merge_requests.html) |
| Review 关系／状态 | `/projects/:id/merge_request/:mrId/review`（另有 iid 路径） | 示例有 `reviewers[].review_state`、规则及 owners。review 对象 id 不能覆盖 MR id；参与评审不等于仍待处理，状态映射和重置行为需核实 | [MR Review](https://git.woa.com/help/menu/api/cr/mr_review.html) |
| 代码差异 | `/projects/:id/merge_request/:mrId/changes` | 响应示例为 `files[]`，含 `diff`、重命名／删除标记、`is_too_large`、`is_collapse`；此文档未列单文件筛选、分页参数，不能照搬 MCP 的过滤参数 | [MR](https://git.woa.com/help/menu/api/merge_requests.html) |
| 讨论及行评论 | `/projects/:id/merge_requests/:mrId/notes` | 注意复数 `merge_requests`；每页 20、最大 100；`system`、`sort=created_asc/created_desc`、`resolve_states`；示例包含嵌套 `comments`，其完整性需核实 | [评论](https://git.woa.com/help/menu/api/comments.html) |
| MR 提交 | `/projects/:id/merge_request/:mrId/commits` | 文档说最多 120 个提交，同时提供 page/per_page，默认和最大 per_page 都为 120；总量是否可翻页超过 120 待验证，不能宣称完整历史 | [MR](https://git.woa.com/help/menu/api/merge_requests.html) |
| CI 检查摘要 | `/projects/:id/commits/:ref/status`；独立列表为同路径 `statuses` | 组合接口明确要求 Developer 及以上；ref 可 SHA/分支/tag，支持 `target_branch`、分页，最大每页 100；示例含 state/block/statuses/sha/total_count 与检查链接 | [提交检测](https://git.woa.com/help/menu/api/commit_check.html) |
| TAPD 关联 | `/projects/:id/tapd_workitems?type=mr&iid=…` | 使用项目内 iid；仅表示已绑定工作项，不等于完整需求详情／反向搜索能力；文档未列分页或最小角色 | [TAPD](https://git.woa.com/help/menu/api/tapd.html) |
| 提到我 | 未确认专门接口或过滤参数 | reviewer、assignee、订阅都不等于 mention；不以全量扫描评论冒充完整提及看板 | 上述 MR、MR Review、评论文档的有限核查 |
| 流水线任务／日志 | 未确认 | [CI/CD 页面](https://git.woa.com/help/menu/api/ci.html)仅记录修改 CI 配置；提交检查的 detail/target_url 不是任务日志 API，首期建议外链查看 |

已读取通用文档的细节：[使用前必读](https://git.woa.com/help/menu/api/api_use.html)。

- 普通列表 `page` 从 1 开始，默认 `per_page=20`、最大 100；优先使用 `X-Next-Page`，同时读取 `X-Total`、`X-Total-Pages` 等。各端点特殊限制优先，不能把当前页当作全量看板。
- 项目全路径须作为单个路径段编码，包含子组时 `/` 编为 `%2F`；日期参数用 URL 编码保留 `+`；`iids[]` 采用文档给出的数组参数形式。
- MR 状态可能出现 `reopened`，Review 文档还提及 `locked`；UI 应保留未知状态。“开放”是否包含 reopened 需明确，不能无提示漏掉。
- MR id、iid、review id、项目 id 分开存储；API 身份与浏览器地址不是同一字段。不能直接采用 GitLab v4 路径或响应类型。
- 差异被截断／折叠时标记上下文不完整，提供原站入口，不让 Agent 得出“完整审查通过”。MR 源分支可能继续更新，Review 上下文应带获取时间和可验证 SHA；详情示例未保证 source SHA 字段，需联调确认获取方式。

限流来自 [内网 API 限流规则](https://git.woa.com/help/menu/limiter/web_api.html)，页面更新时间 2026-09-24：默认账号 50 万请求／半小时（文档表述约 278 QPS），dashboard MR 为账号 5 QPS，projects 为账号 10 QPS，项目 notes 为账号 20 QPS，MR review 为账号＋项目 5 QPS。它们是上限，不是推荐请求速率。建议按页按需读取、合并重复请求、短时内存缓存，先不建轮询或磁盘索引。

错误处理依据同一通用文档：400 参数错误；401 认证失败；403 权限或项目设置限制；404 可能是不存在或无访问权；423 账号锁定；429 限流；500 服务端错误。建议 401/403/404 不盲重试，429 遵守实际 `Retry-After`（是否提供待联调），否则有界退避；网络／5xx 有限重试。单项目或 CI 失败显示局部不可用，不能清空其他成功数据或显示“无 MR”。本轮未故意制造限流、无权限或服务端错误。

## 服务端认证方案

官方内网文档确认三种机制：[Private_Key](https://git.woa.com/help/menu/api/api_use.html)、[个人访问令牌 PAT](https://git.woa.com/help/menu/instruction/product-docs/profile.html#个人访问令牌（personal-access-token）)、[OAuth2](https://git.woa.com/help/menu/solutions/oauth2.html)。GitHub 登录和 Git SSH key 不能替代 OpenAPI 凭据。

**首期身份已确认：每个 daemon 使用一个个人账号的 Token；建议配置可过期 PAT。** 文档列 PAT 范围为 api、read repository、write repository；看板使用 api，不申请 Git 写范围。服务端以 `PRIVATE-TOKEN` 请求头调用工蜂；Token 不放查询串或进程参数，也不由客户端直接用于工蜂请求。设置时允许通过宿主受保护的连接提交 Token，提交后清除输入，不回显或持久化到客户端。文档没有给出 `read_api` 范围，不能把 api 令牌称为服务端强制只读；它可能承载账号已有的写权限。插件必须只暴露确定的 GET 业务端点，没有透传任意方法／URL 的 RPC。最小项目角色尚未逐接口验证，CI 组合接口的 Developer 要求应单独提示，不能为了显示摘要默默升权。

已确认由插件设置页提供 Token 输入、验证与更换。建议验证成功后由服务端写入插件专属秘密文件：目录 0700、文件 0600，位于仓库外；更换失败保留原有可用配置。状态查询仅返回连接状态与当前账号，不返回 Token；普通共享设置不保存 Token。文件存储方式仍是技术建议，尚未创建文件、读取现有秘密或配置环境。若将来采用环境注入，需防止 daemon 把令牌继承给 Agent 子进程；不能把广域 daemon 环境视为天然隔离的秘密存储。

**团队分发备选仍是 OpenAPI OAuth2，而非 MCP。** 工蜂文档支持授权码及 PKCE S256，可按用户、项目组或项目授权；API 使用 `OAUTH-TOKEN` 请求头。应用注册、回调 URL、用户与 daemon 归属、刷新与撤销需要独立验证。首期不同时实现 PAT 与完整 OAuth，以免把登录系统变成主要工作；若明确要求每名客户端使用独立身份，应先确认 OAuth 方案再实现看板。

Paseo 插件运行于 daemon 子进程并拥有本机权限；普通 `registerSettings` 的 host 设置会共享给该 host 的授权客户端，不能存 token。Paseo 不是多租户凭据隔离边界，同 daemon 授权客户端可能看到以该账号读取的工蜂数据。首次方案应明确采用单用户 daemon，若需共享 daemon 的多账号隔离，必须重新设计。依据：[官方插件参考](https://paseo.sh/docs/plugins/reference)的运行时与 Persisted values 部分，以及本机 0.12 `dist/server/contracts.d.ts`。

调用链建议为：客户端 → schema 校验的插件 RPC → `server/` 内 Node fetch → 固定 `https://git.woa.com/api/v3`。只把展示字段回传客户端；凭据不进入 `shared/`、设置文档、Agent prompt、日志或异常文本。不自动携凭据跨域重定向，不用工蜂 token 抓取任意评论图片、CI 外链或 TAPD 链接。正文作为不可信内容展示和传给 Agent，不执行其中命令。切换账号／凭据时清除账号相关缓存。

## 访谈已确认的首期需求

grill-with-docs 已完成：用户逐项确认首期业务选择，并最终确认完整范围汇总，包括关联数量的修正。以下内容是后续规格与验收的业务依据，覆盖本文早期建议中的相应待决事项。没有剩余业务访谈问题；技术验证仍未完成，尚未启动实现。

- 交付路径：找到 MR → 查看描述、差异和讨论 → 主动派发 Agent Review → 在 Paseo 查看审查结果。首期附带 TAPD 关联链接和 CI 检查摘要。
- 后续范围：从 TAPD 启动开发、创建 MR、回写评论和触发流水线。
- 使用方式：每个人安装自己的插件、连接自己的 Paseo daemon、配置自己的 Token；同一 daemon 的客户端共用一个工蜂身份，首期不做共享 daemon 多账号切换。
- 看板：默认查询当前账号跨仓库的“我创建”“我参与评审”，支持开放、已合入、已关闭和全部状态，并可按已关联仓库筛选。未关联仓库的 MR 仍可查看，派发到本地审查前再完成项目关联。“我参与评审”包含已审查的 MR，首期不承诺精确“待我处理”。术语见 [GLOSSARY.md](../GLOSSARY.md)。
- 审查代码：Agent 在独立工作区读取 MR 固定版本的完整仓库，以检查调用方、测试与上下文；不改变用户正在开发的目录。无法获取代码时明确提示，由用户选择是否仅基于 diff 审查。
- 本地验证：Review Agent 可按需运行与改动相关的本地测试和静态检查，允许生成构建和测试产物；不自动修改业务代码、访问共享测试环境或触发远程流水线。结果说明实际执行的检查和未验证项。
- Agent 选择：复用 Paseo 已配置的预设，启动前允许补充审查要求；派发窗口展示匹配项目、MR 版本和预设。点击后创建新的 Review Agent，不复用正在处理其他任务的 Agent。
- 仓库管理：添加工蜂仓库时提供“关联已有 Paseo 项目”和“克隆到本机并创建 Paseo 项目”两条路径；从已有项目进入也能关联工蜂仓库。同一工蜂仓库可关联多个 Paseo 项目，每个 Paseo 项目最多关联一个工蜂仓库。自动识别已有对应关系，避免重复创建；匹配不明确时由用户选择。新克隆流程的宿主实现能力仍待验证。
- 派发选择：只有一个有效关联项目时自动选中；有多个时由用户在派发窗口选择一个。每次派发只启动一次 Review，不向所有关联项目批量派发。
- 解除关联：界面使用“解除关联”，仅移除插件内的对应关系，保留本地代码、Paseo 项目、工作区及历史 Agent；资源删除交由 Paseo 原有功能管理。
- Token 配置：插件设置页支持输入、验证和更换 Private Token，服务端保存；页面仅显示连接状态和当前账号，不回显 Token，也不保存到客户端缓存或普通共享设置。
- 关联约束的原因：用户一般将一个 Paseo 项目作为一个仓库使用，因此允许同仓库的多份本地项目，不把不同仓库聚合进一个项目。多个 Git remote 不自动构成多条业务关联；fork 的源代码获取需独立验证。

## 仓库关联的宿主能力核查

依据本机已安装 server/client/protocol 0.12.0 的只读源码核查：

- Project 按等价 `rootPath` 登记去重，`projectId` 独立生成。相同远程仓库在不同目录的两份 clone 可以是不同项目，即使 `projectKey` 相同。证据：已安装 `@getpaseo/server/dist/server/server/workspace-registry.js` 的 `getOrCreateActiveByRoot`（276 行起）。
- 一个 Project 只有一个根目录和主身份；不是原生多仓库容器。Git common dir 用于识别主仓库及 worktree 关系，不是 Project 唯一键。`projectKey` 主要来自 origin，子目录附加 subdir；工蜂路径保留大小写。证据：同包 `utils/checkout-git.js`、`server/project-key.js`。
- 插件注入的 `PaseoProjectActions` 仅有 `list`、`subscribe`，没有 `projects.create()`；`workspaces.create()` 可用。底层 DaemonClient 的 `addProject` 不能当作插件注入 SDK。证据：已安装 `@getpaseo/client/dist/index.d.ts:127`、`daemon-client.d.ts:778`。
- `paseo project create <path>` 登记已有目录，不负责 clone；因此“克隆并创建项目”需要分开处理，插件侧项目登记方式仍待验证，不能宣称 SDK 已覆盖全部流程。未实际执行 clone 或登记。
- GitHub 插件的项目索引是按 TTL 重建的匹配缓存，并非用户持久绑定；匹配多个 remote 时可能取首个，还会将路径小写，不可照搬。证据：参考插件 `server/launch/project-index.ts:149`。

关联设计：以工蜂实例与工蜂项目 ID 标识远程仓库，保存其与当前 daemon 的 Paseo projectId 的关联记录；同一仓库可有多条关联，同一 daemon 内每个 Paseo projectId 最多关联一个工蜂仓库。两种添加入口共用同一份关系。自动匹配只提供候选，派发前核验项目及 checkout，失效后提示重新关联。一个有效候选自动选中，多个候选由用户选择，每次只派发到一个项目。改变已有项目的仓库归属需要明确更换关联，不能因新匹配结果而静默覆盖。

## 最小实现建议（范围以访谈确认项为准，实现待授权）

采用 Paseo 常规 `index.client.tsx`、`index.server.ts`、`client/`、`server/`、`shared/` 结构；提供看板、详情及仓库关联管理入口。服务端一个工蜂请求入口处理认证、分页和错误，业务按 MR 查询、仓库关联与派发组织；用现有 SDK、Zod、TanStack Query 及 Node fetch，不加通用平台框架。文档依据：[快速开始](https://paseo.sh/docs/plugins)、[插件参考](https://paseo.sh/docs/plugins/reference)。不执行脚手架或安装。

1. **先完成直连契约验证。** 在专属服务端认证已配置后，GET `/user`，再选用户授权的一个仓库做最小分页样本。只记录字段类型、状态与计数，不落私有正文。明确 PAT api 范围和实际角色分别能读哪些端点。
2. **只读看板。** 两个关系建议命名为“我创建”“我参与评审”，每个关系独立分页，按 MR 身份去重。提供开放／已合入／已关闭／全部过滤，手动刷新，显示加载、部分失败和下一页；准确处理 reopened。先不宣称“待我审查”或“提到我”。
3. **详情和 Review 上下文。** 读取描述、分支、差异、评论及 Review 状态。CI 仅检查摘要和来源链接；TAPD 仅已绑定工作项与经验证的原站链接，不复制 TAPD 工作台的业务实现。大 diff、分页和缺失 SHA 均明确标记。
4. **仓库关联与用户主动派发。** 保存用户确认的仓库与 Paseo 项目关联，支持关联已有项目或克隆后注册新项目；具体 SDK 契约待核实。派发时展示关联项目、固定 MR 版本及用户选择的现有 Agent 预设，允许补充审查要求，再创建独立工作区与新的 Review Agent。创建失败返回已创建资源信息，重试不能默默制造重复 workspace。此处只设计，未执行业务派发。
5. **本机验收后内部交付。** 使用实际 0.12 类型和运行时可用组件／图标；检查深浅主题、compact/mobile、RPC 错误状态。内部可用本地路径或私有 Git 直装，无需公共注册表；具体 SSH 安装流程待验证。唯一 Git 推送目标保持指定 origin。[私有 Git 分发依据](https://paseo.sh/docs/plugins/publishing)。

项目匹配先读取用户确认的关联并核验其仍有效；未关联时根据宿主 projectKey 和完整 remote 主机、路径提出候选，由用户确认。支持 SSH scp、ssh://、https:// 与子组，不靠目录同名猜测。多匹配要求选择，源仓库与目标仓库不同的 fork MR 要分别处理。不要默认强制小写路径或把不同主机别名视作同一仓库。

本地 GitHub `server/launch/handler.ts` 和 TAPD `client/workbench/DispatchModal.tsx` 展示了相同 workspace/agent SDK 流程，仅作为可行性证据。GitHub 示例新建 worktree 并不保证处于 MR 源分支。按已确认需求，Review 默认基于已确认源项目和 SHA 创建隔离 checkout，不能在用户工作目录执行 reset/checkout；获取代码失败时由用户选择是否降级为 diff 审查。Agent 默认产出审查结论，不自动评论、批准、合并、推送或触发流水线。

后续验证应覆盖：ID/iid 路由、分页边界与状态、401/403/404/429、非 JSON 响应、差异不完整、fork 和多项目匹配、创建 workspace 后 Agent 失败。使用脱敏固定数据；运行生产 typecheck、针对这些风险的少量测试及真实 UI 检查。不是只测字段改名或复制实现的测试。本轮仅文档变更，无可运行插件，因此没有运行插件测试或 typecheck。

## 已确认边界与技术前置条件

| 事项 | 已确认选择 | 影响 |
| --- | --- | --- |
| 首期业务范围 | 已确认：只读 MR + Review 上下文 + 主动派发 | TAPD 开发到 MR 创建、远程评论及流水线触发留到后续 |
| 审查关系 | 已确认：“我参与评审”包含已审查 MR | 精确“待我处理”不列入首期验收 |
| 身份方式 | 已确认：每人独立 daemon + Token；具体令牌配置待核实 | api 不是已证实的只读 scope；首期不做共享 daemon 多账号切换 |
| CI 范围 | 已确认：检查摘要及原站链接 | 完整任务／日志不列入首期范围 |
| 本地执行 | 已确认：独立工作区审查固定版本完整仓库，可按需运行本地相关测试和静态检查 | 获取代码失败时用户选择是否仅审 diff；源 SHA 与 fork 检出流程待验证 |

需求访谈已结束，[首期实施规格](../.scratch/gongfeng-workbench/spec.md)的业务范围与测试边界均已确认，并以 ready-for-agent 状态发布到本地任务跟踪目录。实现前置验证包括带 Token 的 OpenAPI 契约、插件内登记新项目的接入方式、固定 SHA 与 fork 的检出流程；这些是待验证的工程事实，不应重复询问已确认的业务范围。凭据通过服务端安全渠道配置，不在对话发送。当前不能把“官方文档支持”升级为“本账号直连已通过”，本次需求确认也不表示插件已经实现或发布。

## 复核记录

已核对：许可证原文和固定版本；本地 SDK 0.12 类型；官方 Paseo 当前文档；工蜂内网 API、MR/Review/评论/TAPD/检查/认证/限流文档；无凭据 `/user` 的 401；本项目 origin 与文件状态。网页查询工具无法直接读取部分 Markdown／内网页面时，使用本机只读 HTTPS 抓取官方页面核对，没有保存网页整包或示例令牌。

未核对：带凭据 OpenAPI 成功响应和响应头、每项最小角色、账号锁定及限流真实行为、OAuth 注册与刷新、远端仓库 SSH 权限、0.12 插件实际加载、UI 和 Agent 派发。实际私有返回未写入本项目；没有修改其他项目，也没有发布行为。
