# MR 详情与审查上下文验证

2026-10-22，任务 05。宿主 UI 尚未验收。

## 契约与处理

- 详情、差异、审查状态使用 `/projects/:projectId/merge_request/:mrId` 及其子路径；讨论使用复数 `/projects/:projectId/merge_requests/:mrId/notes`。`mrId`、展示 `iid`、Review ID 保持独立。
- 四个业务 RPC：`mr.detail`、`mr.changes`、`mr.review`、`mr.notes`。按账号与 MR 分开查询，评论或审查状态失败保留其他区块。只提供 GET 读取；共用客户端对网络错误、429 和 5xx 作有界重试，耗尽后保留手动重试，不写评论或启动 Agent。
- 从 detail 的 `source_commit/base_commit/target_commit` 校验 40 位 SHA，未知时保留 null；不以分支、合并提交或提交列表顺序猜测源版本。
- 差异读取由前后两次详情包围，同时核对 changes 的 MR ID、iid、源目标项目、分支及更新时间。观察到版本／身份变化时标记 `changed` 并隐藏混版差异；字段不足时标记 `unknown`。`verified` 仅代表这些读取时点和身份字段一致，不是对服务端 diff 内容的密码学证明，后续完整仓库派发仍须核验本地固定提交。
- `server/detail.ts` 导出 `readReviewContext(session, ref)`、`readNotes(session, ref, page)`、`readReview(session, ref)`。差异上下文包含自身 detail、固定版本、获取时间、完整性状态；`discussionIncluded:false` 明确未包含讨论，供后续派发分别获取、说明讨论分页及局部失败。
- 差异超过每文件 200000 字符、总计 1000000 字符或 1000 个文件时截断并标记不完整；缺失 diff、服务端折叠／过大标志也保留。描述最多 100000 字符，超限明确标记。
- 讨论每页 20 个顶层事项，优先使用分页头，缺失时按原始顶层数量判定后续页。嵌套回复保留父子关系，但平台没有已核验的完整返回保证，因此 `nestedComplete:false`。展示限 200 节点、嵌套 5 层、每条 20000 字符、单页共 200000 字符，超限标记 truncated。
- 描述、diff、讨论均为 React Native Text，不解释 HTML/脚本、不执行命令。原站链接由已核验的项目路径构造为固定工蜂 HTTPS 主机，不透传任意上游外链。

## 验证证据

- 官方来源：[MR](https://git.woa.com/help/menu/api/merge_requests.html)、[评论](https://git.woa.com/help/menu/api/comments.html)、[Review](https://git.woa.com/help/menu/api/cr/mr_review.html)。真实原始响应无落盘，仅保存字段结构和验证结论。
- 安全选定同一实际 MR，在真实业务 RPC 边界执行 detail、changes、review、notes 均成功；源 SHA 和比较基准有效，差异 89 文件、观察版本与身份一致、未触发差异截断，Review 4 人，讨论首屏 17 条且顶层分页结束。此样本不能证明嵌套回复全部返回。
- 12 项业务 RPC 集成测试通过，覆盖 ID/编号路由、前后版本变化、changes 身份滞后、缺失版本、文件变更标志、过大／折叠／截断、嵌套评论、讨论分页、错误响应、局部失败、账号变化及不可信文本。HTTP 是唯一外部替身，凭据使用临时真实目录。
- 类型检查通过。未保存私有正文、用户名、真实标识或 Token。
- 看板到详情导航、返回、宽屏／紧凑布局、深浅主题及手机实际操作留待主集成验收；未 reload 当前运行插件，不据代码检查标记 UI 已通过。
