# Paseo 社区目录申请

日期：2026-10-23。用户进一步授权发布社区，本次从公开GitHub源码申请官方插件目录收录，不进行npm发布，也不申请自行审核或合并。

依据当前官方发布文档和getpaseo/plugins REVIEW.md，补齐英文OVERVIEW、完整中文翻译、无真实私有信息的当前界面截图、media字段及打包清单。manifest运行时名称保留“工蜂”，请求目录用listing.name覆盖为英文Gongfeng；中文名通过translations提供。界面仍为中文，不采用尚未发布的运行时国际化API。

说明明确数据去向、服务器Token、外链／图片、Git／SSH、本地文件和项目登记、人工确认后远程写入、部分结果及非原子版本限制，不宣称公网／原生端或真实业务MR写入完成验收。Git安装无额外安装依赖或build命令，private:true保留防止npm误发布。

截图为真实界面的纯前端样例副本，仓库、标题、编号、账号、站点及更新时间均替换为公开示例；不包含宿主其他工作空间、凭据或真实正文。PNG人工检查通过。npm pack --dry-run --ignore-scripts确认49文件中包含所有入口、两种OVERVIEW及图片。统一检查148项通过。

提交状态与固定版本待下方补记。社区审核通过前不能称已收录。

## 提交记录

- 公开固定提交：ae04e40c3ba13e9587e80fafb3c2fd6745fcec29。公开副本pre-push 148项通过；PNG匿名返回HTTP 200、image/png。
- 申请：https://github.com/getpaseo/plugins/issues/1036 ，标题Gongfeng，Source指向该固定提交，分类Git／Workspaces／Sidebar。
- GitHub当前账号没有上游AddLabelsToLabelable权限。CLI创建时submission标签被忽略，随后显式加标签也被GitHub拒绝；Submission工作流39840445993因缺标签而skipped，尚无自动审核PR。不是审核拒绝，也不能称已上架。
- 官方网页表单已在服务器浏览器打开，当前需要GitHub登录，浏览器已交回手动控制。登录后可用官方模板提交带自动标签的申请；确认新申请正常后再关闭无标签的1036，避免重复待办。不读取或转发GitHub密码和Token。
- 当前工作目录另有非本轮尚未提交的Agent接口改动，未纳入上述公开提交，也未覆盖。

## gh 路线完成

用户要求继续使用gh。重新核对上游BOTS.md：接受手工PR，提交普通intake文件即可，不必通过有标签的Issue入口。未尝试提升上游权限或请求用户提供凭据。

从上游main隔离克隆，用官方parseSubmissionIssue／writeSubmission生成submissions/1036.json，只包含原Issue、提交者、固定ae04e40与git／workspaces／sidebar分类；相关官方26项测试通过。通过既有hulkzzhou1/plugins fork的新分支submit/gongfeng-1036提交正式PR：https://github.com/getpaseo/plugins/pull/1040 。上游main和其他分支未修改。

PR为OPEN、非draft，仅新增15行intake申请；Validate已自动启动，后续由社区审核者检查固定制品、补正式record并移除submission文件再合并。未自行批准、填写已审时间或合并。#1036保留作为关联申请，无需浏览器登录。当前状态是已正式提交、待社区审核，尚未上架。

## 校验修复与社区审核通过

用户要求修复失败并使用pr技能整理说明。官方工具在隔离目录生成完整候选条目，本地172项目录测试及在线校验通过（355个记录格式有效、1个变更匹配固定制品）。本地候选提交b0c3b76未推送成功：社区机器人已先将远端分支更新为00447af，非快进拒绝后没有强推或覆盖其结果。已切换到远端完成版本检查。

paseo-bot完成正式plugins/hulkzzhou1/gongfeng.json并删除intake，固定制品仍为ae04e40。GitHub Validate 39890257714通过（172测试、355记录、1变更制品匹配）。官方review于2026-10-23T02:35:21Z为APPROVED，PR于02:35:32Z合并，合并提交2ad227093d22269df15a21802d0a2a493449dd59。Issue1036已关闭，审核意见说明不再需要作者补材料。

