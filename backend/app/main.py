import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import Base, engine
from app.routers import folders, projects, versions, plots, templates


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    os.makedirs("./data/uploads", exist_ok=True)
    yield


# NOTE: no CORS middleware — the frontend reaches the API through the Next.js
# same-origin rewrite proxy, so cross-origin requests are not needed.
app = FastAPI(title="viz-hist", lifespan=lifespan)

app.include_router(folders.router)
app.include_router(projects.router)
app.include_router(versions.router)
app.include_router(plots.router)
app.include_router(templates.router)
