import asyncio
import os
import sys
from sqlalchemy import text
from database import engine

async def migrate():
    print("Running migrations...")
    async with engine.begin() as conn:
        # Add new columns to match table if they don't exist
        # We use a try-except block for each column because SQLite and Postgres 
        # have different ways of checking if a column exists, but they both 
        # fail if we try to add a column that already exists.
        
        columns = [
            ("league_name", "VARCHAR"),
            ("tournament_name", "VARCHAR"),
            ("match_info", "VARCHAR")
        ]
        
        for col_name, col_type in columns:
            try:
                print(f"Adding column {col_name}...")
                await conn.execute(text(f'ALTER TABLE "match" ADD COLUMN {col_name} {col_type}'))
                print(f"Column {col_name} added.")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e):
                    print(f"Column {col_name} already exists, skipping.")
                else:
                    print(f"Error adding {col_name}: {e}")

    print("Migrations complete.")

if __name__ == "__main__":
    asyncio.run(migrate())
