# Agent Skills

Reusable skills for AI coding agents. The repository currently includes `plane-workflow`, a workflow for coordinating software delivery in Plane through MCP.

## Plane workflow

`plane-workflow` keeps Plane authoritative for work items, prevents duplicate tasks, resolves project modules before creation, links verified GitHub evidence, and keeps Plane comments concise.

### Install globally

Use this when the same workflow should be available in every repository:

```bash
npx skills add alejoluque/agent-skills \
  --skill plane-workflow \
  --agent codex claude-code \
  --global --yes
```

### Install in one project

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

## Plane MCP requirement

The skill provides workflow instructions; it does not include credentials or automatically install Plane MCP. Configure a Plane MCP server separately with:

- `PLANE_BASE_URL`
- `PLANE_WORKSPACE_SLUG`
- `PLANE_API_KEY`

Keep the API key outside repositories and use a personal key with access only to the required workspace and projects. See the [Plane MCP documentation](https://developers.plane.so/dev-tools/mcp-server).

## Select a Plane project per repository

When one Plane workspace contains several projects, copy the included template to the repository that will use the skill:

```bash
cp path/to/plane-workflow/assets/plane-project.example.json .plane-project.json
```

Then set its non-secret project mapping:

```json
{
  "workspace": "your-workspace",
  "project_identifier": "APP"
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
