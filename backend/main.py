from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="RelentNet Pickleball API")

# Setup CORS for your Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, you'd restrict this to your domains
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """Coolify uses this to ensure the container is alive."""
    return {"status": "healthy", "version": "1.0.0"}

@app.get("/api/debug-env")
def debug_env():
    return {
        "database_connected": bool(os.getenv("DATABASE_URL")),
        "redis_connected": bool(os.getenv("REDIS_URL")),
        # Use .get() with a default to avoid errors if missing
        "admin_pin_exists": bool(os.getenv("ADMIN_PIN")),
    }

@app.get("/api/court-info")
async def get_court_info(request: Request):
    """
    Identity-agnostic endpoint. 
    It looks at the 'Host' header to identify which client/court this is.
    """
    host = request.headers.get("host", "unknown")
    
    # This is where you will eventually query Postgres 
    # using 'host' as your tenant identifier.
    return {
        "detected_host": host,
        "message": "Welcome to the Pickleball Engine",
        "storage_mode": "Isolated Project Database"
    }

if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 is required for Docker/Coolify access
    uvicorn.run(app, host="0.0.0.0", port=8000)