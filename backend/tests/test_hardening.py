"""Regression tests for correctness/safety fixes:

- diff: missing rows -> null (not 0), base=0 -> null pct, schema intersection
- upload: filename sanitization (path traversal), unique stored names
- version data: NaN -> null (valid JSON)
- folders: indirect circular move rejected, move-to-root works
- plot configs: nullable fields can be cleared with explicit null
"""

import io
import os

import pytest
from httpx import AsyncClient


async def _create_project(client: AsyncClient, name: str = "Test") -> int:
    resp = await client.post("/api/projects", json={"name": name})
    return resp.json()["id"]


async def _upload_csv(
    client: AsyncClient, pid: int, label: str, content: str, filename: str = "test.csv"
) -> dict:
    files = {"file": (filename, io.BytesIO(content.encode()), "text/csv")}
    resp = await client.post(
        f"/api/projects/{pid}/upload", files=files, data={"label": label}
    )
    assert resp.status_code == 200
    return resp.json()


# ── Diff semantics ──

@pytest.mark.asyncio
async def test_diff_missing_rows_are_null_not_zero(client: AsyncClient):
    pid = await _create_project(client)
    v1 = await _upload_csv(client, pid, "v1", "t,x\n0,10\n1,20\n")
    v2 = await _upload_csv(client, pid, "v2", "t,x\n0,11\n2,99\n")  # t=1 missing, t=2 extra
    resp = await client.get(
        f"/api/projects/{pid}/diff",
        params={"base_id": v1["version"]["id"], "compare_id": v2["version"]["id"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    by_t = {row["t"]: row for row in body["compare"]}
    assert by_t[1]["x"] is None  # absent in compare -> null, NOT 0
    base_by_t = {row["t"]: row for row in body["base"]}
    assert base_by_t[2]["x"] is None  # absent in base -> null
    diff_by_t = {row["t"]: row for row in body["diff"]}
    assert diff_by_t[0]["x"] == 1
    assert diff_by_t[1]["x"] is None


@pytest.mark.asyncio
async def test_diff_pct_with_zero_base_is_null_not_inf(client: AsyncClient):
    pid = await _create_project(client)
    v1 = await _upload_csv(client, pid, "v1", "t,x\n0,0\n1,10\n")
    v2 = await _upload_csv(client, pid, "v2", "t,x\n0,5\n1,20\n")
    resp = await client.get(
        f"/api/projects/{pid}/diff",
        params={"base_id": v1["version"]["id"], "compare_id": v2["version"]["id"]},
    )
    assert resp.status_code == 200
    # The whole payload must be valid JSON (no Infinity) — httpx would have
    # failed to parse otherwise
    pct = {row["t"]: row for row in resp.json()["diff_pct"]}
    assert pct[0]["x"] is None  # base 0 -> undefined pct -> null
    assert pct[1]["x"] == 100.0


@pytest.mark.asyncio
async def test_diff_uses_common_numeric_columns_only(client: AsyncClient):
    pid = await _create_project(client)
    v1 = await _upload_csv(client, pid, "v1", "t,a,b\n0,1,2\n")
    v2 = await _upload_csv(client, pid, "v2", "t,a,c\n0,3,4\n")  # b missing, c extra
    resp = await client.get(
        f"/api/projects/{pid}/diff",
        params={"base_id": v1["version"]["id"], "compare_id": v2["version"]["id"]},
    )
    assert resp.status_code == 200
    assert resp.json()["columns"] == ["a"]


@pytest.mark.asyncio
async def test_diff_no_common_columns_returns_400(client: AsyncClient):
    pid = await _create_project(client)
    v1 = await _upload_csv(client, pid, "v1", "t,a\n0,1\n")
    v2 = await _upload_csv(client, pid, "v2", "t,b\n0,2\n")
    resp = await client.get(
        f"/api/projects/{pid}/diff",
        params={"base_id": v1["version"]["id"], "compare_id": v2["version"]["id"]},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_diff_missing_index_column_returns_400(client: AsyncClient):
    pid = await _create_project(client)
    v1 = await _upload_csv(client, pid, "v1", "t,a\n0,1\n")
    v2 = await _upload_csv(client, pid, "v2", "z,a\n0,2\n")
    resp = await client.get(
        f"/api/projects/{pid}/diff",
        params={"base_id": v1["version"]["id"], "compare_id": v2["version"]["id"]},
    )
    assert resp.status_code == 400


# ── Upload safety ──

@pytest.mark.asyncio
async def test_upload_sanitizes_path_traversal_filename(client: AsyncClient):
    pid = await _create_project(client)
    evil = "../../../evil.csv"
    result = await _upload_csv(client, pid, "v1", "a,b\n1,2\n", filename=evil)
    version = result["version"]
    assert version["original_filename"] == "evil.csv"  # path stripped
    # Stored file must live inside the project's upload dir
    stored = os.path.abspath(version["file_path"])
    upload_dir = os.path.abspath(os.path.join(".", "data", "uploads", str(pid)))
    assert stored.startswith(upload_dir + os.sep)


@pytest.mark.asyncio
async def test_upload_same_filename_twice_keeps_both_files(client: AsyncClient):
    pid = await _create_project(client)
    r1 = await _upload_csv(client, pid, "v1", "a\n1\n", filename="same.csv")
    r2 = await _upload_csv(client, pid, "v2", "a\n2\n", filename="same.csv")
    assert r1["version"]["file_path"] != r2["version"]["file_path"]
    assert os.path.exists(r1["version"]["file_path"])
    assert os.path.exists(r2["version"]["file_path"])


# ── Version data JSON safety ──

@pytest.mark.asyncio
async def test_version_data_nan_becomes_null(client: AsyncClient):
    pid = await _create_project(client)
    up = await _upload_csv(client, pid, "v1", "a,b\n1,\n2,5\n")  # empty cell -> NaN
    vid = up["version"]["id"]
    resp = await client.get(f"/api/projects/{pid}/versions/{vid}/data")
    assert resp.status_code == 200
    rows = resp.json()["rows"]
    assert rows[0]["b"] is None
    assert rows[1]["b"] == 5


# ── Folder move safety ──

@pytest.mark.asyncio
async def test_folder_indirect_cycle_rejected(client: AsyncClient):
    a = (await client.post("/api/folders", json={"name": "A"})).json()["id"]
    b = (await client.post("/api/folders", json={"name": "B", "parent_id": a})).json()["id"]
    c = (await client.post("/api/folders", json={"name": "C", "parent_id": b})).json()["id"]
    # A -> C would create A -> B -> C -> A
    resp = await client.patch(f"/api/folders/{a}", json={"parent_id": c})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_folder_direct_cycle_rejected(client: AsyncClient):
    a = (await client.post("/api/folders", json={"name": "A"})).json()["id"]
    resp = await client.patch(f"/api/folders/{a}", json={"parent_id": a})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_folder_move_to_root_with_null(client: AsyncClient):
    a = (await client.post("/api/folders", json={"name": "A"})).json()["id"]
    b = (await client.post("/api/folders", json={"name": "B", "parent_id": a})).json()["id"]
    resp = await client.patch(f"/api/folders/{b}", json={"parent_id": None})
    assert resp.status_code == 200
    assert resp.json()["parent_id"] is None


@pytest.mark.asyncio
async def test_folder_move_to_missing_parent_404(client: AsyncClient):
    a = (await client.post("/api/folders", json={"name": "A"})).json()["id"]
    resp = await client.patch(f"/api/folders/{a}", json={"parent_id": 99999})
    assert resp.status_code == 404


# ── Plot config nullable fields ──

@pytest.mark.asyncio
async def test_plot_config_can_clear_x_column_with_null(client: AsyncClient):
    pid = await _create_project(client)
    created = (
        await client.post(
            f"/api/projects/{pid}/plots",
            json={"name": "P", "x_column": "time", "lines": []},
        )
    ).json()
    cid = created["id"]
    assert created["x_column"] == "time"

    resp = await client.put(
        f"/api/projects/{pid}/plots/{cid}", json={"x_column": None}
    )
    assert resp.status_code == 200
    assert resp.json()["x_column"] is None


@pytest.mark.asyncio
async def test_plot_config_omitted_fields_untouched(client: AsyncClient):
    pid = await _create_project(client)
    created = (
        await client.post(
            f"/api/projects/{pid}/plots",
            json={
                "name": "P",
                "x_column": "time",
                "metadata_json": {"template_id": "abc", "params": {"k": 1}},
                "lines": [],
            },
        )
    ).json()
    cid = created["id"]

    # Update only the name — x_column and metadata_json must survive
    resp = await client.put(f"/api/projects/{pid}/plots/{cid}", json={"name": "Q"})
    body = resp.json()
    assert body["name"] == "Q"
    assert body["x_column"] == "time"
    assert body["metadata_json"] == {"template_id": "abc", "params": {"k": 1}}
