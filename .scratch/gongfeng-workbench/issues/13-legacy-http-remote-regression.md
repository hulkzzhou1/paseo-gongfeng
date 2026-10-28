# 修复旧 HTTP remote 的关联回归

Status: ready-for-human
Blocked by: 无

## 范围

独立规格审查在 `ee3ee07 → a9ea764` 中发现：API 站点 HTTPS origin 校验被用于 Git remote 身份匹配，导致原先支持的 HTTP remote 关联变为 remote_changed，Review 项目候选消失。恢复原默认站点的兼容性，不扩展自定义站点 HTTP 支持，不修改 API HTTPS 要求或 Git SSH 获取方式。

## TDD 与证据

沿用用户已确认的业务 RPC＋临时真实 Git 边界，测试放入现有 `server/repositories.test.ts`；只模拟工蜂 HTTP 与宿主项目列表，不模拟内部匹配函数。

1. 先补回归测试，执行 `node --test --test-name-pattern='旧HTTP remote' server/repositories.test.ts`，观察失败：实际 remote_changed，预期 valid。
2. 最小修复：原默认站点允许默认端口的 HTTP Git remote 参与身份匹配，继续校验 hostname、路径与端口；所有 API 请求仍使用 HTTPS。
3. 同一测试通过；覆盖带／不带 git/ 前缀的已有 remote，插件重载后关联有效；错误主机、非默认 HTTP 端口和错误仓库路径仍失效。
4. `npm run check`：任务状态、TypeScript、132/132 测试通过，`git diff --check` 通过。

P3 纯转发包装建议不属于本次行为修复，保留。没有真实模型调用，没有访问真实 HTTP Git remote、修改 Token 或用户项目。
