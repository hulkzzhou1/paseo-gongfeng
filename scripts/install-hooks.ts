import { spawnSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

function git(...args: string[]) {
  return spawnSync("git", args, { encoding: "utf8", timeout: 5000 });
}
try {
  const root = git("rev-parse", "--show-toplevel");
  if (root.status !== 0) throw new Error("Not a worktree");
  process.chdir(root.stdout.trim());
  await access(".githooks/pre-push", constants.X_OK);
  const configured = git("config", "--get", "core.hooksPath");
  if (configured.status === 0 && configured.stdout.trim() !== ".githooks") {
    console.error("已有其他 hooksPath，保留原配置；请手动把 npm run check 接入现有 pre-push。");
    process.exitCode = 1;
  } else if (configured.status === 0 || configured.status === 1) {
    if (configured.status === 1) {
      const hooks = git("rev-parse", "--git-path", "hooks");
      if (hooks.status !== 0) throw new Error("Cannot locate hooks");
      const directory = hooks.stdout.trim();
      const entries = await readdir(directory).catch(error => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const name of entries.filter(name => !name.endsWith(".sample"))) {
        const executable = await access(join(directory, name), constants.X_OK).then(() => true, () => false);
        if (executable) throw new Error("Existing default hook");
      }
    }
    if (git("config", "--local", "core.hooksPath", ".githooks").status !== 0) throw new Error("Cannot configure hooks");
    console.log("已为当前仓库启用 pre-push 检查。");
  } else throw new Error("Cannot read hook configuration");
} catch {
  console.error("未安装 hook：请检查 Git 工作目录、钩子可执行权限，以及默认 hooks 目录是否已有活动钩子。");
  process.exitCode = 1;
}
