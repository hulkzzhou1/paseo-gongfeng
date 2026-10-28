# 02 — 发布0.3.0并提交社区

Status: ready-for-human
Blocked by: 01 — 保留dev并将main切换为创建Hook

用户明确要求发布新版本并提交社区，取代之前等待Hosted MCP PR的暂缓安排。

- [x] 本地版本及公开干净谱系0.3.0制品就绪，无内部历史或验收数据。
- [x] 公开副本发布检查、版本标签和GitHub Release。
- [x] 社区记录更新PR和可信校验，报告实际审核状态；不自行批准或合并。

## Comments

保留MCP默认关闭、只向有效关联项目中新建Agent注入，以及已有Agent配置不更新的边界；公开说明真实provider的新Hook路径、真实MR状态写入和原生端的未验收项。不进行npm发布、真实工蜂写入或模型测试。

2026-10-25：公开固定提交38967a5446cc1a144f4a38d7d19ee9da798115f6，v0.3.0标签与GitHub Release已发布。公开副本170项及类型检查、可信目录172项、在线固定制品校验和GitHub Validate 40110281804均通过；社区PR https://github.com/getpaseo/plugins/pull/1131 已提交，OPEN、待审核。发布和提交任务完成，不将等待审核视为实现未交付；详细证据与待验收项见docs/community-registry-submission.md。
