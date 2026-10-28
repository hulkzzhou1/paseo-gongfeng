# 工蜂 MCP：主线使用创建 Hook

## 分支与契约

用户要求将之前依赖fork的Hosted MCP统一管理实现保留到本地 `dev`（`f68f482`），本地 `main` 保留现有业务能力，改用已发布的创建Hook。没有修改Paseo仓库、推送远程分支或发布。

`server.before("agent.create")` 可修改 `request.config.mcpServers`；`agent.session_open` 仅可修改env，不能注入MCP。主线不调用 `registerMcpServer`、不要求 `pluginMcpServers`、不进入平台Hosted MCP目录，也不自动增删／刷新已有Agent。依据：[本地公开契约](/data/home/hulkzzhou/workspaces/paseo/public-docs/plugins/reference.md:656)、[官方创建Hook文档](https://paseo.sh/docs/plugins/reference.md#change-configuration-and-inject-an-mcp-server)、[session_open限制](https://paseo.sh/docs/plugins/reference.md#before-hooks)。

Paseo的Hosted MCP PR补齐的是统一查看、增删改、启停与插件生命周期管理，不能表述为“首次允许插件向Agent提供MCP”。工蜂主线不再技术依赖它。用户随后明确授权发布0.3.0并提交社区，取代此前暂缓安排；发布证据见 community-registry-submission.md。

## 设置和生命周期

- “向 Agent 提供工蜂 MCP”沿用host级 `mcp` version1设置，默认关闭。开启、连接已配置且Agent工作目录属于当前host／站点的有效仓库关联项目时，创建Hook在 `config.mcpServers["gongfeng-workbench"]` 补入本地HTTP连接；provider需支持该配置。未配置／关闭时不注入。
- 项目边界复用插件关联存储与正式SDK，分页列工作区以识别worktree；实际路径核对支持符号链接和子目录。取最具体且唯一的项目归属，避免未关联嵌套项目继承父项目权限；未关联、关联失效、无访问权限、SDK不可用或归属歧义均不注入。只验证候选项目的仓库，不因仅有匹配remote就注入。关联解除不修改之前已保存的Agent配置。
- 保留Agent已有的provider、cwd、模型、选项、环境和其他MCP；同名连接保留，不覆盖。Hook借用当前host正式SDK上下文供本地项目关联，不读取私有项目注册文件。
- 关闭、配置轮换、插件重载／停用／卸载会关闭旧监听及连接。已创建Agent保存的连接不会被删除或改写；旧配置可能指向已失效端点，需要新建Agent或通过宿主支持的方式手动配置。恢复／刷新已有Agent不会再次执行创建Hook。
- 端点为插件内绑定127.0.0.1随机端口的标准Streamable HTTP MCP，临时Bearer认证和Host／Origin检查不变。Bearer属于本地服务认证；工蜂Token仍只保存在插件服务端，不进入Agent配置、提示词、环境或工具结果。
- UI继续使用RPC，MCP显式调用同一批业务处理、身份／版本校验和写队列。写工具仍需用户授权及 `confirm:true`；关闭服务不能撤销已送达工蜂的写请求，结果未知应回读，不自动重试。

## 依赖和本机接入

开发依赖恢复为官方 `@getpaseo/plugin@0.12.0` 及官方传递依赖；manifest为 `>=0.12.0`，无fork资产URL或本机包路径。运行时 `@modelcontextprotocol/sdk@1.32.2` 不变，Git build继续锁定 `npm ci --omit=dev --ignore-scripts`。HTTP MCP支持最终取决于provider，不能只按Paseo版本号保证所有provider兼容。

先类型检查、重载本插件、检查running；保留原有开关和工蜂凭据，不重启daemon或其他Agent。开启后只对之后新建Agent生效，不应期待平台Hosted MCP页出现工蜂条目。27个工具及业务RPC没有减少。

## 工具矩阵

| 工具 | 性质 | 原业务契约／结果 |
| --- | --- | --- |
| connection_status | 只读 | connection.status；当前站点／账号，不含凭据 |
| list_repositories | 本地只读 | repositories.managed；仅已添加仓库 |
| search_repositories | 只读 | repositories.search；分页候选 |
| add_repository | 本地写 | repositories.add；验证访问并加入列表 |
| list_repository_bindings | 只读 | repositories.bindings；当前host项目、匹配和关系状态 |
| bind_repository | 本地写 | repositories.bind；替换需要replaceRepositoryId |
| unbind_repository | 本地写 | repositories.unbind；保留代码／项目 |
| clone_repository | 本地写及SSH读取 | repositories.clone；新目录、登记及关联，保留部分结果 |
| list_clone_operations | 本地只读 | repositories.clones；操作历史 |
| list_merge_requests | 只读 | board.page；关系／状态／仓库及已扫描搜索范围 |
| get_merge_request | 只读 | mr.detail；使用全局mrId |
| get_merge_request_changes | 只读 | mr.changes；固定版本观察及不完整标记 |
| get_merge_request_notes | 只读 | mr.notes；分页和嵌套限制 |
| get_merge_request_review | 只读 | mr.review；规则、意见及revision |
| search_reviewers | 只读 | reviewers.search；项目成员候选 |
| save_reviewers | 远程写 | reviewers.save；revision，部分成功不自动回滚 |
| change_merge_request_state | 远程写 | mr.state.change；使用全局mrId和详情stateRevision作为revision，close／reopen，confirm:true；重开可能重置OWNERS规则 |
| submit_review | 远程写 | review.submit；revision、sourceSha、当前账号须是评审人 |
| get_merge_request_tapd | 只读 | mr.tapd；关联摘要，未知部署可能无链接 |
| get_merge_request_checks | 只读 | mr.ci；核对sourceProjectId／sourceSha／targetBranch |
| list_milestones | 只读 | milestones.page；已添加仓库、每批最多4库及续页 |
| get_milestone | 只读 | milestones.detail；全局ID及revision |
| save_milestone | 远程写 | milestones.save；创建／修改／关闭／重开，旧版本拒绝 |
| delete_milestone | 远程删除 | milestones.delete；确认仓库／标题，保留Issue／MR |
| list_milestone_items | 只读 | milestones.items；Issue／MR分别分页 |
| search_milestone_candidates | 只读 | milestones.candidates；IID搜索、全局ID及原归属 |
| save_milestone_links | 远程写 | milestones.links.save；草稿／迁移确认、预检查及部分结果 |

读工具标注readOnlyHint；当前10个写工具要求confirm（共27个工具；下方26个为上一阶段证据），可能覆盖关系／意见、改变已有里程碑或删除数据的工具另标注destructiveHint。schema复用`shared/`契约；权限、字段白名单、版本／归属冲突和部分结果不降级。没有新增创建MR、合入、流水线触发或Agent Review派发工具。

## 主线验证

- `npm ci --include=dev --ignore-scripts --registry=https://registry.npmjs.org` 和 `npm run typecheck`：退出0，使用官方SDK0.12.0。
- `node --test server/mcp.test.ts server/connection.test.ts server/repositories.test.ts server/board.test.ts server/milestones.test.ts server/mr-state.test.ts server/detail.test.ts server/reviewers.test.ts`：退出0，121项通过、0失败／跳过。Hook边界验证默认关闭／未配置、创建时合并且不变更原请求、保留同名连接、认证轮换、旧配置不变及关闭停止端点；项目边界覆盖分页worktree、符号链接、子目录、嵌套项目、其他host／站点、歧义、SDK失败、无权限、remote变化和解除关联，以及归属查询中凭据轮换不注入过期连接。
- `node scripts/verify-mcp-host.mjs /data/home/hulkzzhou/workspaces/paseo-fork-release`：退出0，隔离测试源码来自0.13.0-beta.901，不要求Hosted注册；fake provider的agent.create配置直连HTTP，发现27工具，RPC与MCP一致，本地项目关联、项目边界、配置轮换、关闭、停用／启用、卸载及旧配置保留通过。模型调用0、真实工蜂写入0。
- 类型检查基线是官方0.12.0；上述隔离运行宿主仍是既有beta.901测试源码，不将其冒充官方0.12运行或真实provider验收。原生手机、真实provider的新Hook连接及其他部署仍待验收。

## 本机接入与收尾

- `main` 实现提交 `c2b43ad`；`dev` 保持 `f68f482`。本机使用官方SDK0.12.0完成类型检查，定向121项通过；未跑全套或调用模型。
- `paseo plugin reload gongfeng-workbench --home /data/home/hulkzzhou/.paseo --json` 退出0，插件running。通过正式RPC确认原工蜂连接connected、MCP设置enabled=true均保持；catalog已无工蜂Hosted MCP注册。没有重启daemon、创建／重启已有业务Agent、修改Token或工蜂业务对象。
- 实际服务器浏览器的设置页确认说明包含“仅向已有效关联工蜂仓库的项目”“新建 Agent”“不会移除或更新已有 Agent”；开关仍开启。桌面1120×720和Web窄屏390×844无横向溢出，开关可滚动进入视口。本轮不保存私有页面截图，不据此声称原生手机或真实provider通过。
- 完成后恢复1120×720、里程碑页面与浏览器手动控制；代码与文档只作本地提交。新Hook的真实provider验收未做；上一阶段Hosted路径的gpt-6-luna成功不能替代本轮验证。

## dev分支历史（以下不是main的当前注入行为）

下面保留前一阶段Hosted MCP实现及真实只读样本的证据；精确实现可在 `dev:f68f482` 查看。这些历史的注册、撤销与真实provider成功，不代表主线Hook已做相同真实provider测试。

## 隔离验证记录（实现阶段）

- `npm run typecheck`：退出0。
- `node --test server/mcp.test.ts server/connection.test.ts server/repositories.test.ts server/board.test.ts server/milestones.test.ts`：退出0，79通过、0失败／跳过。包括5个标准MCP业务／生命周期／共享队列测试以及74个已有相关RPC测试。按本次明确要求未跑全套。
- `node scripts/verify-mcp-host.mjs /data/home/hulkzzhou/workspaces/paseo-fork-release`：退出0，实际beta.901测试daemon＋fake provider。验证默认关闭、provider直收定义、26工具发现、非空仓库与RPC一致、本地projectId关联、catalog不含凭据／MCP认证、配置更新换端点、新runtime采用定义而旧runtime不刷新、关闭、停用／启用和活动状态卸载撤销。临时插件副本使用`npm ci --omit=dev --ignore-scripts`安装成功。
- 宿主验收脚本复用fork现有测试daemon／fake provider和tsx加载器，不新增测试框架依赖；强制隔离PASEO_HOME并清除继承的PASEO_SERVER_ID，虚构上游拒绝任何非GET及外网请求。结束时核对监听已关闭，清理临时目录；独立脚本退出时清除测试工具残留计时器。
- 只使用临时数据和虚构请求，模型调用0、真实工蜂写操作0、生产接入0。真实provider二进制连接、设置页视觉／原生手机及真实工蜂写入未验收，不能把fake provider证据当作这些验证。

## Standards

基准`4fcb48a...e74dd9b`及增量至`9454eab`的独立审查无具体代码缺陷。设置加载／错误状态保留原配置，破坏性标记与业务操作一致，锁定依赖及生命周期符合约定。原任务状态和审查文字已按交付更新。

## Spec

初审发现1项P2验收缺口：原测试未证明跨RPC／MCP的共享写队列。`3a2418f`补可控阻塞场景，证明RPC占队列时合法MCP写入等待、两个仓库记录均保留，以及凭据切换后排队旧身份写入无副作用。独立复审至`9454eab`确认关闭，无新增Spec发现。正式审查只读，没有重跑测试或生产操作。

两轴最终均无未解决发现。实现阶段只提交本地分支；后续本机接入与记录补充如下，没有新增业务代码。

## 本机接入验收（2026-10-24）

用户随后授权继续 implement／PR 准备，并明确要求：等 Paseo MCP PR 被接受后，才发布工蜂插件的社区 PR。本阶段仅本机接入和本地文档提交，没有远程推送、PR、Release 或目录更新。

- 代码 `a65261b`，host 为既有 fork `0.13.0-beta.901`；`npm run typecheck` 退出0，`paseo plugin reload gongfeng-workbench --home /data/home/hulkzzhou/.paseo --json` 退出0且 running。没有重启 daemon、其他 Agent 或修改安装来源、站点、Token。
- 重载后原生设置初始 `enabled:false`，连接 connected，原 RPC 可读取7个已添加仓库。经原生设置保存开启后，catalog 的 `mcpServer` 已注册且 configured，传输为 HTTP。
- 服务器浏览器在真实设置弹窗中点击关闭：`aria-checked=false`，原生设置为 false，catalog 注册消失。聚焦同一开关按 Enter：`aria-checked=true`，设置持久化为 true，catalog 恢复 registered／configured。验收最终保留 MCP 开启；没有再次调用模型。
- 一次全新 Agent 使用现有“工蜂验收”预设，实际 `codex/gpt-6-luna`、low、full-access、`service_tier=default`。任务只允许 `plugin_gongfeng-workbench_gongfeng.list_repositories` 一次，输入 `{"input":{}}`。已完成工具记录恰好1次，最终输出“验收成功，仓库数量：7。GONGFENG_MCP_OK”，与原 RPC 数量一致。时间线另有宿主 `agent_message` 记账；没有 Shell、其他业务工具或真实工蜂写操作。会话已 idle，不重复派发。
- 桌面1120×720浅色与Web窄屏390×844深色下，设置开关及完整说明可见；窄屏设置内容宽342px，页面和弹窗均无横向溢出。可访问名称为“向 Agent 提供工蜂 MCP”、role 为 switch、tabIndex 为0、Enter 可操作。截图仅截取MCP卡片，不含账号、站点、仓库或凭据。
- 浏览器主题恢复 System、尺寸恢复1120×720、页面恢复里程碑；服务器浏览器已归还 manual、agentBusy=false，临时驱动已停止。另一空白自动化测试标签已关闭，没有关闭用户既有标签。

| 桌面浅色 | Web窄屏深色 |
| --- | --- |
| ![桌面浅色MCP开关](images/mcp-switch-light-desktop.png) | ![Web窄屏深色MCP开关](images/mcp-switch-dark-mobile.png) |

真实provider证据仅覆盖Codex的一次本地仓库读取，不等于所有26个工具、其他provider或远程写入已真实验收。原生手机、屏幕阅读器、公网站点和真实工蜂写入仍待验收；配置轮换和并发写入沿用隔离／针对性自动化证据。本次未改业务代码，复用已有双轴审查与79项相关检查，未重跑全套。

本地PR正文见 [MCP PR草稿](mcp-pr-draft.md)。宿主MCP PR尚未确认满足发布前置条件；即使宿主已发布fork，也不自动视为社区接口已被接受。后续发布前核对目标宿主PR及正式SDK依赖，并从既有公开干净谱系准备制品，不能直接推送含内部历史的本地集成分支。

本次文档收尾：`npm run check:status` 退出0（35份状态文件），`git diff --check` 退出0；未因文档补记重跑模型或业务测试。

## MR状态扩展

后续新增 `change_merge_request_state`，工具总数27；标准MCP与RPC共用处理，沿用原生开关和生命周期。原79项及真实模型一次仓库读取为上一阶段证据，不代表此工具已做真实远程写入。关闭／重开本轮验证见 [状态操作验收](mr-lifecycle-validation.md)。
