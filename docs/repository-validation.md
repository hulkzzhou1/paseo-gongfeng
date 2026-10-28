# 仓库关联验证

2026-10-22，任务 03。实现工蜂仓库搜索、分页与已有 Paseo 项目的显式持久关联；不创建项目或克隆代码。

## 实现入口

- 命令中心全局入口「工蜂：管理仓库关联」。项目工作区命令「工蜂：关联当前项目仓库」打开相同页面并预选当前项目。多个同 remote 的项目均显示项目 ID 和本地路径，由用户选择。
- `repositories.search` 查询固定工蜂 `/projects`，限定 GIT 类型；`repositories.bindings` 返回当前 daemon 项目及关联核验状态；`repositories.bind` 保存／明确更换；`repositories.unbind` 只删除选定关系。
- 关系保存在 `$PASEO_HOME/plugin-data/gongfeng-workbench/repositories.json`，记录 `daemonId + projectId` 与 `git.woa.com + repository.id`。daemon ID 沿用 0.12 宿主的 `PASEO_SERVER_ID` 或 `server-id` 文件。读取不到身份时返回错误，不凭客户端指定身份保存。
- 自动候选来自本地 Git remote，保留工蜂路径大小写与子组。HTTP(S) 工蜂 clone URL 的 `/git/` 前缀与 SSH 路径不同，已按官方项目 API 示例处理。候选不自动保存。项目不存在、remote 不匹配、远程访问失败均标记需核验。
- `registerRepositories(server, api)` 返回 `{ bind, list }`；后续克隆登记和 Review 可调用同一业务处理器 `(input, { paseo })`，复用关系约束与核验。公共认证由任务 02 的 `GongfengClient` 提供。

## 已执行

- `node --test server/repositories.test.ts`：9 项通过。包含真实临时 Git 仓库、同仓库多项目、重复添加、插件重载、显式更换与过期操作、保存失败保留旧关系、项目失效、remote/权限变化、仅解除关联、daemon 隔离、损坏存储、分页与格式错误。
- `npm run typecheck` 通过。完整套件与最终两轴审查由集成分支统一执行。
- 使用插件服务端已配置凭据，只读请求 `/projects?type=GIT&page=1&per_page=1` 成功。返回数组；样本 `id:number`、`name:string`、`path_with_namespace:string`；存在 `x-next-page`、`x-page`、`x-total-pages` 等分页头。仅输出字段类型、数量和响应头名称，没有保存私有仓库内容或凭据。
- 使用 0.12 `createPaseoApi(...).projects.list()` 读取实际目标 daemon：13 个项目，projectId 唯一；projectId、projectKey、projectRootPath、projectDisplayName 为字符串。未创建、删除或修改宿主项目。

## 待验收

实际两侧入口交互、深浅主题和手机紧凑布局按用户选择保留待验收；未把源码使用主题 tokens 视作视觉验收。没有修改真实仓库关联，未克隆真实私有仓库，未重载插件或远程推送。
