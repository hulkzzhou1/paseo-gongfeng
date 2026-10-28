# 申请 Paseo 社区插件收录

Status: ready-for-human
Blocked by: 无

用户在GitHub公开源码后进一步要求发布社区，本轮按Paseo官方插件目录流程准备并提交收录申请，不进行npm发布，不导入内部Git历史或数据。

读取当前官方publishing文档及getpaseo/plugins REVIEW.md。提供英文默认介绍、简体中文翻译、数据去向及读写权限说明、版本和公开SaaS／原生端验收限制。保持中文界面与既有插件ID。

视觉资产使用当前界面的样例数据截图，所有仓库、标题、编号、账号、站点和更新时间均替换为明确示例；完整遮挡宿主的其他界面，不公开实际MR或凭据。

固定公开GitHub提交，使用官方submission标签和Source／Categories表单格式提交一次申请。等待社区审核，不能将提交申请声称为已收录；跟进机器人明确的可修复要求，不自行审核或合并自己的收录PR。

申请#1036已创建，固定ae04e40。缺submission标签导致自动工作流跳过；GitHub拒绝当前账号加标签，官方网页表单需要用户登录。材料和148项检查已完成，尚未收录。见docs/community-registry-submission.md。

用户要求gh后，已按官方支持的手工PR流程解决入口问题：正式收录PR #1040（OPEN、非draft），只新增标准submissions/1036.json，关联原Issue并固定ae04e40。26项官方intake测试通过，Validate已启动；无需浏览器登录。现等待社区审核，不表示已上架。

后续修复：社区机器人已补正式条目，CI39890257714通过；PR1040已APPROVED并于2026-10-23T02:35:32Z合并，Issue1036关闭。pr技能要求的Summary／Evidence／Merge Danger已更新。正在确认Publish部署与公开目录。

最终完成：Publish39890412101的构建／部署成功；社区页面、默认安装文档及公共目录索引均HTTP200，目录包含hulkzzhou1/gongfeng，发布pin与审核ae04e40一致。社区上架已完成，未覆盖用户本地插件安装或其他Agent改动。
