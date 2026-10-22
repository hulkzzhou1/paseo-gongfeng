import { readFile } from "node:fs/promises";

const [pid, ...extra] = process.argv.slice(2);
if (!pid || !/^[1-9][0-9]*$/.test(pid) || !Number.isSafeInteger(Number(pid)) || extra.length) {
  console.error("用法：npm run diagnose:process -- <正整数 PID>");
  process.exitCode = 1;
} else {
  try {
    // Linux stat contains process metadata, never argv or environment values.
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const match = stat.match(/^(\d+) \((.*)\) ([A-Za-z]) /s);
    if (!match || match[1] !== pid) throw new Error("Invalid process metadata");
    console.log(JSON.stringify({ pid: Number(pid), name: match[2], state: match[3] }));
  } catch {
    console.error("进程不存在、无权读取或当前系统不支持 Linux /proc 诊断。");
    process.exitCode = 1;
  }
}
