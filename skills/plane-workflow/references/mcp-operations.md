# Plane MCP operations

Use this reference only while performing live Plane operations. The MCP server's current tool descriptions are authoritative if names or parameters differ.

Plane MCP tool names vary by server release. Some releases group operations by resource and action; legacy 0.2.x releases expose direct tools such as `list_modules` and `manage_module_work_items`. Clients may add their own prefixes. Always prefer the tool descriptions visible in the current session.

## Resolve identifiers

- List projects and match the exact project name or readable identifier before using its UUID.
- `workitem.retrieve_by_identifier` accepts a readable identifier such as `APP-42`.
- Other work-item actions normally require `project_id` and the work-item UUID.
- List or resolve state, label, type, member, cycle, module, milestone, and assignee UUIDs before writing them.
- For complex list filters, obtain the current PQL reference before composing PQL. UUID-backed PQL fields require UUIDs.

## Core work-item flow

| Intent | Resource and action | Important behavior |
| --- | --- | --- |
| Search workspace | `workitem.search` | Search meaningful terms before creating |
| List/filter | `workitem.list` | Project is optional; supports PQL and pagination |
| Read by key | `workitem.retrieve_by_identifier` | Accepts `PROJECT-N`, for example `APP-42` |
| Read by UUID | `workitem.retrieve` | Requires project and work-item UUIDs |
| Create | `workitem.create` | Requires project UUID and name |
| Update | `workitem.update` | Changes only fields supplied |
| Archive | `workitem.archive` | Only completed or cancelled items can be archived |
| Delete | `workitem.delete` | Destructive; require explicit user confirmation |

Valid standard priorities are `urgent`, `high`, `medium`, `low`, and `none`. Prefer plain-text `description_stripped` unless structured HTML is needed; if both are sent, HTML wins.

## Comments, activity, and evidence

| Intent | Resource and action |
| --- | --- |
| Read comments | `workitem_comment.list` |
| Add a comment | `workitem_comment.create` |
| Read change history | `workitem_activity.list` |
| List external links | `workitem_link.list` |
| Attach a PR or branch URL | `workitem_link.create` |
| Relate or block work | `workitem_relation.create` |

Comments use HTML in the current MCP surface. Escape user-controlled content instead of constructing unsafe markup. Link deletion and comment deletion are destructive.

### Compact comment policy

- Prefer Plane fields, activity history, and external links over prose comments.
- Do not post comments for routine field changes or successful synchronization.
- When context is necessary, use one sentence or at most three short lines and target 300 characters or fewer, excluding URLs.
- Include only outcome, compact evidence, and a pending action when one exists.
- Summarize validation names and results; never paste command lines, logs, file lists, token counts, or MCP output.
- Do not repeat the work-item title, module, state, assignee, branch, commit, and PR when Plane or the attached link already exposes them.

## Supporting resources

- Use `member` operations to resolve the current user and assignees.
- Use `state` operations to list project states and map the intended semantic phase.
- Use `label` operations to resolve existing labels.
- Use `workitem_type.list` for existing types. `workitem_type.resolve` can create or import a type and therefore belongs to project setup, not routine ticket creation.
- Use `cycle` for time-boxed iterations and `module` for product or technical-area groupings.
- Use `milestone` for target checkpoints.

Some work-item types, custom properties, initiatives, releases, customers, pages, and time tracking can be plan-gated. A plan error is a capability boundary, not a transient failure.

## Module classification

For Plane MCP releases that expose the direct 0.2.x tool surface:

| Intent | Tool | Important behavior |
| --- | --- | --- |
| List available modules | `list_modules` | Pass the resolved project UUID and use active modules by default |
| Read one module | `retrieve_module` | Requires project and module UUIDs |
| Assign work items | `manage_module_work_items` | Pass `add_ids` with work-item UUIDs; creation and assignment are separate |
| Remove membership | `manage_module_work_items` | Pass `remove_ids`; changing an existing item's classification requires user intent |
| Verify membership | `list_module_work_items` | Confirm the work-item UUID appears in the selected module |

Resolve the module dynamically by readable name before creation. If the request omits it, list active modules and ask the user to choose before any create call. Do not use `create_module` during routine task creation.

Resource/action-based releases can use different names from the direct tools above. Follow the same sequence: list modules, resolve one module, create the work item, add its UUID to the module, and verify membership.

## Reliable write sequence

1. Resolve the project and target record.
2. Read its current state.
3. Resolve any required module before creating a work item.
4. Make one focused create or partial update.
5. For a new work item, add it to the selected module as a separate focused write.
6. Read the work item and module membership back.
7. If the result is uncertain, search before retrying.
8. Return the readable identifier, selected module, resulting state, and verified link.

Do not batch unrelated mutations merely to reduce tool calls. Focused writes are easier to audit and recover.
