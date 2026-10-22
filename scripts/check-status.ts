import { glob, readFile } from "node:fs/promises";

try {
  const labels = await readFile("docs/agents/triage-labels.md", "utf8");
  const allowed = new Set([...labels.matchAll(/^- ([a-z][a-z-]+)：/gm)].map(match => match[1]));
  if (!allowed.size) throw new Error("Missing labels");
  let count = 0;
  for await (const file of glob(".scratch/*/{spec.md,issues/*.md}")) {
    const content = await readFile(file, "utf8");
    const states = [...content.matchAll(/^(?:Status:|\*\*Status:\*\*)[ \t]*(.*)$/gm)];
    if (states.length !== 1 || !allowed.has(states[0][1].trim())) {
      console.error(`${file}: 需要且只能有一个 Status，取值见 docs/agents/triage-labels.md。`);
      process.exitCode = 1;
    }
    count++;
  }
  if (!count) throw new Error("Missing tracker files");
  if (!process.exitCode) console.log(`任务状态检查通过（${count} 个文件）。`);
} catch {
  console.error("无法检查任务状态，请在仓库根目录运行并检查本地任务及标签文档。");
  process.exitCode = 1;
}