PR说明已按Summary／Evidence／Merge Danger重写，包含正式文件结构、失败到通过的证据、CI链接、固定制品、双语说明和样例图片，以及目录回滚不卸载现有安装的影响。最终条目由社区机器人填写，不使用本地未推送候选的日期或冗余媒体覆盖。

Publish运行39890412101已启动，需进一步确认部署成功及公开目录实际可读，不能仅凭合并声称已上线。

## 发布完成

Publish运行39890412101的build和deploy均成功，工蜂条目包含在发布产物中。源站先返回200；公共站点有五分钟后台刷新缓存，等待后正常更新，无需修改任何网站代码或权限。

最终核验：
- https://paseo.sh/plugins/hulkzzhou1/gongfeng ：HTTP200，标题Gongfeng – Paseo plugin。
- https://plugins.paseo.sh/plugins/hulkzzhou1/gongfeng.json ：HTTP200，ID=hulkzzhou1/gongfeng，artifact.commit=ae04e40c3ba13e9587e80fafb3c2fd6745fcec29。
- https://plugins.paseo.sh/index.json ：HTTP200，包含上述ID，generatedAt=2026-10-23T02:38:14.598Z。

社区上架已完成。安装命令：paseo plugin add hulkzzhou1/gongfeng。当前用户daemon仍从本地工作目录运行，未用社区版覆盖安装；未重复模型／真实MR写入验收。既有公网、原生端及业务写入限制继续按公开介绍披露。

## 0.2.0 里程碑更新（2026-10-23）

用户于里程碑实现完成后明确授权“发布新版本，然后提交到社区”，本节替代此前该轮“不自动发布”的交付边界。

