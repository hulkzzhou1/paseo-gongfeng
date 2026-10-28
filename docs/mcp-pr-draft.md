发布补记（2026-10-25）：用户明确授权发布新版，取代下文准备阶段的暂缓安排。已发布 [v0.3.0](https://github.com/hulkzzhou1/paseo-gongfeng/releases/tag/v0.3.0)，并提交 [社区更新 PR #1131](https://github.com/getpaseo/plugins/pull/1131)。公开制品来自独立干净谱系；下文保留为本地实现审查说明，最新证据以 [社区提交记录](community-registry-submission.md) 为准。

## Summary

工蜂设置的MCP开关默认关闭。开启且已连接时，通过现有agent.create Hook，仅为当前host／站点已有效关联工蜂仓库的Paseo项目中新建Agent补入本地HTTP MCP，提供27个显式业务工具。

```text
新Agent的cwd
  → 宿主项目／工作区SDK核对归属
  → 当前host／站点仓库关联有效？
      是 → 保留现有配置，补入gongfeng-workbench连接 → provider直连MCP
      否／未知 → 保持创建请求不变
```

支持关联项目的worktree和子目录；同名MCP连接保留。RPC与MCP共用业务处理、凭据和写队列；写工具要求confirm:true和用户授权。工蜂Token不进入Agent配置、环境、提示词或结果，仅本地临时Bearer进入连接定义。

## Evidence

- **Before:** 工蜂MCP适配依赖fork的registerMcpServer／pluginMcpServers和fork SDK资产。
  **After:** main使用现有创建Hook及官方SDK0.12.0，旧实现完整保留在本地dev（f68f482）。关闭不注入，未关联／失效／歧义项目不注入；已存在Agent配置不自动改写。
- **Before:** 统一管理路径的成功不能证明现有Hook路径及项目边界。
  **After:** 121项相关检查及类型检查通过；隔离beta.901源码测试daemon使用fake provider，证明未关联时无注入、关联后创建配置获得MCP并发现27工具、RPC结果一致、配置轮换及关闭／卸载停端点。无Hosted注册、真实模型或工蜂写入。详见 [验收记录](mcp-adaptation.md)。

## Merge Danger

**Door:** two-way

代码可回退到dev保存的版本。创建Hook不提供统一管理：关闭／卸载停止端点，却不能删除旧Agent配置；重载／更换凭据后旧端点失效，需新建Agent或手动调整其配置。解除仓库关联只影响之后的注入。provider需支持HTTP MCP；新Hook路径尚未重新进行真实provider验收。SDK0.12.0类型通过不等于实测了全部0.12部署。

**Blast Radius:** Gongfeng

本地准备，未创建远程PR或发布。Paseo Hosted MCP PR补充统一管理和插件生命周期管理，并非首次允许插件向Agent提供MCP。工蜂主线不再技术依赖该PR；本轮仍遵守用户之前的暂缓社区发布安排，后续发布需另行推进公开干净谱系，不能推送内部集成历史。
