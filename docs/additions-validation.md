# TAPD 关联与 CI 摘要验证

2026-10-22，任务 06。

## 实现与来源

- `mr.tapd` 从服务端核实的 MR 详情取项目内 iid，再查询工蜂 `/projects/:id/tapd_workitems?type=mr&iid=...`；校验返回的 source_project_id、source_id 和 source_type，使用 `tapd_id_str` 精确字符串，拒绝根据已经丢失精度的数字 ID 拼链接。无绑定、权限错误、格式异常分别返回。
- 工作项链接固定使用 `https://tapd.woa.com/tapd_fe/{workspace}/{story|bug|task}/detail/{id}`。工蜂[官方 TAPD API](https://git.woa.com/help/menu/api/tapd.html)确认字段和三种类型；本机已安装 TAPD 工作台的 `server/tapd.ts:596` 使用该路由。对官方文档示例 ID 的 TAPD 原站路径进行了无凭据只读检查，HTTP 200；没有携带工蜂 Token。登录后具体工作项页面尚未人工验收，不能将 HTTP 200 等同页面内容已验证。未知类型保留数据但不给出猜测链接。
- `mr.ci` 按展示的源项目 ID、完整 SHA、目标分支查询 `/projects/:sourceProjectId/commits/:sourceSha/status`，先复核 MR 版本及账号身份，再校验响应 sha。fork 的源项目与目标项目分开处理。版本不一致明确失败，不显示为该版本已通过。
- CI 用 `total_count` 和每页 20 项处理分页；检查为空时状态为 unknown，总数矛盾拒绝，分页空洞标记不完整。链接只允许无用户名／密码的 HTTP(S)，通过宿主 ExternalLink 打开，不由服务端携 Token 抓取。
- UI 的 TAPD、CI 分别查询、刷新和报错，其他描述、差异与讨论保持独立；CI 后续页失败保留已加载检查并标明不完整。只提供摘要和原站入口，不提供触发、批准、完整流水线或日志能力。

## 自动验证

`node --test server/additions.test.ts` 7 项通过；`npm run typecheck` 通过。业务 RPC 测试使用虚构数据和受控 HTTP，覆盖：

- MR 全局 ID 与 iid 分开路由、精确工作项字符串 ID、链接及未知类型。
- 未绑定、403、局部失败保留详情。
- fork 源项目／固定 SHA、版本变化、账号变化和响应 SHA 不一致。
- 多个检查、空检查不是通过、分页、数量矛盾、空洞及不安全链接。

完整套件及两轴审查由集成分支统一执行。

## 真实只读抽样

通过本插件服务端已配置凭据查询已有 MR；只输出数量、字段类型和等式结果，不落真实标题、账号、仓库、工作项 ID、SHA 或凭据。

- TAPD 返回 2 项，source_id 与 MR iid 一致、source_project_id 与目标项目一致，tapd_id_str 为字符串。
- CI 返回 9 项，total_count 为 9，sha 与指定源 SHA 一致。state、sha、context、target_url 为字符串，id、total_count 为数字。
- 当前账号可读取上述样本。[官方提交检测文档](https://git.woa.com/help/menu/api/commit_check.html)要求至少 Developer；这次成功不能证明更低角色也可读取，也没有通过降权实验核定最小角色。403 时 UI 明确提示权限限制，不会申请或扩大权限。

实际登录后的 TAPD／CI 链接点击、深浅主题和紧凑布局按用户选择保留待验收。未触发流水线、创建 TAPD 项、回写工蜂、重载插件或推送。

集成补验：合入 `8d4d5e9` 后已重载运行中的插件，通过实际 daemon RPC 再次核实 TAPD 2 项、CI 9 项及 SHA 一致。登录后链接点击和视觉检查仍未完成；无远程写操作或推送。
