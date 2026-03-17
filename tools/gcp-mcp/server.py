#!/usr/bin/env python3
"""
GCP MCP server: Google Cloud Platform (full REST proxy + convenience tools).
Uses Application Default Credentials (ADC). Run:
  gcloud auth application-default login
before first use, or set GOOGLE_APPLICATION_CREDENTIALS to a service account key path.

Generic tool gcp_request lets the agent call any GCP REST API (Vertex AI, Compute,
Storage, IAM, etc.) by base URL + path + method + optional JSON body.
"""

import json
import sys
from typing import Any


# MCP stdio protocol: one JSON-RPC message per line (newline-delimited).
def send(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def send_result(id_: int | str | None, result: Any) -> None:
    send({"jsonrpc": "2.0", "id": id_, "result": result})


def send_error(id_: int | str | None, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}})


def list_tools() -> list[dict]:
    return [
        {
            "name": "gcp_list_projects",
            "description": "List GCP projects the current credentials can access (Cloud Resource Manager). Optional filter: parent (e.g. organizations/123 or folders/456).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "parent": {
                        "type": "string",
                        "description": "Optional. Parent resource: organizations/ORG_ID or folders/FOLDER_ID. Omit to list all accessible projects.",
                    },
                    "page_size": {
                        "type": "integer",
                        "description": "Max projects per page (default 100, max 1000).",
                        "default": 100,
                    },
                },
            },
        },
        {
            "name": "gcp_get_project",
            "description": "Get details for a single GCP project by project ID (e.g. my-project-123).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "GCP project ID (not number).",
                    },
                },
                "required": ["project_id"],
            },
        },
        {
            "name": "gcp_list_organizations",
            "description": "List organizations the current user can access.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "gcp_request",
            "description": "Call any GCP REST endpoint with ADC auth. Provide method, base_url, path, optional query dict, and optional JSON body.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "description": "HTTP method: GET, POST, PATCH, PUT, DELETE.",
                        "default": "GET",
                    },
                    "base_url": {
                        "type": "string",
                        "description": "API base URL, for example https://aiplatform.googleapis.com.",
                    },
                    "path": {
                        "type": "string",
                        "description": "Request path, for example /v1/projects/PROJECT_ID/locations/us-central1/endpoints.",
                    },
                    "query": {
                        "type": "object",
                        "description": "Optional query parameters as key/value pairs.",
                    },
                    "body": {
                        "type": "object",
                        "description": "Optional JSON request body.",
                    },
                },
                "required": ["base_url", "path"],
            },
        },
    ]


def get_credentials():
    import google.auth
    from google.auth.transport.requests import Request

    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def run_list_projects(parent: str | None, page_size: int) -> dict:
    query: dict[str, str] = {"pageSize": str(min(page_size, 1000))}
    if parent:
        query["query"] = f"parent:{parent}"
    resp = run_gcp_request(
        "GET",
        "https://cloudresourcemanager.googleapis.com",
        "/v3/projects:search",
        None,
        query,
    )["body"]
    if not isinstance(resp, dict):
        raise ValueError(f"Unexpected projects response: {resp!r}")
    projects = []
    for p in resp.get("projects", []):
        projects.append(
            {
                "projectId": p.get("projectId"),
                "name": p.get("name"),
                "displayName": p.get("displayName"),
                "state": p.get("state"),
                "parent": p.get("parent"),
            }
        )
    return {"projects": projects, "nextPageToken": resp.get("nextPageToken")}


def run_get_project(project_id: str) -> dict:
    p = run_gcp_request(
        "GET",
        "https://cloudresourcemanager.googleapis.com",
        f"/v3/projects/{project_id}",
        None,
        None,
    )["body"]
    return {
        "projectId": p.get("projectId"),
        "name": p.get("name"),
        "displayName": p.get("displayName"),
        "state": p.get("state"),
        "parent": p.get("parent"),
        "createTime": p.get("createTime"),
        "labels": p.get("labels"),
    }


def run_gcp_request(
    method: str,
    base_url: str,
    path: str,
    body: dict | None,
    query: dict | None,
) -> dict:
    """Authenticated HTTP request to any GCP REST API. base_url e.g. https://aiplatform.googleapis.com"""
    import urllib.parse

    import requests

    creds = get_credentials()
    if not creds.valid:
        from google.auth.transport.requests import Request

        creds.refresh(Request())
    token = creds.token
    base = base_url.rstrip("/")
    path = path if path.startswith("/") else "/" + path
    url = base + path
    if query:
        url += "?" + urllib.parse.urlencode(query, doseq=True)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    quota_project_id = getattr(creds, "quota_project_id", None)
    if quota_project_id:
        headers["x-goog-user-project"] = quota_project_id
    method = method.upper()
    if method == "GET":
        r = requests.get(url, headers=headers, timeout=120)
    elif method == "POST":
        r = requests.post(url, headers=headers, json=body or {}, timeout=120)
    elif method == "PATCH":
        r = requests.patch(url, headers=headers, json=body or {}, timeout=120)
    elif method == "PUT":
        r = requests.put(url, headers=headers, json=body or {}, timeout=120)
    elif method == "DELETE":
        r = requests.delete(url, headers=headers, timeout=120)
    else:
        raise ValueError(f"Unsupported method: {method}")
    try:
        resp_body = r.json() if r.text else None
    except Exception:
        resp_body = r.text
    return {
        "status_code": r.status_code,
        "headers": dict(r.headers),
        "body": resp_body,
    }


def run_list_organizations() -> dict:
    resp = run_gcp_request(
        "GET",
        "https://cloudresourcemanager.googleapis.com",
        "/v3/organizations:search",
        None,
        {"pageSize": "100"},
    )["body"]
    if not isinstance(resp, dict):
        raise ValueError(f"Unexpected organizations response: {resp!r}")
    orgs = []
    for o in resp.get("organizations", []):
        orgs.append(
            {
                "name": o.get("name"),
                "displayName": o.get("displayName"),
                "state": o.get("state"),
            }
        )
    return {"organizations": orgs}


def call_tool(name: str, arguments: dict) -> dict:
    if name == "gcp_list_projects":
        return run_list_projects(
            arguments.get("parent"),
            int(arguments.get("page_size") or 100),
        )
    if name == "gcp_get_project":
        return run_get_project(arguments["project_id"])
    if name == "gcp_list_organizations":
        return run_list_organizations()
    if name == "gcp_request":
        return run_gcp_request(
            arguments.get("method", "GET"),
            arguments["base_url"],
            arguments["path"],
            arguments.get("body"),
            arguments.get("query"),
        )
    raise ValueError(f"Unknown tool: {name}")


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = msg.get("method")
        id_ = msg.get("id")
        params = msg.get("params") or {}

        if method == "initialize":
            send_result(
                id_,
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "gcp-mcp", "version": "0.1.0"},
                },
            )
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            send_result(id_, {"tools": list_tools()})
        elif method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments") or {}
            try:
                result = call_tool(name, arguments)
                send_result(
                    id_,
                    {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]},
                )
            except Exception as e:
                send_error(id_, -32000, str(e))
        elif method == "ping":
            send_result(id_, {})
        else:
            send_error(id_, -32601, f"Method not found: {method}")


if __name__ == "__main__":
    main()