- GitHub Release：[Gongfeng v0.2.0](https://github.com/hulkzzhou1/paseo-gongfeng/releases/tag/v0.2.0)，已发布，非草稿、非预发布。版本和 lockfile 均为 0.2.0。
- 公开固定提交：`cc1359dcf4b7aef681d2e295ecbb6c78bd8cf73e`；签注标签 `v0.2.0` 解析到该提交。公开 main 直接继承原公开制品 `ae04e40`，未推送内部历史。
- 仅从本地已提交代码白名单导出里程碑改动，保留原公开开发文件、补更新日志和公开验证范围。其他 Agent 尚未提交的上下文功能、内部验收文档、账号和样本数据未纳入。
- 公开副本使用公共 npm registry 全新安装开发依赖，统一检查155项通过；打包 dry-run 55文件，包含新模块、双语OVERVIEW和既有示例图片，不包含测试、内部任务或上下文功能。未发布 npm 包。
- 更新 PR：[getpaseo/plugins#1057](https://github.com/getpaseo/plugins/pull/1057)，分支 `hulkzzhou1:update/gongfeng-0.2.0`。仅修改本插件目录记录的 artifact／repository commit 并加入版本标签；保留首次发布和提交日期，既有审核时间留给社区审核者更新，没有自行批准或合并。
- PR说明按 pr 技能的 Summary／Evidence／Merge Danger 编写，披露删除和关联回写不能靠代码回滚撤销、部分或未知结果不自动重试，以及原生端／公网／真实故障UI限制。
- 本地可信目录测试172项通过，在线变更校验报告357条记录格式有效、1条变更匹配固定制品。GitHub [Validate 39904994623](https://github.com/getpaseo/plugins/actions/runs/39904994623) 已完成且成功，测试与在线记录校验均通过；PR当前OPEN、尚无审核决定。

新版源码及Release已公开；社区目录目前仍安装原已批准版本，新版需PR审核合并和发布后才可通过目录更新。当前daemon继续使用本地目录安装，没有切换安装来源或重启服务。

## 0.2.0 社区发布完成（2026-10-24 核查）

- 更新 PR #1057 已于2026-10-23T05:34:52Z合并，合并提交 `dc58f108a03b06a4e4d4cc10b0f2c74556807c34`。paseo-bot审核结论为APPROVED，明确无需作者补材料；仅建议下次增加里程碑截图，当前示例图满足本版要求。
- 最终审查头 `4fe425418dd7f1a65c27bbcfd5e67b9ab280ceaf` 的 [Validate 39906482728](https://github.com/getpaseo/plugins/actions/runs/39906482728) 成功。审核者更新审核日期并保留双语介绍、描述及既有图片。
- 已核对后续Publish成功；[线上工蜂目录记录](https://plugins.paseo.sh/plugins/hulkzzhou1/gongfeng.json) HTTP200，`artifact.commit=cc1359dcf4b7aef681d2e295ecbb6c78bd8cf73e`、`reviewedAt=2026-10-23T05:34:04.000Z`。社区目录已提供本次0.2.0制品，不再处于待审核状态。
- 没有重新安装本地插件、替换凭据、重演业务写入或调用模型；原生手机、公网站点与真实故障UI的验收边界不变。

## 0.3.0 MCP 与 MR 状态操作更新（2026-10-25）

用户明确授权发布新版并提交社区，取代此前等待 Hosted MCP PR 的暂缓安排。主线采用官方已有创建 Hook，不依赖 Hosted MCP 管理 API；旧 fork 实现仍保留在本地 dev，未推送内部集成历史。

- [Gongfeng v0.3.0 Release](https://github.com/hulkzzhou1/paseo-gongfeng/releases/tag/v0.3.0) 已公开，非草稿、非预发布。固定提交 `38967a5446cc1a144f4a38d7d19ee9da798115f6`，签注标签 `v0.3.0` 已回读核对。
- 公开 main 从此前公开制品 `cc1359dcf4b7aef681d2e295ecbb6c78bd8cf73e` 新增一个发布提交。只从本地已提交代码导出运行／测试／资源白名单，保留公开开发文件；未复制内部历史、验收账号、凭据、任务与内部文档。84 份导出文件逐字节核对一致。
- 新版提供默认关闭的 27 工具 MCP、仅对有效关联项目的新 Agent 创建注入，以及 MR 确认关闭／重新打开。Token 留在服务器，临时本地 Bearer 进入连接定义；工具结果可能交由调用 Agent 的模型供应商处理。`confirm:true` 只是调用参数守卫，不等于人工确认，调用方仍须取得用户授权。
- 公开副本公共 registry 全新 `npm ci --include=dev --ignore-scripts` 成功；`npm run check` 类型检查和 170 项测试通过，无失败或跳过。公开副本 pre-push 再次通过。打包 dry-run 63 文件，运行入口、双语概览与资源完整，测试／内部数据排除；此次制品为 Git，包含 lockfile，不发布 npm 包。
- 隔离 beta.901 daemon 与 fake provider 验证安装、项目边界、27 工具发现／调用、RPC 一致性、连接轮换、开关／停用／卸载、旧配置保留；Hosted 注册为 false、模型调用 0、真实工蜂写入 0。官方 SDK 0.12.0 类型通过不等于全部 0.12 运行环境实测。
- [社区更新 PR #1131](https://github.com/getpaseo/plugins/pull/1131) 已提交，仅更新本条目的 artifact commit／tag 与 repository commit，保留首次提交／发布／审核字段给社区审核者处理。没有自行批准或合并。
- 可信目录 main 的 `npm test` 172 项通过；`node scripts/validate.ts --online --changed --base origin/main` 退出码 0，375 个记录格式有效，1 个变更匹配固定制品。GitHub [Validate 40110281804](https://github.com/getpaseo/plugins/actions/runs/40110281804) 已完成且成功，测试与记录检查均通过。当前 PR OPEN、待社区审核，尚未合并。

GitHub Release 已发布；社区目录须在 PR 审核合并、发布后才提供 0.3.0，提交 PR 不表示已上架新版。本轮没有切换本地安装来源、修改凭据／生产配置或重启 daemon／已有 Agent。

未验收：新 Hook 路径真实 provider、公网账号、原生手机与真实 MR 状态写入。窄屏宿主弹层的 Escape 关闭仍有限制，取消按钮可用。关闭／重载／配置轮换只停止端点，不更新已保存 Agent 连接；需要新建 Agent 获取新定义。远程写入不随目录回滚撤销，重开 MR 可能重置 OWNERS 并触发现有集成。
