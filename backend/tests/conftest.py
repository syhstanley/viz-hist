import os
import tempfile
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

# Use a temp file for test DB
_test_db_fd, _test_db_path = tempfile.mkstemp(suffix=".db")
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{_test_db_path}"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create tables before each test and drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def sample_csv(tmp_path) -> str:
    """Create a sample CSV file and return its path."""
    csv_path = tmp_path / "test.csv"
    csv_path.write_text("time,value,value2\n0,10,100.5\n1,20,200.3\n2,30,300.1\n")
    return str(csv_path)


@pytest.fixture
def sample_csv_v2(tmp_path) -> str:
    """Create a second sample CSV file."""
    csv_path = tmp_path / "test_v2.csv"
    csv_path.write_text("time,value,value2\n0,15,150.0\n1,25,250.0\n2,35,350.0\n")
    return str(csv_path)


def cleanup():
    os.close(_test_db_fd)
    os.unlink(_test_db_path)


import atexit
atexit.register(cleanup)
