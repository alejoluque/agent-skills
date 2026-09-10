import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUNNER_SOURCE = fileURLToPath(new URL("./run-plane-mcp.mjs", import.meta.url));

const HELP = `Configura plane-workflow y Plane MCP para Claude Code y Codex.

Uso:
  plane-agents setup [opciones]

Opciones:
  --base-url <url>       URL de la instancia de Plane
  --workspace <slug>     Slug del workspace de Plane
  --project <id>         Identificador del proyecto para .plane-project.json
  --server-name <name>   Nombre MCP (por defecto: plane-<workspace>)
  --clients <lista>      codex,claude (por defecto: ambos)
  --api-key-file <ruta>  Lee el token desde un archivo
  --skip-skill           No instala la skill con npx skills
  --skip-verify          No valida el token contra Plane
  --yes                  Usa valores por defecto sin preguntas opcionales
  --help                 Muestra esta ayuda

El token también puede suministrarse temporalmente mediante PLANE_API_KEY.
Nunca se escribe en el repositorio ni se pasa como argumento a otro proceso.`;

export function parseArgs(argv) {
  const args = [...argv];
  const command = args[0]?.startsWith("-") ? "setup" : (args.shift() || "help");
  const options = {
    command,
    clients: ["codex", "claude"],
    skipSkill: false,
    skipVerify: false,
    yes: false,
  };

  const valueOptions = new Map([
    ["--base-url", "baseUrl"],
    ["--workspace", "workspace"],
    ["--project", "project"],
    ["--server-name", "serverName"],
    ["--api-key-file", "apiKeyFile"],
  ]);

  while (args.length) {
    const argument = args.shift();
    if (argument === "--help" || argument === "-h") {
      options.command = "help";
    } else if (argument === "--skip-skill") {
      options.skipSkill = true;
    } else if (argument === "--skip-verify") {
      options.skipVerify = true;
    } else if (argument === "--yes" || argument === "-y") {
      options.yes = true;
    } else if (argument === "--clients") {
      const value = requireValue(argument, args.shift());
      options.clients = value.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = requireValue(argument, args.shift());
    } else {
      throw new Error(`Opción desconocida: ${argument}`);
    }
  }

  if (!new Set(["setup", "help"]).has(options.command)) {
    throw new Error(`Comando desconocido: ${options.command}`);
  }

  const invalidClients = options.clients.filter((client) => !["codex", "claude"].includes(client));
  if (invalidClients.length) {
    throw new Error(`Cliente no reconocido: ${invalidClients.join(", ")}`);
  }

  return options;
}

function requireValue(option, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Falta el valor de ${option}`);
  }
  return value;
}

export function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`URL de Plane inválida: ${value}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("La URL de Plane debe usar http o https.");
  }
  if (url.username || url.password) {
    throw new Error("La URL de Plane no debe contener credenciales.");
  }
  return url.toString().replace(/\/$/, "");
}

export function normalizeName(value, label) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error(`${label} no puede estar vacío.`);
  }
  return normalized;
}

function requiredInput(value, option) {
  if (!value) {
    throw new Error(`${option} es obligatorio en modo no interactivo.`);
  }
  return value;
}

function configRoot(env) {
  return env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
}

function dataRoot(env) {
  return env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local", "share");
}

function safeChildEnv(env) {
  const childEnv = { ...env };
  delete childEnv.PLANE_API_KEY;
  return childEnv;
}

