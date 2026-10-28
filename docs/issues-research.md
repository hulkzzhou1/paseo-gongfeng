# 工蜂议题模块调研

核查日期：2026-10-26。只读核查内部工蜂官方帮助 HTML、官方 Swagger 和本项目代码，未读取凭据、私有配置或真实业务议题，未调用工蜂写接口或真实模型。用户目前表达了接入议题的意向；本文件记录能力事实，不代替范围决定，范围见 [设计记录](issues-design.md)。本轮未发现 `docs/adr/` 目录。

## 结论与证据边界

常用议题管理具有官方 OpenAPI 证据：仓库列表、详情、创建、编辑、关闭／重开、人员指派、标签／里程碑赋值和评论读取／新增／编辑。**删除议题、删除评论没有在所读 HTML 或 Swagger 找到契约**，不能承诺“完整 CRUD”。这只是当前公开契约缺口，不证明工蜂产品绝对没有相应功能。[议题 API](https://git.woa.com/help/menu/api/issues.html)、[评论 API](https://git.woa.com/help/menu/api/comments.html)、[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs)

HTML 和 Swagger 互有遗漏，必须交叉使用：HTML 议题列表漏列 `search`、人员与私密筛选；Swagger 列出这些参数，但也有重复 path 参数、无解释参数等不完整处。两者均不能替代真实返回校验。Swagger 本轮含 321 个 path；帮助页议题章节显示更新于 2024-08-02，评论章节显示更新于 2026-08-03。[议题 API](https://git.woa.com/help/menu/api/issues.html)、[评论 API](https://git.woa.com/help/menu/api/comments.html)、[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs)

## 官方能力矩阵

以下路径相对于 `/api/v3`；`:project` 对应工蜂仓库 ID 或编码后的仓库全路径。`id` 是系统全局标识，`iid` 是仓库内编号。API 普通议题详情／修改路径使用全局 `issue_id`；显式 `/iid/:issue_iid` 路径才使用 IID。原站链接与 `#编号` 使用 IID；身份需保留实例、仓库与全局 ID。[通用 API](https://git.woa.com/help/menu/api/api_use.html#iid-与-id-的区别)、[议题 API](https://git.woa.com/help/menu/api/issues.html)

| 能力 | 官方契约 | 缺口／接入含义 |
| --- | --- | --- |
| 仓库列表 | `GET /projects/:project/issues`；HTML 明确 `iid`／`iids[]`、`state=opened/closed`、`priorities`、`labels`、`milestone=标题`、创建／更新时间边界、`order_by=created_at/updated_at`、`sort=asc/desc`；Swagger 另列 `search`、`assignee_id`、`author_id`、`confidential`、`resolve_state`。 | 可对已添加仓库逐仓汇总，保留各仓续页和局部失败。自由文本 `search` 的标题／描述覆盖范围和匹配语义未解释，不能称为已验证全文搜索。[议题 API](https://git.woa.com/help/menu/api/issues.html#项目议题列表)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 跨仓列表 | `GET /issues` 明确叫“用户创建议题列表”；Swagger 另有 `GET /dashboard/issues`，接受人员、私密、状态、解决状态、优先级、标签、搜索、时间与分页参数。 | `/issues` 不能用作全站全部可见议题；dashboard 的默认关系集合、能否稳定覆盖所有可见仓库未说明。不能把跨仓端点命名为“全站全部议题”。[议题 API](https://git.woa.com/help/menu/api/issues.html#用户创建议题列表)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 分页 | 仓库／用户列表及评论列表：`page` 默认 1，`per_page` 默认 20、最大 100；通用列表文档提供分页头。 | 首屏不是全部。优先处理 `X-Next-Page`，保留不完整状态；不能以尚未扫描到的条目证明不存在。[通用 API](https://git.woa.com/help/menu/api/api_use.html#分页)、[议题 API](https://git.woa.com/help/menu/api/issues.html)、[评论 API](https://git.woa.com/help/menu/api/comments.html#获取议题评论列表) |
| 详情 | `GET /projects/:project/issues/:issue_id` 或 `/issues/iid/:issue_iid`。 | 返回 `id/iid/project_id/title/description/state/resolve_state/priority/confidential/created_at/updated_at/author/assignees/labels/milestone/linkedIssues`；HTML 兼有旧 `assignee`、`linked_issues`。描述／里程碑可能为空，优先级响应是字符串而写入是整数，示例甚至出现 `P0:`，不要无校验推断枚举。[议题 API](https://git.woa.com/help/menu/api/issues.html#查看指定议题-根据-id)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 创建 | `POST /projects/:project/issues`；必填 `title`；可选描述、`confidential`（默认 false）、`priority=0..5`、处理人、标签、里程碑以及 TAPD 字段。 | 不应因接口支持 TAPD 就扩展本轮范围。新建返回全局 ID 与 IID。[议题 API](https://git.woa.com/help/menu/api/issues.html#新建议题) |
| 编辑／状态 | `PUT /projects/:project/issues/:issue_id` 或 `/issues/iid/:issue_iid`；字段可选，`state_event=close/reopen`，`resolve_state=resolved/accepted/denied`。 | 开放／关闭状态与解决状态是两个维度；不能把“已解决”直接等同关闭。描述清空、各字段独立更新、重开后的实际 `state` 值待隔离样本验证。[议题 API](https://git.woa.com/help/menu/api/issues.html#修改议题-根据-id) |
| 删除议题 | 所读议题 HTML 和全部 Swagger 议题路径未列 `DELETE`。 | 必须保留为能力缺口，不能猜测 GitLab 路径或改用网页私有接口。[议题 API](https://git.woa.com/help/menu/api/issues.html)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 评论读取 | `GET /projects/:project/issues/:issue_id/notes` 与 `/notes/:note_id`。 | 返回作者、正文、创建时间、`system`、`parent_id` 等；HTML 还有嵌套 `comments`，Swagger 的 `Note4IssueFacade` 没有该字段。嵌套完整性和排序未确认，不能直接套用 MR 评论的 `sort` 参数。[评论 API](https://git.woa.com/help/menu/api/comments.html#获取议题评论列表)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 评论新增／编辑 | 同一 notes 路径 `POST`，指定 note 路径 `PUT`；HTML 要求 `body`。 | Swagger 将 `body` 标为可选 query string，和 HTML 必填表达不一致；应在本地要求非空正文，远端位置待验证。没有文档化 Issue 独立 discussions／replies 路径；MR 回复接口不能照搬。[评论 API](https://git.woa.com/help/menu/api/comments.html#创建项目的议题评论)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 删除评论 | 评论 HTML 和 Swagger 未列 Issue note `DELETE`。 | 修改自己的评论与他人评论、系统评论的权限限制也未逐项规定；不能仅按作者 ID 推断充分授权。[评论 API](https://git.woa.com/help/menu/api/comments.html)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 处理人候选／指派 | `GET /projects/:project/members/all` 返回有权限的成员，支持 `query/page/per_page`；创建／更新议题接受 `assignee_ids`，最多 10 人。 | HTML 为逗号分隔字符串，Swagger 为 `array of integer`、`collectionFormat=multi` query；传参格式、取消全部处理人的值以及私密议题人员资格待验证。成员列表是候选来源，文档没有称它为专用 assignee eligibility API。[项目成员 API](https://git.woa.com/help/menu/api/projects.html#获取项目有权限的成员列表)、[议题 API](https://git.woa.com/help/menu/api/issues.html)、[Swagger](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 标签候选／设置 | `GET /projects/:project/labels`，默认项目标签，支持分页及 `include_ancestor_groups`（默认 false）；议题写入 `labels` 为逗号分隔名称，最多 10 个。 | 设置标签不同于创建／删除仓库标签。已有标签替换还是增量、清空值、含逗号名称和继承标签行为待验证。不要混用 `review` 评审分类标签。[标签 API](https://git.woa.com/help/menu/api/labels.html#获取项目标签列表)、[议题 API](https://git.woa.com/help/menu/api/issues.html) |
| 里程碑候选／设置 | `GET /projects/:project/milestones`；议题写入 `milestone_id` 为全局里程碑 ID，列表过滤却用标题。 | 本仓已实现同仓归属校验与 JSON `milestone_id: null` 取消；该 null 契约来自既有隔离实测，HTML／Swagger 没规定清空值。不可据此替代其他实例的验证。[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)、[议题 API](https://git.woa.com/help/menu/api/issues.html)、[既有验证记录](milestones-validation.md#官方契约与隔离样本实测) |

Swagger 将创建／更新议题和评论的字段标为 **query 参数**，同时声明 `consumes: application/json`，没有 body schema；处理人更与 HTML 类型不一致。现有 JSON 里程碑关联已验证成功，只能证明该字段与该实例。新增标题／正文／人员等写入需单独核对，不宜一次放开任意请求体。[官方 Swagger](https://git.woa.com/api/v3/doc/v2/api-docs)、[既有验证记录](milestones-validation.md#官方契约与隔离样本实测)

## 权限与副作用

官方权限表中创建缺陷、写评论从 Guest（10）起可用，管理缺陷、管理标签从 Reporter（20）起可用；详情 API 写明需要 Guest 权限。**私密议题仅 Reporter 及以上项目成员可见**，不能用普通详情权限覆盖私密规则。具体编辑／关闭／评论修改／人员指派接口是否还受作者、仓库设置等限制未逐项规定，应服从当前账号的实际响应，区分无权限和空集合。[权限表](https://git.woa.com/help/menu/manual/permissions.html#项目成员权限)、[私密议题说明](https://git.woa.com/help/menu/instruction/product-docs/issue.html#设置私密议题)、[议题 API](https://git.woa.com/help/menu/api/issues.html#查看指定议题-根据-id)

官方产品说明明确：**fork 关联议题之间的评论与状态变更会双向同步**。因此关闭／重开或发表评论可能影响其他仓库的关联议题，不能默认只影响当前对象。详情会返回 `linkedIssues`／`linked_issues`，但可见关联是否完整、同步范围与具体权限尚待验证。fork、订阅／取消订阅、置顶、CSV 导出、TAPD 和附件上传属于外围能力，是否接入需另定；本轮不按“常用”一词自行纳入。[Fork 说明](https://git.woa.com/help/menu/instruction/product-docs/issue.html#fork-议题)、[议题 API](https://git.woa.com/help/menu/api/issues.html)

## 本项目事实与复用点

- [server/milestones.ts](../server/milestones.ts) 已读取仓库议题列表与全局 ID 详情，支持 `search`／IID 候选搜索和里程碑关联；数据只保留议题摘要，尚无独立议题模块。可复用已添加仓库边界、账号／站点检查、四仓并发、各仓游标、局部失败、写前回读、冲突检查及不确定结果表达。
- [shared/milestones.ts](../shared/milestones.ts) 的 `MilestoneItem` 已区分全局 `id` 与 `iid`，但不足以承载议题完整详情。其里程碑错误与关联草稿结构可作为现有模式，不能直接把 MR 状态或里程碑状态当议题契约。
- [server/gongfeng.ts](../server/gongfeng.ts) 统一认证、站点会话、请求超时、只读重试、远端错误和串行写入；读路径只允许 `/user`、`/projects`、`/dashboard/merge_requests`，因此 `/issues`、`/dashboard/issues` 当前会被拒绝。议题写白名单只允许 `PUT /projects/:id/issues/:id` 且正文严格仅 `milestone_id`；新建、编辑详情、关闭／重开及评论写入均尚未开放。
- [server/reviewers.ts](../server/reviewers.ts) 已使用 `/members/all` 搜索、过滤 active 成员并校验续页，可参考成员展示与头像清理，但函数名与 RPC 含评审语义，不能直接当议题人员接口暴露。[server/detail.ts](../server/detail.ts) 的 MR 评论分页／截断模式可参考；MR 排序、回复和嵌套结构不能直接视作 Issue API 事实。
- [server/mcp-tools.ts](../server/mcp-tools.ts) 通过明确 allowlist 暴露 RPC，已有里程碑工具可间接读取议题摘要和修改关联，尚无独立 Issue 工具。新模块若同时提供 UI／MCP，应共用业务 RPC 并同步写入／破坏性标记、全局 ID 说明和不确定结果约束。

## 实施前需要补齐的验证

这份研究不授权实施或真实写入。范围确定后，在隔离样本验证：搜索覆盖与翻页；私密／普通议题实际权限；`state` 与 `resolve_state` 的实际值；JSON／query、处理人格式、描述／人员／标签清空及替换语义；评论作者／系统评论的修改权限、排序、嵌套和不确定写入结果。删除议题与删除评论应先取得官方契约，不能用试探写请求补全。已有里程碑 null 清空的隔离验证可复用为当前内部实例证据，但其他站点仍需另核查。

本轮未做真实 API 验收、浏览器检查或运行测试；仅新增研究文档，未改运行代码。风险集中在删除契约缺失、参数表达不一致、私密权限，以及 fork 议题评论／状态同步。
