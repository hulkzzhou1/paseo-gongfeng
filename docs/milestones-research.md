# 工蜂里程碑模块调研

核查日期：2026-10-23。范围以内部工蜂 `git.woa.com` 为主，依据官方产品说明及 OpenAPI 文档；本文件的调研阶段未带凭据实测；后续实施阶段的隔离样本实测见[验证记录](milestones-validation.md)。本次只读取公开帮助文档及本项目代码，没有使用工蜂 MCP、读取凭据或执行远程写操作。

## 结论

工蜂里程碑是**工蜂仓库内组织 Issue 与 MR 的进度对象**，具有标题、描述、截止时间和开放／关闭状态；不是 Git tag，也不是 Paseo 项目或 TAPD 迭代。官方产品页说明可以用它跟踪项目 Issue 或 MR 的进度，并由用户手动创建、编辑、关闭、删除。[产品说明](https://git.woa.com/help/menu/instruction/product-docs/project.html#管理项目里程碑)

内部 OpenAPI 已文档化项目级里程碑列表、详情、关联 Issue 列表及 CRUD；MR 支持按里程碑标题筛选，并在标准详情返回里程碑对象。补充核查官方 Swagger 后，已确认 Issue 和 MR 更新接受 `milestone_id`，但取消关联的清空值仍未规定；不能承诺与原站相同的完成率、项目组共享里程碑或已验证完整关联编辑。详见文末“关联编辑补充核查”。[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)、[MR API](https://git.woa.com/help/menu/api/merge_requests.html)、[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs)

调研时本项目尚无里程碑页面或字段传递。后续用户已确认完整管理与关联编辑，实施范围以[设计决定](milestones-design.md)和规格为准，不继续沿用最初只读建议。

## 产品含义与范围

- **项目级范围已确认**：产品入口位于工蜂项目左侧“里程碑”，API 路径均以 `/projects/:id/` 开头，响应包含 `project_id`。此处“项目”按本项目术语对应工蜂仓库，不是 Paseo 项目。[产品说明](https://git.woa.com/help/menu/instruction/product-docs/project.html#管理项目里程碑)、[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)
- **Issue 和 MR 都可关联**：产品页明确两者均用于跟踪进度；Issue 页面说明通过右侧里程碑下拉关联。API 提供里程碑下的 Issue 列表，MR 列表支持 `milestone` 标题过滤。[Issue 产品说明](https://git.woa.com/help/menu/instruction/product-docs/issue.html#在议题中关联里程碑)、[里程碑 API](https://git.woa.com/help/menu/api/milestones.html#返回某个里程碑下的所有议题)、[MR API](https://git.woa.com/help/menu/api/merge_requests.html#获取合并请求列表)
- **关闭是独立操作**：产品页建议相关 Issue／MR 解决后关闭里程碑；没有文档证据表明它会随最后一项自动关闭，也不能把里程碑已关闭当作所有代码已合入的保证。[产品说明](https://git.woa.com/help/menu/instruction/product-docs/project.html#关闭里程碑)
- **项目组范围未确认**：本轮检索内部里程碑 API、项目组 API 和产品说明，未找到项目组级里程碑端点或继承／提升规则。这不证明平台绝对没有此能力；首期模型应先保持仓库级，不能套用 GitLab 项目组里程碑实现。[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)、[项目组 API](https://git.woa.com/help/menu/api/groups.html)

## 数据、状态、日期和进度

官方示例的里程碑对象含 `id`、`iid`、`project_id`、`title`、`description`、`state`、`due_date`、`created_at`、`updated_at`；描述和截止时间可以为 `null`。API 状态为 `active`／`closed`，编辑时的事件参数为 `active`／`close`，不要将状态 `closed` 直接当成写入事件。`due_date` 在新增／编辑参数中标为可选 datetime，但未在此页给出时区及清空值的准确契约。[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)

通用文档明确 **`id` 是系统全局唯一标识，`iid` 是项目内编号**。里程碑详情及更新路径使用 `:milestone_id`，应传 `id`；按 `iid` 查找则使用列表的 `iid` 查询参数。不能把 MR 的 IID、里程碑 IID 和里程碑 ID 混用。[通用 API](https://git.woa.com/help/menu/api/api_use.html#iid-与-id-的区别)、[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)

产品说明存在“跟踪进度”的业务含义，但里程碑 API 未文档化完成率、Issue／MR 总数、开始日期、权重汇总、燃尽图字段，也没有说明关闭 Issue、已解决 Issue、关闭 MR、已合入 MR 如何计入统一完成率。因此当前只能确认截止时间和状态，不能将一个自算百分比标为“工蜂官方进度”。若未来展示统计，应分开显示实际统计口径，并处理分页、不完整结果和 MR 关闭未合入等情况。[产品说明](https://git.woa.com/help/menu/instruction/product-docs/project.html#管理项目里程碑)、[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)、[Issue API](https://git.woa.com/help/menu/api/issues.html)、[MR API](https://git.woa.com/help/menu/api/merge_requests.html)

网页全局搜索可搜索里程碑的标题／描述、开放／关闭状态、到期时间和创建时间；其搜索语法使用 `is:open`／`state:open`，不能直接作为 REST 列表 `state=active` 的参数。原站搜索能力不等于已确认存在相同 OpenAPI 查询端点。[搜索文档](https://git.woa.com/help/menu/instruction/product-docs/search.html#搜索里程碑)

## OpenAPI 能力矩阵

基址为内部实例的 `/api/v3`，下表均相对此基址。路径中的 `:id` 是工蜂项目 ID 或编码后的项目全路径；全路径应作为一个路径段编码，不能让子组的 `/` 改变路由结构。[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)、[通用 API](https://git.woa.com/help/menu/api/api_use.html#full-path-说明)

| 能力 | 方法与路径 | 关键契约与限制 |
| --- | --- | --- |
| 列表 | `GET /projects/:id/milestones` | `state=active/closed`；按 `id/due_date/created_at/updated_at` 排序，默认 `created_at desc`；`page=1`，`per_page=20`，最大 100。也接受单个 `iid`，但设置 `iid` 后，状态、排序、分页参数全部不生效。未列标题搜索参数。 |
| 详情 | `GET /projects/:id/milestones/:milestone_id` | 使用全局里程碑 ID；文档明确需要该项目访问权限。 |
| 关联 Issue | `GET /projects/:id/milestones/:milestone_id/issues` | 返回议题数组及其状态／里程碑信息；端点参数表未单列分页，通用规则说明所有列表支持分页，仍需联调确认。不能认为一次返回一定完整。 |
| 创建 | `POST /projects/:id/milestones` | `title`，可选 `description`、`due_date`；默认示例状态 active。仅调研，未调用。 |
| 编辑／关闭／重新激活 | `PUT /projects/:id/milestones/:milestone_id` | 参数表将 `title` 标为必填；可选描述、截止时间及 `state_event=active/close`。仅关闭时是否可省略标题、如何清空日期均待实测。 |
| 删除 | `DELETE /projects/:id/milestones/:milestone_id` | 文档返回 200 或相关状态码；未说明关联项删除后如何表现。本次未调用。 |

以上表格依据同一份[官方里程碑 API](https://git.woa.com/help/menu/api/milestones.html)整理，其页面显示更新时间为 2023-06-06；接口较旧，示例不能替代真实响应校验。

### 与 Issue、MR 的关联

| 对象 | 已文档化能力 | 接入注意点 |
| --- | --- | --- |
| Issue | 项目 Issue 列表使用 `milestone=标题` 过滤；创建／更新 Issue 接受 `milestone_id`；详情返回 `milestone` 对象。 | 标题是过滤值，不是全局身份。取消关联的值没有在所读参数表中说明，应另行验证。[Issue API](https://git.woa.com/help/menu/api/issues.html) |
| MR | 标准项目 MR 列表和 `/merge_requests/basic` 都接受 `milestone=标题`；标准详情示例有 `milestone` 或 `null`。官方 Swagger 的 MR 更新支持 `milestone_id`，HTML 参数表漏列。 | basic 的说明明确不带 reviewers／milestones 等关联数据；展示里程碑不能依赖其详情完整性。取消关联值仍未规定，未找到 `/milestones/:id/merge_requests` 端点。[MR API](https://git.woa.com/help/menu/api/merge_requests.html)、[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs) |
| 跨项目 MR 看板 | `/dashboard/merge_requests` 的 `sort` 列出 `milestone_due_asc`／`milestone_due_desc`；官方 Swagger 另列 `milestone_title` query string 筛选字段。 | 文档分别称“即将到期”／“即将延期”，空截止时间、相同日期的顺序和标题筛选结果未经验证；不能把项目列表的 `milestone` 参数名直接用于 dashboard。[MR Review API](https://git.woa.com/help/menu/api/cr/mr_review.html)、[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs) |

分页应优先结合实际响应的 `X-Next-Page`、`X-Total`、`X-Total-Pages` 等处理；不要把首屏 20 项当作全部。通用说明所有 API 请求都要认证，可沿用现有服务端 Token 机制；不把凭据放 URL、客户端展示字段或研究文档。[通用 API](https://git.woa.com/help/menu/api/api_use.html#分页)、[认证说明](https://git.woa.com/help/menu/api/api_use.html#认证方式)

## 权限与版本边界

官方项目权限表明确“新建里程碑”要求 **Master（40）或 Owner（50）**；里程碑详情文档只说明项目访问权限，未逐项说明列表、编辑、关闭、删除的最低角色。不要从可查看 MR 或已配置 Token 推断有里程碑管理权限，也不要为了增加只读页面要求用户升权。[权限说明](https://git.woa.com/help/menu/manual/permissions.html#项目成员权限)、[里程碑 API](https://git.woa.com/help/menu/api/milestones.html#返回指定里程碑)

`401` 是认证失败，`403` 可能为权限或项目设置，`404` 也可能因为无访问权限；空列表与不可访问必须区分。[通用 API](https://git.woa.com/help/menu/api/api_use.html#返回值)

本轮未确认公网工蜂与内部工蜂的里程碑契约一致。访问公网旧路径 `https://git.code.tencent.com/help/menu/api/milestones.html` 时，实际跳转至 `https://code.tencent.com/help/productionDoc/group`，未获得对应 API 规范；因此不比较两者功能数量，也不按“兼容 GitLab”补全缺口。自定义工蜂实例仍应以目标实例文档和真实权限为准。

## 本项目接入建议（代码核查，非官方能力声明）

当前 [server/detail.ts](../server/detail.ts) 的原始详情校验与 [shared/detail.ts](../shared/detail.ts) 的返回类型没有里程碑字段，即使工蜂返回也不会进入 MR 概览。[shared/board.ts](../shared/board.ts) 没有里程碑筛选参数；[server/board.ts](../server/board.ts) 的指定仓库“全部”查询走项目 MR 列表，可在后续明确需求后增加标题过滤，全局 dashboard 路径不能直接照搬。

[server/gongfeng.ts](../server/gongfeng.ts) 现有会话客户端可复用 `/projects/...` 下的只读 GET 和认证／错误处理；远程写请求被白名单限制为人工评审相关路由，新增里程碑写操作会被拒绝。里程碑调研不扩大该白名单。

建议最小顺序：

1. MR 概览展示关联里程碑的标题、状态和截止时间；为空时不制造占位业务对象。
2. 在已添加仓库内提供只读里程碑列表／详情，按需加载关联 Issue／MR，保留分页和局部失败提示。
3. 有明确需求后增加仓库内里程碑筛选。身份／缓存包含工蜂实例、账号、工蜂项目 ID、里程碑 ID；不同仓库同标题不合并为同一里程碑。

原站里程碑详情链接的精确路由尚未实测；通用文档只说明 IID 与网页 URL 对应，不能直接拼接猜测链接。可先依赖经过确认的原站入口。以上仅为最初只读接入建议；用户后续已选择完整管理、汇总已添加仓库及关联编辑，实际范围以 [里程碑设计文档](milestones-design.md) 的确认记录为准。已移除的 MR 内 Agent Review 派发不重新加入。

## 后续只读验证清单

在用户决定实现后，可用已有测试仓库和服务端凭据验证，不需要创建或修改里程碑：

- 已有 active／closed、无截止日期和非空描述对象的实际响应；`id`／`iid` 及列表按 IID 查询行为。
- 列表及关联 Issue 的翻页和总量头；无权限项目的错误表现。
- MR 标准详情里的关联、按标题筛选结果；重名标题／已关闭里程碑行为。
- 原站入口路由、截止时间格式及时区；在缺少完整数据时不显示误导性的完成率。

本轮没有读取真实仓库数据、验证账号权限、比较公网接口或改动插件实现；这份文档只证明官方文档覆盖范围与本项目当前接入缺口。

## 关联编辑补充核查

核查日期：2026-10-23。用户已明确要求首期支持添加、移除关联 Issue／MR；这是产品目标，不代表相关 OpenAPI 契约已实测。本节重新读取官方帮助 HTML、检索其整站文档索引，并交叉核查官方在线 Swagger 规范，补充关联编辑的证据与缺口；未读取凭据、调用工蜂 MCP 或执行远程写操作。

官方 [API 在线调试文档](https://git.woa.com/help/menu/api/demo.html)提供 [Swagger 入口](https://git.woa.com/api/v3/doc/swagger-ui.html)；其 [`swagger-resources`](https://git.woa.com/api/v3/doc/swagger-resources) 指向 [`/v2/api-docs`](https://git.woa.com/api/v3/doc/v2/api-docs)，本次取得包含 321 个 path 的 Swagger 2.0 规范。规范与 HTML **互有遗漏**：规范确认了 MR 的里程碑写入字段和 Issue 搜索字段，但没有里程碑 CRUD 路径；因此不能只取其中一份作为全量接口清单。

### 写入契约

| 操作 | 官方已确认的契约 | 尚未确认的部分 |
| --- | --- | --- |
| 给 Issue 设置里程碑 | `PUT /api/v3/projects/:id/issues/:issue_id` 或 `PUT /api/v3/projects/:id/issues/iid/:issue_iid`，参数 `milestone_id` 为可选 integer，描述为“里程碑的唯一标识”。前一种路径用全局 Issue `id`，后一种显式用项目内 `iid`；`milestone_id` 用全局里程碑 `id`。[Issue API](https://git.woa.com/help/menu/api/issues.html#修改议题-根据-id) | 参数表没有明确跨仓库里程碑校验规则、单独关联操作的最低权限或错误响应。 |
| 从 Issue 移除里程碑 | 上述更新接口可能承载此操作，但 HTML 和 Swagger 均未说明清空值。[Issue API](https://git.woa.com/help/menu/api/issues.html#修改议题-根据-iid)、[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs) | **`null`、`0`、空串、负值均不能依据文档确认有效**；省略字段也不能解释为取消关联。需要平台确认或受控写入实测。 |
| 给已有 MR 设置里程碑 | `PUT /api/v3/projects/:id/merge_request/:merge_request_id`，路径为单数 `merge_request`，使用全局 MR `id`。HTML 漏列该字段，**官方 Swagger 明确列出 `milestone_id`，可选 query 参数、integer／int32**。[MR API](https://git.woa.com/help/menu/api/merge_requests.html#更新合并请求)、[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs) | 无需套用 GitLab；但没有明确跨仓库校验、单独关联操作权限或清空值。 |
| 从已有 MR 移除里程碑 | 同一 MR 更新接口的 `milestone_id` 未给 `default`、最小值、nullable 或清空说明。[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs) | 仍不能确认 `null`／`0`／空串等具体取消方式。 |

Swagger 的 Issue 两种 PUT 与 MR PUT 都把 `milestone_id` 定义为 **query 参数**，同时声明 `consumes: application/json`，没有与之对应的 body schema。实施应先遵守文档化的参数位置；不能仅凭 consumes 声明就断言 JSON body 可代替 query。当前规范的这处表达需要联调确认，参数值不得包含认证凭据。

整站文档索引中另有 `milestone_id`：`POST /api/v3/projects/:id/repository/commit/cherry_pick` 将其作为拣选并新建 MR 的参数；这只能证明该特定创建场景有文档化支持，**不能用来修改已有 MR，也不应通过新建 MR 绕过关联能力缺口**。[Commit API](https://git.woa.com/help/menu/api/commits.html#拣选-cherry-pick-操作)

### 候选项、仓库边界及权限

- Issue 候选可从 `GET /projects/:id/issues` 分页读取，按 `iid`／`iids[]`、`state` 或里程碑标题过滤。HTML 参数表未列自由文本 `search`，但官方 Swagger 明确列有可选 string query 参数 `search`，可用于服务端搜索联调；规范没有进一步解释搜索字段范围及匹配语义，不应擅自声称覆盖描述全文。[Issue API](https://git.woa.com/help/menu/api/issues.html#项目议题列表)、[官方 Swagger 规范](https://git.woa.com/api/v3/doc/v2/api-docs)
- MR 候选可从 `GET /projects/:id/merge_requests` 分页读取，明确支持 `search` 标题关键词、`iids[]`、状态及里程碑标题；状态不传时返回各状态，不能只取开放 MR。关联详情和统计需使用有里程碑字段的标准响应，不能依赖不包含关联数据的 basic 响应。[MR API](https://git.woa.com/help/menu/api/merge_requests.html#获取合并请求列表)
- 已确认里程碑对象和列表均为项目级。插件可把候选限定为该里程碑所在工蜂仓库，关联前再核对对象与里程碑的项目身份；这属于拟定接入约束。官方所读参数表没有说明跨项目关联是否必定被后端拒绝。Fork MR 同时有源／目标项目，尤其不能拿源项目 ID 代替里程碑项目身份。[里程碑 API](https://git.woa.com/help/menu/api/milestones.html)、[MR API](https://git.woa.com/help/menu/api/merge_requests.html)
- 官方权限表列“管理缺陷”为 Reporter（20）及以上，“管理合并请求”为 Developer（30）及以上，“新建里程碑”为 Master（40）及以上；它未逐项列“更改里程碑关联”的权限。不能把这些通用角色直接当作关联接口的充分授权。[权限说明](https://git.woa.com/help/menu/manual/permissions.html#项目成员权限)
- Issue 详情文档要求项目 Guest 权限；产品说明又明确私密议题仅对 Reporter 及以上项目成员可见。候选必须依赖当前服务端账号实际返回的可见数据；不可通过缓存、统计或搜索泄露不可见议题。可读不代表可改，写操作仍需处理权限错误。[Issue API](https://git.woa.com/help/menu/api/issues.html#返回某个议题)、[Issue 产品说明](https://git.woa.com/help/menu/instruction/product-docs/issue.html#设置私密议题)

本节的接口验证结论是：**Issue 和已有 MR 的里程碑赋值均有官方契约；两者清空值仍未规定，权限及参数传递还未实测**。本轮不使用网页私有接口替代 OpenAPI，不在真实仓库试探候选清空值。后续实施若仍无法取得取消关联契约，应将移除关联保留为明确的能力缺口并反馈用户，不能以“已完成完整管理”验收。

## 实施阶段的契约实测补充

关联设置／取消、日期清空、生命周期和删除后关系已通过专用 e2e 仓库的隔离样本验证：Issue／MR 取消均使用 JSON `milestone_id: null`，`0`／`-1` 会被拒绝；JSON `due_date: ""` 可清空日期。样本里程碑和分支已清理，事项已关闭。该证据补足以上文档未明确的契约，仅适用于本次内部实例；详情与验收进度见[验证记录](milestones-validation.md)。
