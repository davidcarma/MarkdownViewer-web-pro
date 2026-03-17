---
name: gcp-integration
description: Use the GCP MCP server to call any Google Cloud REST API (Resource Manager, Vertex AI, Compute, Storage, IAM, etc.) via convenience tools or the generic gcp_request. Use when the user asks about Google Cloud Console, GCP projects, Vertex AI, or wants to inspect or change GCP resources without opening the browser.
---

# GCP integration (MCP)

The **gcp** MCP server uses Application Default Credentials to call GCP REST APIs. It does not open the Cloud Console UI.

This integration is **multi-project**. It is not tied to one single project. Use `gcp_list_projects` to discover everything the authenticated account can access, then target the desired `projectId` explicitly in each call.

User-facing naming rule:

- Prefer the project's friendly display name when talking to the user.
- Keep raw `projectId` values internal unless they are needed for commands, API paths, debugging, or the user explicitly asks for them.

## Prerequisites

- **Auth**: Run once:
  ```bash
  gcloud auth application-default login
  ```
- Enable the relevant API in the target project (e.g. Vertex AI API, Compute Engine API).

## Tools

| Tool | Purpose |
|------|--------|
| `gcp_list_projects` | List projects (optional `parent`: organizations/ID or folders/ID). |
| `gcp_get_project` | Get one project by project ID. |
| `gcp_list_organizations` | List organizations you can access. |
| **`gcp_request`** | **Generic**: call any GCP REST endpoint (method, base_url, path, query, body). |

## Generic `gcp_request` (full GCP surface)

Use this to call Vertex AI, Compute, Storage, IAM, Cloud Run, etc. The agent supplies the REST path and body from GCP docs.

Project targeting rule:

- For multi-project safety, always pass the intended `projectId` in the request path, for example `/v1/projects/PROJECT_ID/...`.
- Do not assume a hidden default project unless the user explicitly asks to set one.
- When presenting project choices, show friendly display names first and include raw IDs only if needed for disambiguation.

- **base_url**: API base, e.g. `https://aiplatform.googleapis.com`, `https://compute.googleapis.com`, `https://storage.googleapis.com`, `https://cloudresourcemanager.googleapis.com`.
- **path**: Path only, e.g. `/v1/projects/PROJECT_ID/locations/us-central1/endpoints`.
- **method**: GET, POST, PATCH, PUT, DELETE.
- **query**: Optional dict for query string (e.g. `{"pageSize": "10"}`).
- **body**: Optional dict for JSON body (POST/PATCH).

### Common base URLs

| API | base_url |
|-----|----------|
| Vertex AI | `https://aiplatform.googleapis.com` |
| Compute Engine | `https://compute.googleapis.com` |
| Cloud Storage (JSON) | `https://storage.googleapis.com` |
| Resource Manager | `https://cloudresourcemanager.googleapis.com` |
| IAM | `https://iam.googleapis.com` |
| Cloud Run | `https://run.googleapis.com` |
| Cloud Functions | `https://cloudfunctions.googleapis.com` |

Paths and request shapes are in [GCP REST API reference](https://cloud.google.com/apis/docs/overview) and each product’s docs (e.g. Vertex AI REST).

## Resource name format

- Organization: `organizations/123456789`
- Folder: `folders/987654321`
- Project: use **projectId** (string like `my-project-id`).

## Examples

- List projects: `gcp_list_projects`.
- Get one project directly: `gcp_get_project` with `project_id`.
- Vertex AI list endpoints: `gcp_request` with base_url `https://aiplatform.googleapis.com`, path `/v1/projects/PROJECT_ID/locations/us-central1/endpoints`, method GET.
- Compute list instances: base_url `https://compute.googleapis.com`, path `/compute/v1/projects/PROJECT_ID/zones/ZONE/instances`, method GET.
