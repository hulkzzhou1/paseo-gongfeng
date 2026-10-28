# 工蜂工作台界面改版

Status: ready-for-human
Blocked by: 无

## 用户确认的范围

内部工蜂优先。参考 GitHub 工作台的紧凑列表组织，重做 MR 管理与配置；配置从右上角按钮弹出。MR 详情从右侧展开，代码差异提供增删底色、双侧行号、折叠和换行；描述默认 120 字符摘要，弹窗阅读全文。

仓库管理只显示用户已添加仓库，通过搜索选择弹窗添加，每行单独关联 Paseo 项目。保留旧关联、项目冲突确认、克隆及恢复入口。禁止远程仓库/MR 写操作。

## 实现

- `client/board.tsx`：关系和状态筛选、紧凑行、设置弹窗、保留列表的详情抽屉。
- `client/detail.tsx`、`file-diff.tsx`、`description.tsx`：详情分区、分批显示差异、描述摘要与阅读弹窗。解析器独立测试，不加载描述中的远程图片。
- `client/connection.tsx`：共享配置表单，沿用服务端凭据验证，不回显 Token。
- `client/repositories.tsx`：已添加列表、搜索选择、逐仓库关联弹窗；主页不请求全部远程仓库。
- `server/repositories.ts`、`shared/repositories.ts`：新增本地已添加列表，按 daemon 和内部实例保存；兼容旧关联。添加时重新验证仓库访问与 ID，不接受客户端提供的仓库元数据。

## 验证

验证结果写入 [界面验证](../../../docs/workbench-ui-validation.md)。自动化不调用模型；真实客户端验收使用已有账号及本项目仓库，不公开业务内容或凭据。MR 列表新增所有者英文账号，描述弹窗最高 1040px；待用户验收最终视觉。

## Comments

本任务不实现公网实例切换，也不执行 GitHub 推送或社区发布。MIT 与干净导入等方案已确认，后续单独落实。