function commandExists(command, env) {
  const result = spawnSync(command, ["--version"], {
    env: safeChildEnv(env),
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

function runCommand(command, args, env, { ignoreFailure = false } = {}) {
  const result = spawnSync(command, args, {
    env: safeChildEnv(env),
    encoding: "utf8",
  });
  if (result.error && !ignoreFailure) {
    throw new Error(`No se pudo ejecutar ${command}: ${result.error.message}`);
  }
  if (result.status !== 0 && !ignoreFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${command} terminó con error${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

function createPrompter(input, output) {
  const mutedOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!mutedOutput.muted) output.write(chunk, encoding);
      callback();
    },
  });
  mutedOutput.muted = false;
  const readline = createInterface({ input, output: mutedOutput, terminal: Boolean(input.isTTY) });

  return {
    ask(question, defaultValue = "") {
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      return new Promise((resolveAnswer) => {
        readline.question(`${question}${suffix}: `, (answer) => resolveAnswer(answer.trim() || defaultValue));
      });
    },
    secret(question) {
      if (!input.isTTY) {
        throw new Error("No hay una terminal interactiva. Usa PLANE_API_KEY o --api-key-file.");
      }
      return new Promise((resolveAnswer) => {
        readline.question(`${question}: `, (answer) => {
          mutedOutput.muted = false;
          output.write("\n");
          resolveAnswer(answer.trim());
        });
        mutedOutput.muted = true;
      });
    },
    close() {
      readline.close();
    },
  };
}

function readToken(options, tokenPath, env, prompter) {
  if (options.apiKeyFile) {
    try {
      return readFileSync(resolve(options.apiKeyFile), "utf8").trim();
    } catch {
      throw new Error(`No se pudo leer --api-key-file: ${options.apiKeyFile}`);
    }
  }
  if (env.PLANE_API_KEY) return env.PLANE_API_KEY.trim();
  if (existsSync(tokenPath)) return readFileSync(tokenPath, "utf8").trim();
  return prompter.secret("Personal Access Token de Plane");
}

async function verifyToken(baseUrl, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${baseUrl}/api/v1/users/me/`, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Plane rechazó la conexión (HTTP ${response.status}).`);
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Plane no respondió en 30 segundos.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function atomicWrite(path, contents, mode) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, contents, { mode });
    chmodSync(temporaryPath, mode);
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function installRuntime(runnerPath, tokenPath, apiKey) {
  mkdirSync(dirname(runnerPath), { recursive: true, mode: 0o700 });
  copyFileSync(RUNNER_SOURCE, runnerPath);
  chmodSync(runnerPath, 0o700);
  atomicWrite(tokenPath, `${apiKey}\n`, 0o600);
}

function installSkill(env) {
  if (!commandExists("npx", env)) {
    throw new Error("No se encontró npx; instala Node.js antes de instalar la skill.");
  }
  runCommand("npx", [
    "--yes",
    "skills",
    "add",
    PACKAGE_ROOT,
    "--skill",
    "plane-workflow",
    "--agent",
    "codex",
    "claude-code",
    "--global",
    "--yes",
  ], env);
}

function registerCodex(serverName, runnerPath, tokenPath, baseUrl, workspace, env) {
  if (!commandExists("codex", env)) return false;
  runCommand("codex", ["mcp", "remove", serverName], env, { ignoreFailure: true });
  runCommand("codex", [
    "mcp", "add", serverName,
    "--env", `PLANE_BASE_URL=${baseUrl}`,
    "--env", `PLANE_WORKSPACE_SLUG=${workspace}`,
    "--env", `PLANE_API_KEY_FILE=${tokenPath}`,
    "--", process.execPath, runnerPath,
  ], env);
  return true;
}

function registerClaude(serverName, runnerPath, tokenPath, baseUrl, workspace, env) {
  if (!commandExists("claude", env)) return false;
  runCommand("claude", ["mcp", "remove", "--scope", "user", serverName], env, { ignoreFailure: true });
  runCommand("claude", [
    "mcp", "add", serverName, "--scope", "user", "--transport", "stdio",
    "-e", `PLANE_BASE_URL=${baseUrl}`,
    "-e", `PLANE_WORKSPACE_SLUG=${workspace}`,
    "-e", `PLANE_API_KEY_FILE=${tokenPath}`,
    "--", process.execPath, runnerPath,
  ], env);
  return true;
}

function writeProjectMapping(project, workspace, cwd) {
  if (!project) return "omitted";
  const target = join(cwd, ".plane-project.json");
  const expected = { workspace, project_identifier: project.trim().toUpperCase() };
  if (existsSync(target)) {
    let current;
    try {
      current = JSON.parse(readFileSync(target, "utf8"));
    } catch {
      throw new Error(`${target} ya existe pero no contiene JSON válido.`);
    }
    if (current.workspace !== expected.workspace || current.project_identifier !== expected.project_identifier) {
      throw new Error(`${target} ya apunta a otro workspace o proyecto; no se modificó.`);
    }
    return "unchanged";
  }
  atomicWrite(target, `${JSON.stringify(expected, null, 2)}\n`, 0o644);
  return "created";
}

export async function run(argv, context = {}) {
  const options = parseArgs(argv);
  const output = context.output || process.stdout;
  const input = context.input || process.stdin;
  const env = context.env || process.env;
  const cwd = context.cwd || process.cwd();

  if (options.command === "help") {
    output.write(`${HELP}\n`);
    return;
  }

  const prompter = createPrompter(input, output);
  try {
    const baseUrlInput = options.baseUrl || (options.yes
      ? requiredInput(options.baseUrl, "--base-url")
      : await prompter.ask("URL de Plane"));
    const workspaceInput = options.workspace || (options.yes
      ? requiredInput(options.workspace, "--workspace")
      : await prompter.ask("Workspace de Plane"));
    const baseUrl = normalizeBaseUrl(baseUrlInput);
    const workspace = normalizeName(workspaceInput, "El workspace");
    const project = options.project === undefined && !options.yes
      ? await prompter.ask("Identificador del proyecto (opcional)")
      : options.project;
    const serverName = normalizeName(options.serverName || `plane-${workspace}`, "El nombre MCP");
    const tokenPath = join(configRoot(env), "plane-agents", serverName, "api-key");
    const runnerPath = join(dataRoot(env), "plane-agents", "run-plane-mcp.mjs");
    const apiKey = await readToken(options, tokenPath, env, prompter);

    if (!apiKey) throw new Error("El token de Plane no puede estar vacío.");
    delete env.PLANE_API_KEY;

    if (!options.skipVerify) {
      output.write("Verificando acceso a Plane...\n");
      await verifyToken(baseUrl, apiKey);
    }

    if (!commandExists("uvx", env)) {
      throw new Error("No se encontró uvx. Instala uv desde https://docs.astral.sh/uv/.");
    }
    if (!options.clients.some((client) => commandExists(client, env))) {
      throw new Error(`No se encontró ninguno de los clientes solicitados: ${options.clients.join(", ")}.`);
    }

    installRuntime(runnerPath, tokenPath, apiKey);
    if (!options.skipSkill) {
      output.write("Instalando plane-workflow...\n");
      installSkill(env);
    }

    const registered = [];
    const unavailable = [];
    for (const client of options.clients) {
      const ok = client === "codex"
        ? registerCodex(serverName, runnerPath, tokenPath, baseUrl, workspace, env)
        : registerClaude(serverName, runnerPath, tokenPath, baseUrl, workspace, env);
      (ok ? registered : unavailable).push(client);
    }

    const mapping = writeProjectMapping(project, workspace, cwd);
    output.write(`\nPlane MCP: ${serverName}\n`);
    output.write(`Clientes: ${registered.join(", ") || "ninguno"}\n`);
    if (unavailable.length) output.write(`No instalados: ${unavailable.join(", ")}\n`);
    output.write(`Token: ${tokenPath} (permisos 600)\n`);
    if (mapping === "created") output.write(`Proyecto: ${join(cwd, ".plane-project.json")}\n`);
    if (mapping === "unchanged") output.write("Proyecto: .plane-project.json ya estaba configurado.\n");
    output.write("Reinicia Claude/Codex y comprueba la conexión con /mcp.\n");
  } finally {
    prompter.close();
  }
}
