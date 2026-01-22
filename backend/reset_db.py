import asyncio
import os
import sys

# Add current directory to sys.path so we can import from backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, init_db
from models import SQLModel

async def reset_database():
    print("Dropping all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    
    print("Re-creating tables...")
    await init_db()
    print("Database reset complete.")

if __name__ == "__main__":
    asyncio.run(reset_database())
