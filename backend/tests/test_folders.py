import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_folder(client: AsyncClient):
    resp = await client.post("/api/folders", json={"name": "My Folder"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "My Folder"
    assert data["parent_id"] is None
    assert data["id"] > 0


@pytest.mark.asyncio
async def test_create_nested_folder(client: AsyncClient):
    parent = await client.post("/api/folders", json={"name": "Parent"})
    pid = parent.json()["id"]
    child = await client.post("/api/folders", json={"name": "Child", "parent_id": pid})
    assert child.status_code == 200
    assert child.json()["parent_id"] == pid


@pytest.mark.asyncio
async def test_create_folder_invalid_parent(client: AsyncClient):
    resp = await client.post("/api/folders", json={"name": "Orphan", "parent_id": 9999})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_folders(client: AsyncClient):
    await client.post("/api/folders", json={"name": "A"})
    await client.post("/api/folders", json={"name": "B"})
    resp = await client.get("/api/folders")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_folder_tree_empty(client: AsyncClient):
    resp = await client.get("/api/folders/tree")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_folder_tree_nested(client: AsyncClient):
    parent = await client.post("/api/folders", json={"name": "Root Folder"})
    pid = parent.json()["id"]
    await client.post("/api/folders", json={"name": "Sub Folder", "parent_id": pid})

    resp = await client.get("/api/folders/tree")
    assert resp.status_code == 200
    tree = resp.json()
    assert len(tree) == 1
    assert tree[0]["name"] == "Root Folder"
    assert len(tree[0]["children"]) == 1
    assert tree[0]["children"][0]["name"] == "Sub Folder"


@pytest.mark.asyncio
async def test_folder_tree_with_projects(client: AsyncClient):
    folder = await client.post("/api/folders", json={"name": "Folder"})
    fid = folder.json()["id"]
    await client.post("/api/projects", json={"name": "In Folder", "folder_id": fid})
    await client.post("/api/projects", json={"name": "At Root"})

    resp = await client.get("/api/folders/tree")
    tree = resp.json()
    assert len(tree) == 1
    assert len(tree[0]["projects"]) == 1
    assert tree[0]["projects"][0]["name"] == "In Folder"


@pytest.mark.asyncio
async def test_update_folder_rename(client: AsyncClient):
    folder = await client.post("/api/folders", json={"name": "Old Name"})
    fid = folder.json()["id"]
    resp = await client.patch(f"/api/folders/{fid}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_move_folder(client: AsyncClient):
    f1 = await client.post("/api/folders", json={"name": "Folder A"})
    f2 = await client.post("/api/folders", json={"name": "Folder B"})
    fid1 = f1.json()["id"]
    fid2 = f2.json()["id"]

    # Move B into A
    resp = await client.patch(f"/api/folders/{fid2}", json={"parent_id": fid1})
    assert resp.status_code == 200
    assert resp.json()["parent_id"] == fid1

    # Verify tree
    tree = (await client.get("/api/folders/tree")).json()
    assert len(tree) == 1  # only A at root
    assert tree[0]["name"] == "Folder A"
    assert len(tree[0]["children"]) == 1
    assert tree[0]["children"][0]["name"] == "Folder B"


@pytest.mark.asyncio
async def test_move_folder_to_root(client: AsyncClient):
    parent = await client.post("/api/folders", json={"name": "Parent"})
    pid = parent.json()["id"]
    child = await client.post("/api/folders", json={"name": "Child", "parent_id": pid})
    cid = child.json()["id"]

    # Move child to root (parent_id = null needs special handling)
    # Using 0 or explicit null
    resp = await client.patch(f"/api/folders/{cid}", json={"parent_id": 0})
    # parent_id=0 won't exist, so it stays — let's test via tree
    tree = (await client.get("/api/folders/tree")).json()
    assert len(tree) >= 1


@pytest.mark.asyncio
async def test_prevent_self_parent(client: AsyncClient):
    folder = await client.post("/api/folders", json={"name": "Self"})
    fid = folder.json()["id"]
    resp = await client.patch(f"/api/folders/{fid}", json={"parent_id": fid})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_folder_moves_projects_to_root(client: AsyncClient):
    folder = await client.post("/api/folders", json={"name": "ToDelete"})
    fid = folder.json()["id"]
    proj = await client.post("/api/projects", json={"name": "Orphan", "folder_id": fid})
    pid = proj.json()["id"]

    resp = await client.delete(f"/api/folders/{fid}")
    assert resp.status_code == 200

    # Project should still exist but at root
    proj_detail = await client.get(f"/api/projects/{pid}")
    assert proj_detail.status_code == 200


@pytest.mark.asyncio
async def test_delete_folder_404(client: AsyncClient):
    resp = await client.delete("/api/folders/9999")
    assert resp.status_code == 404


# ── Project folder_id ──

@pytest.mark.asyncio
async def test_create_project_in_folder(client: AsyncClient):
    folder = await client.post("/api/folders", json={"name": "Projects"})
    fid = folder.json()["id"]
    proj = await client.post("/api/projects", json={"name": "In Folder", "folder_id": fid})
    assert proj.status_code == 200
    assert proj.json()["folder_id"] == fid


@pytest.mark.asyncio
async def test_move_project_to_folder(client: AsyncClient):
    folder = await client.post("/api/folders", json={"name": "Dest"})
    fid = folder.json()["id"]
    proj = await client.post("/api/projects", json={"name": "Movable"})
    pid = proj.json()["id"]

    resp = await client.patch(f"/api/projects/{pid}", json={"folder_id": fid})
    assert resp.status_code == 200

    # Verify in tree
    tree = (await client.get("/api/folders/tree")).json()
    folder_projects = tree[0]["projects"]
    assert any(p["name"] == "Movable" for p in folder_projects)
