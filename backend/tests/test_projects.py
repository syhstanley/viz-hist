import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient):
    resp = await client.post("/api/projects", json={"name": "Test Project"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Project"
    assert data["id"] > 0
    assert data["version_count"] == 0


@pytest.mark.asyncio
async def test_list_projects(client: AsyncClient):
    await client.post("/api/projects", json={"name": "A"})
    await client.post("/api/projects", json={"name": "B"})
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    # Ordered by created_at desc
    assert data[0]["name"] == "B"
    assert data[1]["name"] == "A"
    # version_count should be present
    assert data[0]["version_count"] == 0


@pytest.mark.asyncio
async def test_get_project_detail(client: AsyncClient):
    create_resp = await client.post("/api/projects", json={"name": "Detail"})
    pid = create_resp.json()["id"]
    resp = await client.get(f"/api/projects/{pid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Detail"
    assert data["versions"] == []
    assert data["default_plot_config"] is None


@pytest.mark.asyncio
async def test_get_project_404(client: AsyncClient):
    resp = await client.get("/api/projects/9999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_project(client: AsyncClient):
    create_resp = await client.post("/api/projects", json={"name": "Old"})
    pid = create_resp.json()["id"]
    resp = await client.patch(f"/api/projects/{pid}", json={"name": "New"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"


@pytest.mark.asyncio
async def test_delete_project(client: AsyncClient):
    create_resp = await client.post("/api/projects", json={"name": "Delete Me"})
    pid = create_resp.json()["id"]
    resp = await client.delete(f"/api/projects/{pid}")
    assert resp.status_code == 200
    # Verify deleted
    resp = await client.get(f"/api/projects/{pid}")
    assert resp.status_code == 404
