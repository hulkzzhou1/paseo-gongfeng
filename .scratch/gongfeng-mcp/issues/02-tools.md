# 02 — 工具覆盖与连接生命周期

Status: ready-for-human
Blocked by: 01 — 共享业务与仓库端到端切片

- [x] 仓库／项目关联、MR及里程碑工具显式映射，写入要求确认。
- [x] 认证、配置切换、旧连接拒绝、错误脱敏和启停撤销可验证。
- [x] 不导出连接保存、运行时RPC或凭据。

## Comments

实现阶段已完成79项针对性检查、隔离beta.901宿主验收及双轴审查。后续授权的本机接入、一次低成本真实只读调用和开关布局检查已完成；最终MCP开启，无真实工蜂写入。社区发布继续暂缓，详见 docs/mcp-adaptation.md；后续验收任务为 .scratch/gongfeng-mcp/issues/04-live-acceptance.md。
