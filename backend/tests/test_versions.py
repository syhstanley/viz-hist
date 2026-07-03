import io

import pytest
from httpx import AsyncClient


async def _create_project(client: AsyncClient) -> int:
    resp = await client.post("/api/projects", json={"name": "Test"})
    return resp.json()["id"]


async def _upload_csv(
    client: AsyncClient, pid: int, label: str, content: str, filename: str = "test.csv"
) -> dict:
    files = {"file": (filename, io.BytesIO(content.encode()), "text/csv")}
    data = {"label": label}
    resp = await client.post(f"/api/projects/{pid}/upload", files=files, data=data)
    assert resp.status_code == 200
    return resp.json()


CSV_CONTENT = "time,value,value2\n0,10,100.5\n1,20,200.3\n2,30,300.1\n"
CSV_CONTENT_V2 = "time,value,value2\n0,15,150.0\n1,25,250.0\n2,35,350.0\n"


@pytest.mark.asyncio
async def test_upload_csv(client: AsyncClient):
    pid = await _create_project(client)
    result = _upload_csv(client, pid, "v1", CSV_CONTENT)
    data = await result
    assert data["rows"] == 3
    assert data["version"]["label"] == "v1"
    assert data["version"]["original_filename"] == "test.csv"
    schema = data["schema_fields"]
    col_names = [s["name"] for s in schema]
    assert "time" in col_names
    assert "value" in col_names
    assert "value2" in col_names


@pytest.mark.asyncio
async def test_list_versions(client: AsyncClient):
    pid = await _create_project(client)
    await _upload_csv(client, pid, "v1", CSV_CONTENT)
    await _upload_csv(client, pid, "v2", CSV_CONTENT_V2)
    resp = await client.get(f"/api/projects/{pid}/versions")
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) == 2


@pytest.mark.asyncio
async def test_update_version_label(client: AsyncClient):
    pid = await _create_project(client)
    upload = await _upload_csv(client, pid, "old", CSV_CONTENT)
    vid = upload["version"]["id"]
    resp = await client.patch(
        f"/api/projects/{pid}/versions/{vid}", json={"label": "new"}
    )
    assert resp.status_code == 200
    assert resp.json()["label"] == "new"


@pytest.mark.asyncio
async def test_get_version_data(client: AsyncClient):
    pid = await _create_project(client)
    upload = await _upload_csv(client, pid, "v1", CSV_CONTENT)
    vid = upload["version"]["id"]
    resp = await client.get(f"/api/projects/{pid}/versions/{vid}/data")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["rows"]) == 3
    assert data["columns"] == ["time", "value", "value2"]


@pytest.mark.asyncio
async def test_get_version_data_pagination(client: AsyncClient):
    pid = await _create_project(client)
    upload = await _upload_csv(client, pid, "v1", CSV_CONTENT)
    vid = upload["version"]["id"]

    # limit=2
    resp = await client.get(f"/api/projects/{pid}/versions/{vid}/data?limit=2")
    data = resp.json()
    assert len(data["rows"]) == 2
    assert data["total"] == 3
    assert data["offset"] == 0
    assert data["limit"] == 2

    # offset=1, limit=1
    resp = await client.get(
        f"/api/projects/{pid}/versions/{vid}/data?offset=1&limit=1"
    )
    data = resp.json()
    assert len(data["rows"]) == 1
    assert data["rows"][0]["time"] == 1  # second row


@pytest.mark.asyncio
async def test_delete_version(client: AsyncClient):
    pid = await _create_project(client)
    upload = await _upload_csv(client, pid, "v1", CSV_CONTENT)
    vid = upload["version"]["id"]
    resp = await client.delete(f"/api/projects/{pid}/versions/{vid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["detail"] == "deleted"
    assert "affected_plot_lines" in data

    # Verify deleted
    resp = await client.get(f"/api/projects/{pid}/versions/{vid}/data")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_diff_versions(client: AsyncClient):
    pid = await _create_project(client)
    u1 = await _upload_csv(client, pid, "v1", CSV_CONTENT, "base.csv")
    u2 = await _upload_csv(client, pid, "v2", CSV_CONTENT_V2, "compare.csv")
    vid1 = u1["version"]["id"]
    vid2 = u2["version"]["id"]

    resp = await client.get(
        f"/api/projects/{pid}/diff?base_id={vid1}&compare_id={vid2}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["index_column"] == "time"
    assert "value" in data["columns"]
    assert "value2" in data["columns"]
    assert len(data["base"]) == 3
    assert len(data["compare"]) == 3
    assert len(data["diff"]) == 3
    assert len(data["diff_pct"]) == 3

    # Check diff values: v2 - v1 for value at time=0: 15-10=5
    diff_by_time = {r["time"]: r for r in data["diff"]}
    assert diff_by_time[0]["value"] == 5.0


@pytest.mark.asyncio
async def test_diff_no_numpy_types(client: AsyncClient):
    """Ensure diff response contains native Python types, not numpy."""
    pid = await _create_project(client)
    u1 = await _upload_csv(client, pid, "v1", CSV_CONTENT, "base.csv")
    u2 = await _upload_csv(client, pid, "v2", CSV_CONTENT_V2, "compare.csv")
    vid1 = u1["version"]["id"]
    vid2 = u2["version"]["id"]

    resp = await client.get(
        f"/api/projects/{pid}/diff?base_id={vid1}&compare_id={vid2}"
    )
    assert resp.status_code == 200
    # If numpy types leaked, JSON serialization would fail (500)
    data = resp.json()
    # Verify index values are plain ints
    for row in data["base"]:
        assert isinstance(row["time"], (int, float))


@pytest.mark.asyncio
async def test_version_count_in_project_list(client: AsyncClient):
    pid = await _create_project(client)
    await _upload_csv(client, pid, "v1", CSV_CONTENT)
    await _upload_csv(client, pid, "v2", CSV_CONTENT_V2)
    resp = await client.get("/api/projects")
    projects = resp.json()
    assert projects[0]["version_count"] == 2
