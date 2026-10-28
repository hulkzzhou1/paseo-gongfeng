# 01 — 共享业务与仓库端到端切片

Status: ready-for-human
Blocked by: 无

- [x] 显式业务目录复用原处理函数，UI RPC行为保持。
- [x] 标准MCP服务可发现并列出已添加仓库，结果与RPC一致。
- [x] 测试仅临时数据和虚构HTTP，无生产操作。

## Comments

实现阶段已完成79项针对性检查、隔离beta.901宿主验收及双轴审查。后续授权的本机接入、一次低成本真实只读调用和开关布局检查已完成；最终MCP开启，无真实工蜂写入。社区发布继续暂缓，详见 docs/mcp-adaptation.md；后续验收任务为 .scratch/gongfeng-mcp/issues/04-live-acceptance.md。
