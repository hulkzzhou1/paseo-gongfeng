# 本地开发 SDK

源自官方 Paseo 主线提交 `6b7d49f0d8d21d01565f9517a8c2a30e2a587e2a` 的 `packages/plugin`，版本标识 0.13.2。使用已构建的 dist 执行 `npm pack --ignore-scripts`，不运行发布或安装钩子。

快照：`getpaseo-plugin-0.13.2-main-6b7d49f0.tgz`。
SHA-256：`cc19c95461c1831ffeb70780f0b7e4dbdc7de4fbe57313765ca7bc3a7b5fc5a4`。

用途仅是锁定已部署主线的 `defineAgentTool` 及 session-open tools 类型。同为 0.13.2 的公开 npm SDK 未包含此接口，不可直接替换。官方发布对应 SDK 后应换回公开版本，并核对宿主最低版本，再考虑发行。

保留上游 Apache-2.0 许可证 `LICENSE-Paseo`。该目录不在插件交付包 files 清单内，Paseo 运行时提供 SDK；不是插件运行依赖。
