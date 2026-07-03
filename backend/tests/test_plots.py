import io

import pytest
from httpx import AsyncClient


CSV_CONTENT = "time,value,value2\n0,10,100.5\n1,20,200.3\n2,30,300.1\n"


async def _setup_project_with_version(client: AsyncClient) -> tuple[int, int]:
    """Create a project and upload a CSV, return (project_id, version_id)."""
    resp = await client.post("/api/projects", json={"name": "Plot Test"})
    pid = resp.json()["id"]
    files = {"file": ("test.csv", io.BytesIO(CSV_CONTENT.encode()), "text/csv")}
    upload = await client.post(f"/api/projects/{pid}/upload", files=files, data={"label": "v1"})
    vid = upload.json()["version"]["id"]
    return pid, vid


# ── Plot Config CRUD ──


@pytest.mark.asyncio
async def test_create_plot_config(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    resp = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "My Config",
        "x_column": "time",
        "lines": [
            {"version_id": vid, "y_column": "value", "color": "#ff0000"},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "My Config"
    assert data["x_column"] == "time"
    assert data["is_default"] is True  # first config is default
    assert len(data["lines"]) == 1
    assert data["lines"][0]["y_column"] == "value"
    assert data["lines"][0]["color"] == "#ff0000"
    assert data["lines"][0]["axis"] == "left"
    assert data["lines"][0]["scalar"] == 1.0


@pytest.mark.asyncio
async def test_create_plot_config_with_axis_scalar(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    resp = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Dual Axis",
        "x_column": "time",
        "lines": [
            {"version_id": vid, "y_column": "value", "axis": "left", "scalar": 1.0},
            {"version_id": vid, "y_column": "value2", "axis": "right", "scalar": 0.5},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["lines"]) == 2
    assert data["lines"][0]["axis"] == "left"
    assert data["lines"][0]["scalar"] == 1.0
    assert data["lines"][1]["axis"] == "right"
    assert data["lines"][1]["scalar"] == 0.5


@pytest.mark.asyncio
async def test_list_plot_configs(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Config 1",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    resp = await client.get(f"/api/projects/{pid}/plots")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_get_plot_config(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Get Test",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]
    resp = await client.get(f"/api/projects/{pid}/plots/{cid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get Test"


@pytest.mark.asyncio
async def test_get_plot_config_404(client: AsyncClient):
    pid, _ = await _setup_project_with_version(client)
    resp = await client.get(f"/api/projects/{pid}/plots/9999")
    assert resp.status_code == 404


# ── Update Plot Config (the bug fix) ──


@pytest.mark.asyncio
async def test_update_plot_config_basic(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Original",
        "x_column": "time",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]

    resp = await client.put(f"/api/projects/{pid}/plots/{cid}", json={
        "name": "Updated",
        "x_column": "time",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


@pytest.mark.asyncio
async def test_update_plot_config_replace_lines(client: AsyncClient):
    """This was the 500 bug — replacing lines should work without ORM errors."""
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Replace Test",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]
    old_line_id = create.json()["lines"][0]["id"]

    # Replace lines with new set
    resp = await client.put(f"/api/projects/{pid}/plots/{cid}", json={
        "lines": [
            {"version_id": vid, "y_column": "value", "color": "#00ff00"},
            {"version_id": vid, "y_column": "value2", "color": "#0000ff", "axis": "right", "scalar": 2.0},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["lines"]) == 2
    # Verify new line content replaced old
    assert data["lines"][0]["color"] == "#00ff00"
    assert data["lines"][1]["y_column"] == "value2"
    assert data["lines"][1]["color"] == "#0000ff"
    # Check axis/scalar persisted
    assert data["lines"][1]["axis"] == "right"
    assert data["lines"][1]["scalar"] == 2.0


@pytest.mark.asyncio
async def test_update_plot_config_twice(client: AsyncClient):
    """Ensure we can update (replace lines) multiple times without error."""
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Multi Update",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]

    for i in range(3):
        resp = await client.put(f"/api/projects/{pid}/plots/{cid}", json={
            "lines": [
                {"version_id": vid, "y_column": "value", "color": f"#{i}00000"},
            ],
        })
        assert resp.status_code == 200
        assert len(resp.json()["lines"]) == 1


# ── Delete Plot Config ──


@pytest.mark.asyncio
async def test_delete_plot_config(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Delete Me",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]
    resp = await client.delete(f"/api/projects/{pid}/plots/{cid}")
    assert resp.status_code == 200

    # Verify gone
    resp = await client.get(f"/api/projects/{pid}/plots/{cid}")
    assert resp.status_code == 404


# ── Individual Plot Lines ──


@pytest.mark.asyncio
async def test_add_plot_line(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Line Test",
        "lines": [],
    })
    cid = create.json()["id"]

    resp = await client.post(f"/api/projects/{pid}/plots/{cid}/lines", json={
        "version_id": vid,
        "y_column": "value2",
        "color": "#abcdef",
        "axis": "right",
        "scalar": 0.1,
    })
    assert resp.status_code == 200
    line = resp.json()
    assert line["y_column"] == "value2"
    assert line["axis"] == "right"
    assert line["scalar"] == 0.1


@pytest.mark.asyncio
async def test_update_plot_line(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Patch Test",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]
    lid = create.json()["lines"][0]["id"]

    resp = await client.patch(f"/api/projects/{pid}/plots/{cid}/lines/{lid}", json={
        "color": "#999999",
        "enabled": False,
    })
    assert resp.status_code == 200
    assert resp.json()["color"] == "#999999"
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_delete_plot_line(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Delete Line",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]
    lid = create.json()["lines"][0]["id"]

    resp = await client.delete(f"/api/projects/{pid}/plots/{cid}/lines/{lid}")
    assert resp.status_code == 200

    # Config should now have 0 lines
    cfg = await client.get(f"/api/projects/{pid}/plots/{cid}")
    assert len(cfg.json()["lines"]) == 0


# ── Version delete with plot line cleanup ──


@pytest.mark.asyncio
async def test_delete_version_sets_null_on_plot_lines(client: AsyncClient):
    """Deleting a version should SET NULL on related plot lines, not delete them."""
    pid, vid = await _setup_project_with_version(client)
    create = await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Cleanup Test",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })
    cid = create.json()["id"]

    # Delete version
    resp = await client.delete(f"/api/projects/{pid}/versions/{vid}")
    assert resp.status_code == 200
    assert resp.json()["affected_plot_lines"] == 1

    # Plot config should still exist with line, but version_id = null
    cfg = await client.get(f"/api/projects/{pid}/plots/{cid}")
    assert cfg.status_code == 200
    assert len(cfg.json()["lines"]) == 1
    assert cfg.json()["lines"][0]["version_id"] is None


# ── Default plot config via project detail ──


@pytest.mark.asyncio
async def test_project_detail_includes_default_config(client: AsyncClient):
    pid, vid = await _setup_project_with_version(client)
    await client.post(f"/api/projects/{pid}/plots", json={
        "name": "Default",
        "x_column": "time",
        "lines": [{"version_id": vid, "y_column": "value"}],
    })

    resp = await client.get(f"/api/projects/{pid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["default_plot_config"] is not None
    assert data["default_plot_config"]["name"] == "Default"
    assert len(data["default_plot_config"]["lines"]) == 1
