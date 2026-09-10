#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const apiKeyFile = process.env.PLANE_API_KEY_FILE;
let apiKey = process.env.PLANE_API_KEY;

if (!apiKey && apiKeyFile) {
  try {
    apiKey = readFileSync(apiKeyFile, "utf8").trim();
  } catch {
    console.error(`Plane MCP: no se pudo leer el token en ${apiKeyFile}.`);
    process.exit(1);
  }
}

if (!apiKey) {
  console.error("Plane MCP: falta PLANE_API_KEY o PLANE_API_KEY_FILE.");
  process.exit(1);
}

if (!process.env.PLANE_BASE_URL || !process.env.PLANE_WORKSPACE_SLUG) {
  console.error("Plane MCP: faltan PLANE_BASE_URL o PLANE_WORKSPACE_SLUG.");
  process.exit(1);
}

const packageSpec = process.env.PLANE_MCP_PACKAGE || "plane-mcp-server==0.2.9";
const childEnv = { ...process.env, PLANE_API_KEY: apiKey };
delete childEnv.PLANE_API_KEY_FILE;

const child = spawn("uvx", [packageSpec, "stdio"], {
  env: childEnv,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error("Plane MCP: no se encontró uvx. Instala uv desde https://docs.astral.sh/uv/.");
  } else {
    console.error(`Plane MCP: no se pudo iniciar el servidor: ${error.message}`);
  }
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
