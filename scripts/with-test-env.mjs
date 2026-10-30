import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("用法: node scripts/with-test-env.mjs <command> [args]");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-test",
    DATA_DIR: "data-test",
    KB_PREFIX: "kbtest",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
