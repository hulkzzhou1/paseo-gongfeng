# 01 — 保留dev并将main切换为创建Hook

Status: ready-for-human
Blocked by: 无

- [x] 读官方契约，dev保留f68f482，main保留已有功能后切换。
- [x] agent.create注入，默认关闭、已有MCP／配置不覆盖，无Hosted管理API。
- [x] 仅有效关联项目注入；worktree／子目录、嵌套未关联项目、歧义与失效边界回归。
- [x] 官方SDK0.12.0及相关检查通过，隔离daemon/fake provider发现和调用27工具。
- [x] 原生开关说明／当前运行实例和文档收尾，本地提交，不发布。

## Comments

已完成本地实现与接入，原生手机和新Hook真实provider保留待验收；不将旧Hosted路径的模型结果当作本轮证据。
