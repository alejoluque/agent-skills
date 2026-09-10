import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { normalizeBaseUrl, normalizeName, parseArgs, run } from "../lib/setup.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const cliPath = join(repositoryRoot, "bin", "plane-agents.mjs");

test("parseArgs accepts setup options", () => {
  const result = parseArgs([
    "setup",
    "--base-url", "https://plane.example.com/",
    "--workspace", "engineering",
    "--project", "PROJ",
    "--clients", "codex",
    "--skip-skill",
    "--skip-verify",
    "--yes",
  ]);
  assert.equal(result.baseUrl, "https://plane.example.com/");
  assert.equal(result.workspace, "engineering");
  assert.equal(result.project, "PROJ");
  assert.deepEqual(result.clients, ["codex"]);
  assert.equal(result.skipSkill, true);
  assert.equal(result.skipVerify, true);
  assert.equal(result.yes, true);
});

test("normalizers reject unsafe or empty values", () => {
  assert.equal(normalizeBaseUrl("https://plane.example.com/"), "https://plane.example.com");
  assert.equal(normalizeName("Plane Team A", "name"), "plane-team-a");
  assert.throws(() => normalizeBaseUrl("file:///tmp/plane"));
  assert.throws(() => normalizeBaseUrl("https://token@plane.example.com"));
  assert.throws(() => normalizeName("***", "name"));
});

test("non-interactive setup requires instance-specific values", async () => {
  await assert.rejects(
    () => run(["setup", "--yes"], {
      output: { write() {} },
    }),
    /--base-url es obligatorio/,
  );
});

test("setup stores the token securely and registers both clients without exposing it", () => {
  const root = mkdtempSync(join(tmpdir(), "plane-agents-test-"));
  const configDirectory = join(root, "config");
  const dataDirectory = join(root, "data");
  const project = join(root, "project");
  const fakeBin = join(root, "bin");
  const commandLog = join(root, "commands.log");
  mkdirSync(project, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });

  for (const command of ["npx", "codex", "claude", "uvx"]) {
    const script = join(fakeBin, command);
    writeFileSync(script, `#!/bin/sh\nprintf '%s' '${command}' >> "$COMMAND_LOG"\nfor arg in "$@"; do printf ' <%s>' "$arg" >> "$COMMAND_LOG"; done\nprintf '\\n' >> "$COMMAND_LOG"\n`, { mode: 0o700 });
    chmodSync(script, 0o700);
  }

  const secret = "plane-secret-that-must-not-leak";
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: configDirectory,
    XDG_DATA_HOME: dataDirectory,
    PATH: `${fakeBin}:${process.env.PATH}`,
    COMMAND_LOG: commandLog,
    PLANE_API_KEY: secret,
  };

  const output = execFileSync(process.execPath, [
    cliPath,
    "setup",
    "--base-url", "https://plane.example.com",
    "--workspace", "engineering",
    "--project", "PROJ",
    "--skip-verify",
    "--yes",
  ], { cwd: project, env, encoding: "utf8" });

  const tokenPath = join(configDirectory, "plane-agents", "plane-engineering", "api-key");
  const log = readFileSync(commandLog, "utf8");
  assert.equal(readFileSync(tokenPath, "utf8"), `${secret}\n`);
  assert.equal(statSync(tokenPath).mode & 0o777, 0o600);
  assert.equal(log.includes(secret), false);
  assert.equal(output.includes(secret), false);
  assert.equal(log.includes(`npx <--yes> <--package> <skills@1> <skills> <add> <${repositoryRoot}/>`), true);
  assert.match(log, /codex <mcp> <add> <plane-engineering>/);
  assert.match(log, /claude <mcp> <add> <plane-engineering> <--scope> <user>/);
  assert.deepEqual(JSON.parse(readFileSync(join(project, ".plane-project.json"), "utf8")), {
    workspace: "engineering",
    project_identifier: "PROJ",
  });
});
