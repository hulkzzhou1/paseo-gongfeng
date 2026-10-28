# Paseo 原生 Agent 工具迁移

Status: ready-for-human

用户授权：退役工蜂插件自建 MCP，改用当前部署主线的工具 schema；本轮不发布社区。

- 使用 `defineAgentTool` 和 `agent.session_open`，保留现有 35 项业务能力和 UI RPC 共用处理器。
- 仅有效关联工蜂仓库的本 host 项目及其 worktree／子目录取得工具；历史读取、未关联、失效或歧义归属不附加。
- 保留启用偏好与默认关闭；不改动其他工具、环境、模型配置或 MCP。不主动重启 Agent。
- 工具名使用 `gongfeng_` 前缀；保留严格输入、写入确认、版本复核、串行队列、凭据轮换隔离和脱敏错误。执行使用实际调用 Agent 的 SDK 上下文，取消后不启动新写入。
- 删除插件 HTTP 监听和 `agent.create` MCP 注入，MCP SDK 只供隔离验收使用。旧 Agent 中已保存的 MCP 配置不自动改写，须移除旧 `gongfeng-workbench` 连接或新建 Agent。
- 当前主线 `6b7d49f0` 的 SDK 含接口；同版本 npm 包未包含。开发锁定本地 SDK 快照，不声称支持所有已发布 0.13.2。

验证：受控工具与 RPC 等价、严格 schema 与权限失败、配置／关联撤销、取消和并发写入；使用当前主线的隔离 daemon 验证原生工具和宿主传输的发现／调用、插件生命周期。无真实工蜂写入、无模型调用。收尾 `npm run check`，不推送或发布。
