# 任务 01 验证记录

日期：2026-10-22。本记录保留任务 01 阶段的连接验证证据；后续功能现已实现，当前总体范围及待验收项见[集成验收](integrated-acceptance.md)。

## 实现与验证

- Paseo server/client/plugin SDK 0.12.0；本地目录安装的 `gongfeng-workbench` 已加载，重载后仍为 running。
- 用户在实际宿主设置页提交 Token，并确认「已配置成功」。未通过聊天传递 Token。
- 使用官方 CLI 的连接方法调用实际 daemon 的 `connection.status`，首次及修复后重载均返回 `connected`。该 RPC 每次读取服务端配置并请求 `GET https://git.woa.com/api/v3/user`，没有使用账号缓存。
- 认证使用 `PRIVATE-TOKEN` 请求头；成功响应经过契约过滤，仅返回 `id: number`、`username: string`、`name: string`。证据仅记录类型，不记录账号值、原始响应或 Token。
- `npm test`：16 项通过。涵盖配置保存与替换、失败保留旧配置、重载、权限和符号链接检查、HTTP 错误、响应解析及传输中断、输入验证和敏感信息隔离。
- `npm run typecheck` 与 `git diff --check` 通过；`npm pack --dry-run --json` 检查包含 9 个交付文件，无测试、凭据或临时目录。没有执行发布。
- 客户端使用宿主 Settings 组件、主题 tokens、compact 间距和有效 GitBranch 图标。Token 不进入 React Query 的 mutation variables 或数据缓存，提交后清空输入。

## 两轴审查

用户确认固定基线 `6f10cbf`，初次审查实现提交 `eaf9566`。两个独立审查 Agent 分别审阅工程规范及任务 01 规格。

- Standards：未发现规范问题。
- Spec：发现一项 P2，HTTP 响应体传输中断被归类为格式异常。先补回归复现失败，再区分读取与解析错误，修复提交 `6359c45`。两轴复核均通过，无遗留代码发现。

## 验收边界

实际设置页的首次保存已由用户确认，真实只读 OpenAPI 已独立验证。用户明确选择暂不检查深浅主题及手机窄屏，保留待验收。自动化浏览器为独立会话，未通过宿主密码认证，未为此读取或复制宿主凭据。

真实账号的更换失败、令牌撤销、限流、断网和磁盘故障未做破坏性实测，由受控 RPC 集成测试覆盖。PAT 的 api 范围不保证平台只读；本任务只实现固定主机的 GET /user。没有推送、创建远程事项或调用后续业务接口。
