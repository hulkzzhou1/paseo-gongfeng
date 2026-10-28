# Paseo Agent 工具迁移（本地未发布）

日期：2026-10-27。用户确认规格 `.scratch/agent-tools/spec.md`、三个测试边界和固定审查基准 `7afdc20`。本轮不发布社区，保留此前工作台重构及业务功能。

## 实现

- 删除插件自建 HTTP MCP 监听、临时 Bearer 凭据、`agent.create` 注入及相应专属测试。运行包不再依赖 MCP SDK；开发验收仍用它连接 **Paseo 自己的传输**，同时验证原生工具注册。
- 保留原有 35 项业务映射，工具名统一 `gongfeng_` 前缀；使用主线 `defineAgentTool` 和 `agent.session_open`。输入沿用 `{input: {...}, confirm: true}`，只写工具要求 `confirm`。业务输出由 RPC 契约校验后返回 `structuredContent.result`。
- 设置页改名“向 Agent 提供工蜂工具”，默认关闭；保留设置文档 id `mcp`，避免丢失已有偏好。旧 id 只是存储标识，不启动或注册 MCP 服务。
- 只对当前 daemon／站点有效关联项目及其 worktree／子目录附加；拒绝未关联、失效、嵌套未关联、歧义归属、其他 host、不可读仓库和历史读取。执行时用实际 Agent cwd／SDK 再复核，移除可变全局调用上下文。
- 关闭、停止、凭据轮换、失效关联拒绝旧调用；取消传给 API 请求，排队期间取消不启动写入。写请求不自动重试，取消／断网不保证远端未落地，需回读核对。

## 契约与兼容

核对已部署官方主线 `6b7d49f0d8d21d01565f9517a8c2a30e2a587e2a` 的公开插件文档、`packages/plugin/src/server/agent-tools.ts`、生命周期类型及 `packages/server/src/server/plugins/agent-tools.e2e.test.ts`。部署版本标识 0.13.2；公开 npm SDK 0.13.2 尚无本接口，开发锁定主线 SDK 快照，来源及许可证见 `.scratch/agent-tools/sdk/README.md`。

manifest 最低版本上调为 0.13.2，但本地版还要求此主线能力，不能仅凭版本号推断稳定版支持。旧宿主明确报缺少 Agent tools 能力，不回退到 MCP。发布前应换回包含接口的公开 SDK 并核定正式最低版本。

官方参考：[Attach tools to agents](https://paseo.sh/docs/plugins/reference#attach-tools-to-agents)。宿主管理连接和 provider 权限，插件不自动重启 Agent。开启／切换身份后需重开会话取得新定义；旧 Agent 持久保存的 `gongfeng-workbench` MCP 不自动修改，须移除该项或新建 Agent。

## 验证证据

- 设置初始读取失败与后到启用订阅的竞态测试先失败，修复后通过。工具／作用域定向检查 10 项通过，退出 0；覆盖 35 项 schema、RPC 等价、写确认、MR／议题／评论版本与作者守卫、跨 host、队列、凭据切换、取消和脱敏。
- 原 RPC-only 测试宿主补齐正式 `before` 注册后，8 个文件的 126 项检查通过，退出 0，日志 `/tmp/gongfeng-agent-tools-rpc.log`。首次全量检查暴露测试宿主契约不足，不作为最终通过证据。
- `node scripts/verify-agent-tools-host.mjs /path/to/paseo-main`：在主线隔离 daemon 0.13.2、临时数据、虚构 HTTP 与假 provider 上通过，退出 0。验证 35 项发现、原生工具与宿主传输 schema 一致、调用等价、项目范围、默认关闭、严格输入、写确认、开关、凭据轮换、重载／禁用／卸载撤销，不主动重启 Agent。日志 `/tmp/gongfeng-agent-tools-host.log`，0 模型调用、0 真实远端写入。
- `npm pack --dry-run --json`：75 个交付文件，无 `.scratch`、SDK 快照、scripts、测试、node_modules 或旧 MCP 运行实现。未生成发行版、推送或发布。
- `npm run check`：任务状态、TypeScript 与 195 项测试通过，退出 0，无跳过；日志 `/tmp/gongfeng-agent-tools-check.log`。Standards 无硬性违反；Spec 两项异步边界在 8dd9f98 修复并经原审查 Agent 复核，无未解决项。最终代码的隔离宿主复验同样通过。

## 审查修复

Spec 初审发现写入排队后关联撤销未复核，以及取消未阻止克隆后续命令。两个受控复现先失败，再分别修复：写队列开始执行前用实际调用 Agent 复核访问；克隆将取消与插件生命周期信号传给子进程，并在创建目标和项目登记前检查。增加已完成克隆取消场景，保留克隆和恢复记录、不启动项目登记；本地关联写入也检查取消。修复相关 24 项定向检查及最终 195 项统一检查通过。所有命令均操作临时仓库和虚构接口，无真实 SSH 克隆或项目登记。

## Standards

依据仓库开发约定、Paseo plugin skill 的 SDK／清理边界及已部署主线公开工具契约。初审和 8dd9f98 复核均未发现硬性规范违规或具有实质影响的代码异味；主线 SDK 兼容限制已明确，正式发布前仍须核定公开 SDK 和最低宿主版本。

## Spec

初审发现两项：排队后未复核关联、克隆取消未阻止后续命令。均已受控复现并在 8dd9f98 修复。复核确认队列授权不递归获取写锁，克隆取消与保留恢复记录符合规格；未发现新增可操作问题或无关范围扩张。

两轴最终未解决项：Standards 0，Spec 0。审查 Agent 仅做静态复核，未自行运行模型或真实写入；运行证据来自上面的主任务检查。

## 本机接入

本机已仅重载 `gongfeng-workbench`，返回 running，SDK 设置读取 ready、工具启用 true，与重载前一致；新客户端 bundle 已包含 agentToolsSettings 并移除 mcpSettings。没有更改 Token、站点、仓库关联或开关，没有重启 daemon、主动刷新或重启 Agent。原 MCP 进程资源随旧插件停止清理，新实现不启动插件 HTTP 服务。未创建真实验收 Agent，真实 provider 工具调用未重放。

本轮只在当前分支提交 f8a45f6、8dd9f98 及验收文档，未推送、创建 PR、升级版本号、生成发行版或提交社区。

## 限制

没有调用真实模型，没有真实工蜂写入、原生手机复验或旧 Agent 配置迁移。用户此前已要求停止手机故障排查，本轮不修改该路径。旧发布标签 v0.3.0 不包含本次迁移。
