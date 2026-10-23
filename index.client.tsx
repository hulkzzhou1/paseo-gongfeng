import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { MRDetail } from "./client/detail.tsx";
import { Milestones } from "./client/milestones.tsx";
import { Board } from "./client/board.tsx";
import { RepositoryManagement } from "./client/repositories.tsx";
import { ConnectionSettings } from "./client/connection.tsx";

export default function contribute(client: PluginClientContext) {
  const removeRepositories = client.addScreen({ id: "repositories", title: "工蜂仓库管理", Component: props => <RepositoryManagement {...props} onBack={() => client.openScreen({ screenId: "board" })} /> });
  const removeRepositoriesCommand = client.addCommandCenterItem({ id: "repositories", title: "工蜂：仓库管理", icon: "GitBranch", context: "global", onSelect: ({ openScreen }) => openScreen({ screenId: "repositories" }) });
  const removeProjectCommand = client.addCommandCenterItem({ id: "project-repository", title: "工蜂：关联当前项目仓库", icon: "GitBranch", context: "workspace", onSelect: ({ workspace, openScreen }) => openScreen({ screenId: "repositories", params: { projectId: workspace.projectId } }) });
  const removeSettings = client.addSettingsScreen({
    id: "connection", title: "工蜂连接", icon: "GitBranch", Component: ConnectionSettings,
  });
  const openMilestone = (reference: { siteUrl?: string; accountId: number; projectId: number; milestoneId: number }) => client.openScreen({ screenId: "milestones", params: { siteUrl: reference.siteUrl ?? "", accountId: String(reference.accountId), projectId: String(reference.projectId), milestoneId: String(reference.milestoneId) } });
  const removeMilestones = client.addScreen({ id: "milestones", title: "工蜂里程碑", Component: props => <Milestones {...props} onMergeRequests={() => client.openScreen({ screenId: "board" })} onManageRepositories={() => client.openScreen({ screenId: "repositories" })} /> });
  const removeBoard = client.addScreen({ id: "board", title: "工蜂 MR", Component: (props) => <Board {...props} onManageRepositories={() => client.openScreen({ screenId: "repositories" })} onOpenMilestones={params => client.openScreen({ screenId: "milestones", params })} /> });
  const removeDetail = client.addScreen({ id: "mr-detail", title: "工蜂 MR 详情", Component: (props) => <MRDetail {...props} onOpenMilestone={openMilestone} onBack={() => client.openScreen({ screenId: "board" })} /> });
  const removeBoardCommand = client.addCommandCenterItem({
    id: "open-gongfeng-board", title: "工蜂：MR 看板", icon: "GitBranch", context: "global",
    onSelect: ({ openScreen }) => openScreen({ screenId: "board" }),
  });
  const removeSidebar = client.addSidebarHeaderItem({
    id: "gongfeng", title: "工蜂",
    Component: ({ openScreen, currentScreen }) => <SidebarRow icon="GitBranch" active={currentScreen?.screenId === "board" || currentScreen?.screenId === "milestones"} onPress={() => openScreen({ screenId: "board" })} />,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "connect-gongfeng", title: "工蜂：连接设置", icon: "GitBranch", context: "global",
    onSelect: ({ openSettings }) => openSettings("connection"),
  });
  return () => { removeMilestones(); removeDetail(); removeBoardCommand(); removeBoard(); removeProjectCommand(); removeRepositoriesCommand(); removeRepositories(); removeCommand(); removeSidebar(); removeSettings(); };
}
