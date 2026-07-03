import pytest

SAMPLE_CODE = """({
  name: "My Chart",
  params: [{ key: "col", label: "Column", type: "string", default: "" }],
  render(ctx) { return { data: [], layout: {} }; }
})
"""


@pytest.fixture(autouse=True)
def templates_dir(tmp_path, monkeypatch):
    d = tmp_path / "templates"
    monkeypatch.setenv("VIZ_TEMPLATES_DIR", str(d))
    return d


@pytest.mark.asyncio
async def test_list_empty(client):
    resp = await client.get("/api/templates")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_and_get(client):
    resp = await client.put("/api/templates/my-chart", json={"code": SAMPLE_CODE})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "my-chart"
    assert body["code"] == SAMPLE_CODE

    resp = await client.get("/api/templates/my-chart")
    assert resp.status_code == 200
    assert resp.json()["code"] == SAMPLE_CODE


@pytest.mark.asyncio
async def test_update_overwrites(client):
    await client.put("/api/templates/t1", json={"code": "({ name: 'a' })"})
    await client.put("/api/templates/t1", json={"code": "({ name: 'b' })"})
    resp = await client.get("/api/templates/t1")
    assert resp.json()["code"] == "({ name: 'b' })"


@pytest.mark.asyncio
async def test_list_returns_all(client):
    await client.put("/api/templates/aaa", json={"code": "1"})
    await client.put("/api/templates/bbb", json={"code": "2"})
    resp = await client.get("/api/templates")
    ids = [t["id"] for t in resp.json()]
    assert ids == ["aaa", "bbb"]


@pytest.mark.asyncio
async def test_delete(client):
    await client.put("/api/templates/gone", json={"code": "x"})
    resp = await client.delete("/api/templates/gone")
    assert resp.status_code == 200
    resp = await client.get("/api/templates/gone")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_missing_404(client):
    resp = await client.get("/api/templates/nope")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_missing_404(client):
    resp = await client.delete("/api/templates/nope")
    assert resp.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_id", ["../evil", "a b", "a/b", ".hidden", "-lead", "x" * 65])
async def test_invalid_ids_rejected(client, bad_id):
    resp = await client.put(f"/api/templates/{bad_id}", json={"code": "x"})
    # path traversal chars may also 404 at the routing layer — both are safe
    assert resp.status_code in (400, 404)


@pytest.mark.asyncio
async def test_path_traversal_writes_nothing(client, templates_dir, tmp_path):
    await client.put("/api/templates/..%2Fescape", json={"code": "x"})
    assert not (tmp_path / "escape.js").exists()


@pytest.mark.asyncio
async def test_code_size_limit(client):
    resp = await client.put("/api/templates/big", json={"code": "x" * (512 * 1024 + 1)})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_non_js_files_ignored_in_list(client, templates_dir):
    templates_dir.mkdir(parents=True, exist_ok=True)
    (templates_dir / "README.md").write_text("not a template")
    (templates_dir / "ok.js").write_text("({})")
    resp = await client.get("/api/templates")
    assert [t["id"] for t in resp.json()] == ["ok"]
