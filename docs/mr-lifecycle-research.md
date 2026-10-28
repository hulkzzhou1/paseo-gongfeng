# MR 关闭与重新打开：官方契约核查

核查日期：2026-10-24。仅对工蜂内网版官方帮助、其静态站点索引和官方 Swagger 规范执行无凭据 GET；未读取 Token、私有业务 JSON，未调用真实业务写接口、启动 Agent 或运行测试套件。以下为文档事实，不是权限或状态迁移的实测结论；不套用 GitLab。

## 已确认契约

| 核查项 | 官方证据与结论 |
| --- | --- |
| 路由与方法 | `PUT /api/v3/projects/:id/merge_request/:merge_request_id`，`merge_request` 为单数；本轮文档未发现独立 `/close`、`/reopen` 的 MR 生命周期接口。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求) |
| MR 身份 | 更新参数使用全局 MR `id`，不能传网页编号 `iid`。通用说明区分全局 `id` 和项目内 `iid`；详情有单独的 `GET /projects/:id/merge_request/iid/:iid`，但本次 Swagger 的该 IID 路径只有 GET，没有 PUT。[身份说明](https://git.woa.com/help/menu/api/api_use.html#iid-与-id-的区别)、[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 项目身份 | `:id` 可用项目 ID 或完整路径，完整路径作为一个路径段编码。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)、[路径说明](https://git.woa.com/help/menu/api/api_use.html#project-full-path) |
| 事件值 | 可选 string 参数 `state_event` 的值为 `close` 或 `reopen`；不能发送状态名 `closed`／`reopened` 来代替事件。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求) |
| 参数位置 | Swagger 的 `updateMergeRequestUsingPUT` 将 `state_event` 定义为可选 **query** 参数，没有 body schema；同时声明 `consumes: application/json`。因此 query 是文档明确的位置，不能由 consumes 推断 JSON body 等价。HTML 未给状态更新请求样例。[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 成功响应 | HTML 展示更新后的 MR 对象，包含 `id`、`iid`、`state`、源／目标项目与分支等；示例 `state=closed`。通用说明修改成功为 HTTP 200 并返回更新对象；Swagger 200 schema 为 `MergeRequestFacade`，还列出通用 201／401／403／404。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)、[通用返回值](https://git.woa.com/help/menu/api/api_use.html#返回值)、[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 状态语义 | 文档说明 `opened` 为打开、`closed` 为人为关闭、`merged` 为代码已合并、`reopened` 为从 closed 重新打开、`locked` 为合并中锁定。这是状态含义，尚不是完整的允许迁移表。[MR 状态说明](https://git.woa.com/help/menu/api/cr/mr_review.html) |
| 响应权限字段 | 本次 Swagger 的 `MergeRequestFacade` 以及 MR 更新／详情 HTML 示例均没有当前用户的 `user` 权限对象、`can_close` 或 `can_reopen` 字段。`author`／`assignee` 是身份信息；关联的 `UserBasicMixIn` 也仅含 id／name／username／state，不能作写权限标志。这里只说明公开契约未列出，不能断言实际响应绝不含其他字段。[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs)、[MR API](https://git.woa.com/help/menu/api/merge_requests.html) |

## 权限与状态边界

官方项目成员权限表将“管理合并请求”列为 Developer（30）、Master（40）、Owner（50）可操作；保护分支规则组权限表将“关闭合并请求”列为 Developer、Master 可操作。权限说明同时强调保护分支权限限于该分支的代码操作，多种项目权限通常取最高值。[权限说明](https://git.woa.com/help/menu/manual/permissions.html#项目成员权限)、[保护分支规则组](https://git.woa.com/help/menu/manual/permissions.html#保护分支规则组权限)

这些表与 MR 更新接口**没有逐项说明**作者是否有额外关闭／重开权限、离开项目的作者权限、跨项目 MR 用源项目还是目标项目鉴权、重开与关闭是否采用相同权限，以及归档／分支不存在时的限制。不能仅凭“我是作者”或“我能查看”宣告有权操作，也不能把通用角色表当作每次请求必定成功的保证。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)、[权限说明](https://git.woa.com/help/menu/manual/permissions.html)

文档将 reopened 定义为从 closed 打开，但未明确列出 `opened/reopened → closed` 的全部前置条件、重复 close/reopen 的结果、`locked` 的具体拒绝行为，也**没有明确说明 merged 能否 reopen**。因此“已合入允许重开”没有文档依据；同样不能声称已经验证了平台必定拒绝。设计可将操作限定为开放状态关闭、closed 重开，把 merged／locked／未知状态排除；这是产品约束，不是完整后端契约。[MR 状态说明](https://git.woa.com/help/menu/api/cr/mr_review.html)、[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)

特别注意：`PUT /projects/:id/merge_request/:merge_request_id/review/reopen` 是**重置评审状态**，官方要求该 MR 的评审处于拒绝或反馈修改状态。它与 `state_event=reopen` 的 MR 生命周期不同，不能用来重新打开已关闭 MR。[MR Review API](https://git.woa.com/help/menu/api/cr/mr_review.html#重置评审状态)

## 副作用与未明确事项

- 工蜂 Webhook 文档列有 MR 的 close／reopen action 与 extension_action；因此关闭／重开可能触发现有项目集成，不能承诺没有外部影响。是否发送通知、是否触发流水线及投递时序未在状态更新契约中说明。[MR Webhook](https://git.woa.com/help/menu/manual/git_webhooks.html#合并请求事件)
- 官方项目设置说明：编辑 MR 标题增删 `--skip-owner` 后，要关闭再重新打开 MR 或推送新提交才生效。因此重开可能改变文件评审规则。[项目设置](https://git.woa.com/help/menu/instruction/product-docs/pro_setting.html)
- OWNERS 产品文档说明，CR 重新打开时会依据最新 OWNERS 配置重置评审规则。这证明不能承诺评审规则保持原样；该说明没有逐项定义 `state_event=reopen` 对所有评审人批准、评论、订阅和检查结果的影响，不把它扩展为“所有批准必定清空”。[OWNERS 重置规则](https://git.woa.com/help/menu/solutions/OWNERS/OWNERS-pro.html#重置评审规则)
- 更新 MR 的 description 支持 `/copilot-summary`，可异步生成并替换描述。生命周期请求只需要发送明确的 `state_event`；回传整份详情作为更新参数会扩大更新范围。文档未明确说明只传事件时其他字段的所有默认处理，需要实施时验证。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)
- 生命周期接口未声明乐观锁／版本条件、重复请求幂等性或网络超时后的最终结果。通用 API 区分权限、冲突、不可操作等错误，但没有本接口逐状态错误矩阵；不能把超时等同于失败并盲目重试。[MR 更新](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)、[通用返回值](https://git.woa.com/help/menu/api/api_use.html#返回值)

本轮保留的验证缺口：query 与 JSON 的实际兼容性、精确角色／作者权限、完整迁移矩阵与 merged 限制、分支删除／归档边界、状态变更的评审和自动化副作用，以及超时后通过重新读取 MR 判定结果的实际表现。未以真实写入试探这些行为。
