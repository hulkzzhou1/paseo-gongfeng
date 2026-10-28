# 克隆并登记项目：实施与验证

2026-10-22，Paseo 0.12。已实现仓库管理页的克隆入口和恢复记录；真实私库克隆、宿主登记及界面验收仍待集成验证。

## 宿主入口

服务器通过 `execFile` 调用 `paseo project create <absolutePath> --home <当前插件 PASEO_HOME> --json`。`--home` 不来自客户端，显式覆盖其他默认 daemon 目标。CLI 自行处理宿主连接认证；插件不读宿主密码。登记后使用处理器上下文中 `paseo.projects.list()` 核对项目 ID 与路径，再复用仓库关联服务保存对应关系。

本机 0.12 依据：CLI `dist/commands/project/create.js:18` 调用 addProject；`dist/utils/daemon-target.js:22` 显式 home 优先；插件 SDK `@getpaseo/client/dist/index.d.ts:127` projects 仅有 list/subscribe。实际读过 `paseo project create --help`，确认 --home 与 --json。没有调用不存在的插件 projects.create。

## 外部副作用与恢复

只允许已通过工蜂 API 验证的项目，按其安全路径构造 `git@git.woa.com:<path>.git`，使用已有 SSH 配置和密钥，强制 BatchMode 与严格 host key 检查。OpenAPI Token 不进入 Git 参数或环境。Git 操作禁 hooks、忽略 system/global 配置与 GIT_CONFIG 注入、不复制 Git 模板、不运行 Paseo setup；不会自动下载 LFS 内容或初始化子模块，其内容需另行核验。

目标须为已有父目录下的全新绝对路径，原目录不覆盖。操作在 daemon home 的 plugin-data/gongfeng-workbench/clones.json 原子记录：已记录目标 → 克隆中 → 克隆完成 → 项目已登记 → 已完成。重试先核对目录身份、remote 以及当前 daemon 项目，登记和绑定失败可以复用已有资源。克隆失败或中断不信任部分内容，保留目录并要求新的目标路径。已完成记录显示项目 ID，可在宿主项目列表查找；插件不负责删除目录或项目。

## 自动检查

`node --test server/clone.test.ts`：10 项通过。临时目录保存真实 Git 仓库；只有工蜂 HTTP、SSH transport 到本地 fixture 及宿主 CLI 边界替换，未模拟内部 clone/绑定实现。

覆盖：成功后重复/重载不重复项目；现有目录和无效路径；登记失败后保留用户后续修改；关联权限与实际存储失败；并发；中断不盲重试；不输出秘密；hooks/setup不执行；Git目录变量隔离；global/system配置与 smudge注入隔离。`npm run typecheck` 通过。类型检查不代表界面或真实宿主流程验收通过。

## 集成后真实验收

1. 用已授权样本仓库 ID，选择专属全新目标，如已有工作目录下 `gongfeng-clone-verification-<时间>`，记录该路径以供后续 Review 验证，不克隆到已有开发目录。
2. 调 `repositories.clone`，输入 `{repositoryId:<工蜂项目ID>,targetPath:<绝对路径>}`；处理较久或连接中断时，先 `repositories.clones({})` 查阶段，不换路径盲重试。
3. 成功应返回 operation.stage=completed 与 projectId。用当前 daemon 项目列表核对 ID/根目录，并检查 `repositories.bindings` 显示相同关系；再次提交原输入应复用该项目。
4. 注册或绑定失败用同一输入恢复。克隆中断需保留原目录，再选择新目标。UI 核对过程、错误和恢复入口；深浅主题及手机窄屏与集成验收一起完成。

本阶段未创建真实用户项目，也未推送、reload 插件或更改其他插件。

2026-10-22 集成补验：运行中的插件完成真实 SSH clone → 当前 daemon 项目登记 → 仓库关联，返回 completed 与 projectId；再次通过实际 repositories.bindings RPC 核验关系 valid 且项目在宿主列表可见。目标是独立临时目录，保留供 Review 验收；没有改动现有开发目录。完整 UI 交互仍待验收。
