# 主线通过创建Hook注入工蜂MCP

Status: ready-for-human

## 范围

用户要求将依赖非主线Hosted MCP管理的实现保存在dev，main使用现有agent.create Hook向新Agent的config.mcpServers注入连接。agent.session_open只允许env修改，不用来注入MCP。不修改Paseo仓库或实现Hosted MCP管理，不创建／删除业务Agent，不发布。

当前完整版本f68f482保存为本地dev；main先快进保留现有MR／里程碑／MCP业务能力，再替换注入方式。Agent创建请求保留cwd、provider、模型、环境、已有MCP；同名gongfeng-workbench连接保留不覆盖。开关默认关闭且复用已有设置；开启且已配置时，仅向当前host／站点已有效关联工蜂仓库的Paseo项目中新建Agent注入。归属由正式项目／工作区SDK与插件关联确认，支持worktree、子目录和符号链接；未关联、失效、无权限或歧义时不注入，不能只看remote。嵌套未关联项目不继承父项目关联，归属查询中端点变化不注入旧连接。关闭／未配置不注入。开关关闭、配置轮换、插件停用／卸载均停止旧端点，但不删除或自动更新已持久化的Agent连接配置。新端点需要新建Agent采用；不声称恢复／刷新时重新注入。

复用现有本地HTTP MCP、凭据／队列／27工具和RPC。Token不写入Agent配置；仅本地随机Bearer进入MCP连接定义。SDK／manifest恢复官方0.12.0基线，不保留fork资产依赖或pluginMcpServers门槛。

## 验证

官方SDK类型检查；相关Hook／MCP／RPC回归；隔离测试daemon和fake provider验证创建注入、默认关闭、旧配置不变、工具发现／调用与RPC一致、配置轮换、关闭、停用和卸载。仅临时数据与虚构工蜂响应，模型0、真实工蜂写入0；不跑全套。生产只重载本插件，不重启daemon或已有Agent。

## 文档与交付

更正开关、README／双语概览／PR草稿和规范记录：Hook已可让插件向新Agent提供MCP；Hosted MCP PR补充的是统一管理和生命周期管理。main不再技术依赖该PR，但之前的暂缓社区发布安排继续有效，本轮不推送／发布。

## Comments

2026-10-25 用户随后明确授权“发布新版本提交到社区”，替代上文发布限制；执行见issues/02-release.md和docs/community-registry-submission.md。

main c2b43ad已本机重载，dev f68f482保留原实现。官方SDK0.12.0类型检查、121项相关检查及无Hosted注册的隔离创建Hook链路通过；真实provider未重跑。当前连接与MCP开关保持，未推送或发布，详见docs/mcp-adaptation.md。
