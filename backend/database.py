import os
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Fix protocol for AsyncPG
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./backend.db")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

# Create the Async Engine
engine = create_async_engine(DATABASE_URL, echo=True, future=True) # type: ignore

async def init_db():
    async with engine.begin() as conn:
        # data is lost on restart if you use drop_all, use only for dev!
        # await conn.run_sync(SQLModel.metadata.drop_all) 
        await conn.run_sync(SQLModel.metadata.create_all)

async def get_session() -> AsyncSession: # pyright: ignore[reportInvalidTypeForm]
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False # pyright: ignore[reportArgumentType]
    ) # type: ignore
    async with async_session() as session: # pyright: ignore[reportGeneralTypeIssues]
        yield session # pyright: ignore[reportReturnType]