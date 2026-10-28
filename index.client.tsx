import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { WorkbenchBoundary } from "./client/draft-guard.tsx";
import { Issues } from "./client/issues.tsx";
import type { IssueRef } from "./shared/issues.ts";
import { MRDetail } from "./client/detail.tsx";
import { Milestones } from "./client/milestones.tsx";
import { Board } from "./client/board.tsx";
import { RepositoryManagement } from "./client/repositories.tsx";
import { ConnectionSettings } from "./client/connection.tsx";

export default function contribute(client: PluginClientContext) {
  const removeRepositories = client.addScreen({ id: "repositories", title: "工蜂仓库管理", Component: props => <WorkbenchBoundary {...props}>{go => <RepositoryManagement {...props} onBack={() => go(() => client.openScreen({ screenId: "board" }))} onIssues={() => go(() => openIssue())} onMilestones={() => go(() => client.openScreen({ screenId: "milestones" }))} />}</WorkbenchBoundary> });
  const removeRepositoriesCommand = client.addCommandCenterItem({ id: "repositories", title: "工蜂：仓库管理", icon: "GitBranch", context: "global", onSelect: ({ openScreen }) => openScreen({ screenId: "repositories" }) });
  const removeProjectCommand = client.addCommandCenterItem({ id: "project-repository", title: "工蜂：关联当前项目仓库", icon: "GitBranch", context: "workspace", onSelect: ({ workspace, openScreen }) => openScreen({ screenId: "repositories", params: { projectId: workspace.projectId } }) });
  const removeSettings = client.addSettingsScreen({
    id: "connection", title: "工蜂连接", icon: "GitBranch", Component: props => <WorkbenchBoundary {...props}>{() => <ConnectionSettings {...props} />}</WorkbenchBoundary>,
  });
  const openMilestone = (reference: { siteUrl?: string; accountId: number; projectId: number; milestoneId: number }) => client.openScreen({ screenId: "milestones", params: { siteUrl: reference.siteUrl ?? "", accountId: String(reference.accountId), projectId: String(reference.projectId), milestoneId: String(reference.milestoneId) } });
  const openIssue = (ref?: IssueRef) => client.openScreen({ screenId: "issues", params: ref ? { siteUrl: ref.siteUrl ?? "", accountId: String(ref.accountId), projectId: String(ref.projectId), issueId: String(ref.issueId) } : undefined });
  const removeIssues = client.addScreen({ id: "issues", title: "工蜂议题", Component: props => <WorkbenchBoundary {...props}>{go => <Issues {...props} onMergeRequests={() => go(() => client.openScreen({ screenId: "board" }))} onMilestones={params => go(() => client.openScreen({ screenId: "milestones", params }))} onManageRepositories={() => go(() => client.openScreen({ screenId: "repositories" }))} />}</WorkbenchBoundary> });
  const removeMilestones = client.addScreen({ id: "milestones", title: "工蜂里程碑", Component: props => <WorkbenchBoundary {...props}>{go => <Milestones {...props} onIssues={ref => go(() => openIssue(ref))} onMergeRequests={() => go(() => client.openScreen({ screenId: "board" }))} onManageRepositories={() => go(() => client.openScreen({ screenId: "repositories" }))} />}</WorkbenchBoundary> });
  const removeBoard = client.addScreen({ id: "board", title: "工蜂 MR", Component: props => <WorkbenchBoundary {...props}>{go => <Board {...props} onIssues={() => go(() => openIssue())} onManageRepositories={() => go(() => client.openScreen({ screenId: "repositories" }))} onOpenMilestones={params => go(() => client.openScreen({ screenId: "milestones", params }))} />}</WorkbenchBoundary> });
  const removeDetail = client.addScreen({ id: "mr-detail", title: "工蜂 MR 详情", Component: props => <WorkbenchBoundary {...props}>{go => <MRDetail {...props} onOpenMilestone={ref => go(() => openMilestone(ref))} onBack={() => go(() => client.openScreen({ screenId: "board" }))} />}</WorkbenchBoundary> });
  const removeBoardCommand = client.addCommandCenterItem({
    id: "open-gongfeng-board", title: "工蜂：MR 看板", icon: "GitBranch", context: "global",
    onSelect: ({ openScreen }) => openScreen({ screenId: "board" }),
  });
  const removeSidebar = client.addSidebarHeaderItem({
    id: "gongfeng", title: "工蜂",
    Component: ({ openScreen, currentScreen }) => <SidebarRow icon="GitBranch" active={currentScreen?.screenId === "board" || currentScreen?.screenId === "milestones" || currentScreen?.screenId === "issues"} onPress={() => openScreen({ screenId: "board" })} />,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "connect-gongfeng", title: "工蜂：连接设置", icon: "GitBranch", context: "global",
    onSelect: ({ openSettings }) => openSettings("connection"),
  });
  return () => { removeIssues(); removeMilestones(); removeDetail(); removeBoardCommand(); removeBoard(); removeProjectCommand(); removeRepositoriesCommand(); removeRepositories(); removeCommand(); removeSidebar(); removeSettings(); };
}
