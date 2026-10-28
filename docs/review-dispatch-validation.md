# Review 派发实现与验证

> 历史记录：2026-10-23 用户决定移除 MR 内 Agent Review 派发。当前卡片、派发及历史恢复 RPC 和专属实现已删除；已有 Agent、工作区和历史文件保留，已有 Agent 通过 Paseo 原有入口访问。下文仅保留此前阶段证据。


移除前曾试验先启动 Agent 的流程，见[历史验证](agent-first-review-validation.md)。本页固定快照与独立目录内容仅用于追溯，当前不再提供历史恢复接口。

本页保留任务 07 的阶段证据，包含后续真实 diff Review 补记；早期测试数量和待办不是当前状态。当前验收结论统一见[集成验收](integrated-acceptance.md)。

2026-10-22，任务 07。实现基于 Paseo 0.12 插件 SDK。

## 已实现

- `review.prepare` 重新读取 MR 快照、有效项目关联和现有预设；传 `operationId` 可恢复原快照。前端只得到展示所需预设字段，服务端冻结完整 provider/model/mode/thinking/features/notes。
- `review.start` 持久保存操作、稳定资源 ID 和幂等 key。独立 Git 仓库直接从经 OpenAPI 验证的源/目标仓库 fetch 固定 SHA，核对 merge-base/head；不在原项目执行 fetch/checkout。不继承 Git 环境配置、全局/system 配置或模板，不执行 hooks、自动 setup 或 LFS/submodule 下载。检测 LFS 指针/子模块时明确失败并允许用户选 diff-only。
- SDK directory source 将已准备目录归入用户选定项目。先持久化意图，捕获资源事件，失败后复核工作区/Agent 归属；同次请求不会创建新身份。Agent 已存在但 prompt 启动结果未知时保留入口并停止自动重发。
- 代码获取失败或版本不可验证时仅显示降级选项；用户主动选择后使用独立空目录。原失败目录保留，不覆盖用户文件。
- 派发窗口使用宿主 Modal、Settings 组件和原生输入，提供现有预设、关联项目、补充要求、历史恢复及宿主 Agent/工作区入口。
- Agent 任务明确约束本地 Review，外部内容不可信，不修改业务代码、读取 daemon secrets 或其他插件配置、不使用工蜂 MCP、不执行远程写入。它是任务边界，不是系统级沙箱。
- 完整模式 prompt 不复制整个 diff，而提供固定 SHA 和文件索引供本地读取；diff-only 上下文有界并明确截断。讨论只包含首批有限内容，未声称完整讨论或 CI/TAPD 成功。

## 初始阶段自动化证据（历史）

`node --test server/dispatch.test.ts`：17 项 RPC + 临时真实 Git 测试。覆盖独立仓库/fork、head/base、原目录 dirty 保留、分支移动后快照固定、完整预设应用、长 diff、并发及重载幂等、多项目选择/remote 变化、Agent 失败复用、创建 ID 与资源事件区别、未知 prompt 不重发、LFS 降级、历史恢复、跨账号隔离、既有 Agent 目录核验。

`npm run typecheck`：通过。

## 初始阶段待集成实测（历史）

- 真实宿主创建 directory workspace 后的实际 SHA/归属，使用“研发协调”预设启动最小 Review 并核对真实 Agent 配置与结果。
- 实际审查会话的行为边界、结果入口，以及宿主深浅主题/紧凑布局/键盘交互。
- 插件私有目录不是宿主 owned worktree；宿主归档不承诺自动清理目录，历史资源留存。

上述为最初实现阶段记录；后续真实派发见本页末尾补记。未 push 或修改工蜂数据。

## 大仓库检查修正

真实集成样本的 `ls-tree -r` 路径输出超过 2 MiB，原实现将其误归类为代码获取失败。现仅请求 objectmode 判断子模块，LFS 使用无输出的存在性查询；不收集完整路径。输出/时间上限仍保留，检查失败不能视为完整代码。

新增临时真实 Git 回归包含 10000 个长路径文件及一个 gitlink，原路径输出大于 2 MiB。观察到原实现返回 `code_fetch_failed`，修复后返回 `code_incomplete` 且不创建宿主资源，保留用户明确选择 diff-only 的流程。类型检查通过。

## 宿主创建协议修正

真实 0.12 `WorkspaceCreateRequestSchema` 只接受 `wks_` + 16 位十六进制 ID，原生成值为 32 位。已修正新 ID，并在插件恢复路径中迁移旧版 32 位 ID：仅无已确认 workspace/Agent 且旧 ID 与派生 16 位 ID 均无实际工作区时，持久化稳定派生值再创建；不修改外部真实状态文件，不重新派发任务。

测试的宿主边界现在经过真实 `createPaseoApi` 配置映射，并使用当前 `WorkspaceCreateRequestSchema` / `AgentCreateRequestSchema` 校验 wire 请求。原首条派发测试先失败，修复后通过；追加旧持久记录恢复和已有资源拒绝迁移回归。17 项聚焦测试与类型检查通过。Agent ID 使用 UUID，配置经真实 SDK 转为独立 provider/model/cwd，当前协议校验通过。

## 最终恢复与远程地址检查

新增“Agent 创建成功但全部事件和响应丢失”的业务 RPC 回归：先观察恢复响应缺少 Agent ID 的失败，再修复为核对工作区和目录后持久保存已有 ID。重载历史可返回同一入口，反复恢复仍返回结果未知，且不再创建或重发。分别更改既有 Agent 的工作区和目录时均拒绝认领；原有无 Agent 的创建失败恢复继续通过。

克隆和完整 Review 共用同一个可信 SSH 地址构造函数，保留两处原有错误处理。真实临时 Git 用例覆盖合法子组仓库；恶意路径、空段、点段及外部主机被拒绝，失败时不创建宿主资源。派发 21 项和克隆 10 项聚焦测试通过。

## 真实 diff Review 验收补记

2026-10-22，实际执行代码含 `1bfedc7`。完整模式因样本子模块无法证明完整代码后，用户明确选择 diff 模式；同一已保存操作恢复成功，创建独立 directory 工作区和一个 Agent。实际 provider、model、mode、thinking 与 effectiveThinking 均匹配当时选择的“研发协调”预设；再次启动返回同一工作区和 Agent。

Agent 已结束并处于 idle。宿主时间线可读取 4 条助手消息和 8 次 shell 调用；可见调用的 cwd 都是该独立目录，命令元数据未见远程写入命令。空 diff 目录下首次 Git 检查失败，后续 Python 片段检查完成。最终 977 字符结果包含源／基准 SHA、diff／快照／抽样范围和未验证项，并提及 git diff --check 的限制。宿主 fetchAgent 与 timeline 可达结果；客户端结果入口未实际点击。

原克隆 HEAD 未变，结束后独立 diff 目录仍为空。上述证据仅证明该次 diff 审查和可见调用范围，不能替代完整仓库检出、完整测试、UI 验收或系统级安全隔离。记录不含真实资源 ID、私有正文或凭据。用户后续要求测试使用便宜模型；若还需真实模型测试，优先选择已有低成本预设。本轮不再新增真实 Agent，也不改变产品预设默认值或用户选择。
