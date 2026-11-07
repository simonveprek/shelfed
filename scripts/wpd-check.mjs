/*
 * Checks the Windows helper was built right, on a computer with no Kindle: it
 * starts, makes each COM object it will need, and can list devices.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const helper = spawn(resolve(import.meta.dirname, "..", "resources", "kindle-wpd.exe"), [], { stdio: ["pipe", "pipe", "inherit"] });
let output = "";
helper.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
helper.stdin.write(`${JSON.stringify({ id: 1, cmd: "check" })}\n${JSON.stringify({ id: 2, cmd: "devices" })}\n${JSON.stringify({ id: 3, cmd: "nonsense" })}\n`);
helper.stdin.end();
helper.on("exit", (code) => {
  const answers = output.trim().split("\n").map((line) => JSON.parse(line));
  const fine = code === 0 && answers[0]?.ok === true && answers[1]?.ok === true && Array.isArray(answers[1].result) && answers[2]?.ok === false;
  console.log(output);
  if (!fine) {
    console.error("The Kindle helper isn't working");
    process.exit(1);
  }
});
