# Agent Skills

Reusable skills for AI coding agents. The repository currently includes `plane-workflow`, a workflow for coordinating software delivery in Plane through MCP.

## Plane workflow

`plane-workflow` keeps Plane authoritative for work items, prevents duplicate tasks, resolves project modules before creation, links verified GitHub evidence, and keeps Plane comments concise.

### One-command setup (recommended)

Run this from the project that will use Plane:

```bash
npx --yes --package github:alejoluque/agent-skills \
  plane-agents setup
```

The installer:

- installs `plane-workflow` globally for Claude Code and Codex;
- asks for the Plane URL, workspace, and Personal Access Token;
- verifies the token and stores it outside repositories with `600` permissions;
- registers one user-level MCP connection per workspace in both clients; and
- creates the non-secret `.plane-project.json` mapping in the current repository.

The connection is named `plane-<workspace>`. Re-running setup updates that managed connection without duplicating it. Projects in the same Plane workspace reuse the connection and only need their own `.plane-project.json`.

For non-interactive setup, supply the token temporarily through the environment rather than a command-line argument:

```bash
PLANE_API_KEY="..." npx --yes \
  --package github:alejoluque/agent-skills \
  plane-agents setup \
  --base-url https://plane.example.com \
  --workspace your-workspace \
  --project PROJ \
  --yes
```

Use `plane-agents setup --help` for client selection and advanced options. The installer requires Node.js 18+, `npx`, `uvx`, and at least one of the `claude` or `codex` CLIs.

### Skill-only installation

Use this when Plane MCP is already configured:

```bash
npx skills add alejoluque/agent-skills \
  --skill plane-workflow \
  --agent codex claude-code \
  --global --yes
```

### Install the skill in one project

Run from that project's root and omit `--global`:

```bash
npx skills add alejoluque/agent-skills \
  --skill plane-workflow \
  --agent codex claude-code \
  --yes
```

Verify the installation with:

```bash
npx skills list --global
```

## Plane MCP configuration

The skill provides workflow instructions. The recommended installer configures the MCP connection with:

- `PLANE_BASE_URL`
- `PLANE_WORKSPACE_SLUG`
- `PLANE_API_KEY`

Keep the API key outside repositories and use a personal key with access only to the required workspace and projects. The installer stores it under `~/.config/plane-agents/` (or `XDG_CONFIG_HOME`) and never places it in `.mcp.json` or `.plane-project.json`. See the [Plane MCP documentation](https://developers.plane.so/dev-tools/mcp-server).

## Select a Plane project per repository

The recommended installer creates this file when `--project` is supplied. To configure it manually, copy the included template:

```bash
cp path/to/plane-workflow/assets/plane-project.example.json .plane-project.json
```

Then set its non-secret project mapping:

```json
{
  "workspace": "your-workspace",
  "project_identifier": "PROJ"
}
```

Do not add tokens or other credentials to this file.

## Update or remove

```bash
npx skills update plane-workflow --global
npx skills remove plane-workflow --global --yes
```

## Contents

- [`SKILL.md`](skills/plane-workflow/SKILL.md): workflow and safety rules.
- [`mcp-operations.md`](skills/plane-workflow/references/mcp-operations.md): Plane MCP operation mapping.
- [`evals.json`](skills/plane-workflow/evals/evals.json): simulation-only evaluation prompts.

## License

MIT. See [LICENSE](LICENSE).
