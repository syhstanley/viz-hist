"""Custom chart template storage.

Templates are user-written frontend JS files stored on the filesystem
(default: ../templates, i.e. the repo-root `templates/` directory) so they
are tracked by git and can be committed / reviewed / reverted manually.

The backend treats template code as an opaque string — it is only ever
executed in the browser, wrapped in try/catch + an error boundary, so a
broken template can never take down the backend or the whole site.
"""

import os
import re
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/templates", tags=["templates"])

_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")
MAX_CODE_SIZE = 512 * 1024  # 512 KB is plenty for a chart template


def _templates_dir() -> str:
    # Resolved at call time so tests / deployments can override it
    return os.environ.get("VIZ_TEMPLATES_DIR", os.path.join("..", "templates"))


def _template_path(template_id: str) -> str:
    if not _ID_RE.match(template_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid template id: use letters, digits, '-' or '_' (max 64 chars)",
        )
    return os.path.join(_templates_dir(), f"{template_id}.js")


class TemplateResponse(BaseModel):
    id: str
    code: str
    updated_at: float  # unix mtime


class TemplateWrite(BaseModel):
    code: str


def _read_template(template_id: str) -> TemplateResponse:
    path = _template_path(template_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Template not found")
    with open(path, "r", encoding="utf-8") as f:
        code = f.read()
    return TemplateResponse(id=template_id, code=code, updated_at=os.path.getmtime(path))


@router.get("", response_model=List[TemplateResponse])
def list_templates():
    directory = _templates_dir()
    if not os.path.isdir(directory):
        return []
    out = []
    for fname in sorted(os.listdir(directory)):
        if not fname.endswith(".js"):
            continue
        template_id = fname[: -len(".js")]
        if not _ID_RE.match(template_id):
            continue  # ignore files that don't follow the naming convention
        out.append(_read_template(template_id))
    return out


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: str):
    return _read_template(template_id)


@router.put("/{template_id}", response_model=TemplateResponse)
def put_template(template_id: str, body: TemplateWrite):
    """Create or update a template (upsert)."""
    if len(body.code.encode("utf-8")) > MAX_CODE_SIZE:
        raise HTTPException(status_code=400, detail="Template code too large (max 512 KB)")
    path = _template_path(template_id)
    os.makedirs(_templates_dir(), exist_ok=True)
    # Write atomically so a crash mid-write can't corrupt a template
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(body.code)
    os.replace(tmp_path, path)
    return _read_template(template_id)


@router.delete("/{template_id}")
def delete_template(template_id: str):
    path = _template_path(template_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Template not found")
    os.remove(path)
    return {"detail": "deleted"}
