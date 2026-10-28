# MR 关闭／重新打开验证

2026-10-24。本轮用户确认界面＋MCP、仅切换状态的小确认弹窗、共享RPC／标准MCP／真实UI验证边界，固定代码审查基准 d3a8742。规格见 [.scratch/gongfeng-mr-state/spec.md](../.scratch/gongfeng-mr-state/spec.md)，官方契约与缺口见 [研究](mr-lifecycle-research.md)。未发布、未推送、未执行真实MR状态写入或模型调用。

## 行为

- MR 概览增加同款状态卡片和紧凑按钮：opened／reopened可关闭，closed可重新打开；merged／locked／未知状态不提供操作。
- 原生小弹窗展示目标MR，重开提示最新OWNERS规则可能重置；只在确认后提交，提交期间禁用。成功刷新看板列表和详情；拒绝／未知结果不自动重发，保留核对提示。
- `mr.detail` 提供stateRevision；RPC `mr.state.change` 和MCP `change_merge_request_state` 共用业务、身份检查及写队列。必须使用全局mrId、当前账号和详情版本；MCP另需confirm:true。
- 上游仅允许单数MR路由的PUT，query为state_event=close／reopen、JSON空对象；拒绝合入事件、Issue状态、额外query和其他MR字段。调用前读状态和版本，调用后回读确认。工蜂校验最终权限；写前检查不是上游原子乐观锁。

## 自动化证据

- TDD首个RPC关闭用例先因缺少契约失败，补齐后通过；标准MCP用例先因工具未发现失败，注册后通过；query白名单用例先因其他写路由可带query失败，收紧后通过。
- `node --test server/mr-state.test.ts`：退出0，9项通过。覆盖关闭／重开和状态限制、旧版本、账号／目标项目不一致、权限拒绝、写入成功但回读不符／不可用、网络未知、写入不重试、脱敏、严格白名单，以及标准MCP发现／确认／调用与RPC一致。
- `node --test server/mr-state.test.ts server/detail.test.ts server/reviewers.test.ts server/milestones.test.ts server/mcp.test.ts server/connection.test.ts`：退出0，73项通过，0失败／跳过。
- `npm run typecheck`、`npm run check:status`、`git diff --check`：退出0；本地规格与任务状态37份合法。沿用已确定的针对性检查，不跑全套或模型验收。
- `node scripts/verify-mcp-host.mjs /data/home/hulkzzhou/workspaces/paseo-fork-release`：退出0，隔离beta.901宿主发现27个工具；RPC一致、开关／配置更新／卸载撤销通过，无真实上游写入或模型。

## 真实UI证据

本机插件重载返回running，最终运行代码e8121ac，未重启daemon、未改凭据或原有MCP开关。

- 已登录的服务器浏览器中打开开放MR，状态卡片与“关闭 MR”可见；弹窗包含确认和取消按钮。只点取消，弹窗消失且原MR仍显示开放状态操作。
- 切换已关闭筛选并打开详情，“重新打开 MR”可见，弹窗含OWNERS提示与确认按钮；只点取消，未提交状态写入。
- 修正后桌面重新打开确认弹窗，焦点确认为“取消”，按Enter成功取消，原MR仍为开放状态。
- 桌面1120×720与Web窄屏390×844下，确认弹窗在视口内，页面无横向溢出。此项为实际DOM／交互检查，未保存真实MR截图或正文，不等于完整主题／可访问性检查。

## 审查与限制

正式审查基准 `d3a8742`，覆盖 `78a5f2a` 及修正 `e8121ac`。Standards无发现；Spec初审1项P2：从里程碑打开MR后关联列表与统计未刷新。新增当前站点／账号的milestone缓存失效后，独立复核确认关闭，无新增发现。两轴最终均无未解决项。

真实权限、state_event query写入在当前实例的实际表现，以及重开的集成／规则副作用，尚未用真实MR验证；其他部署、原生手机和完整可访问性保留待验收。Web窄屏使用宿主移动端sheet时，额外Escape关闭检查未通过；本轮采用已有原生弹窗，取消按钮可用，未修改宿主的sheet键盘实现。

现有工蜂MCP已经本机开启；新增工具只随新会话或自然连接采用，不主动重启现有Agent。社区发布继续等待Paseo MCP PR接受，本轮仅本地交付。
