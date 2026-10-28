# 移除 MR 内 Agent Review 派发

Status: ready-for-human
Blocked by: 无

用户在关联项目直接派发方案完成本地验收后明确决定移除此特性。本任务以最新决定为准，不再交付 Agent-first 派发。

删除 MR 概览 Agent Review 卡片、派发／历史恢复弹窗、三个后台派发 RPC 以及专属契约、实现和测试。保留仓库项目关联、人工评审、已有 Agent、工作区和历史文件，不创建替代入口。旧验收仅保留阶段证据，不表示当前仍提供派发。

验证：146项统一检查通过，11项克隆聚焦及类型检查通过；真实运行插件三个旧 RPC 均已停用，MR详情无派发卡片或按钮，人工评审及描述卡片保留。见 docs/agent-review-removal-validation.md。
