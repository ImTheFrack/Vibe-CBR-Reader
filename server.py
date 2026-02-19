import os
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from config import COMICS_DIR
from database import init_db, get_db_connection, create_user
from routes import auth, library, users, series, admin, discovery, annotations, libraries, lists, ai
from logger import logger

app = FastAPI(title="Vibe CBR Reader")

# Get the directory where the script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Mount static files directory
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Initialize DB on startup
init_db()

# Warm up metadata caches (Tag counts, FTS search index)
from database import warm_up_metadata_cache
warm_up_metadata_cache()

# Include Routers
app.include_router(auth.router)
app.include_router(library.router)
app.include_router(users.router)
app.include_router(series.router)
app.include_router(admin.router)
app.include_router(discovery.router)
app.include_router(annotations.router)
app.include_router(libraries.router)
app.include_router(lists.router)
app.include_router(ai.router)

# --- Main Routes ---

@app.get("/")
async def read_root(request: Request):
    index_path = os.path.join(BASE_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), media_type="text/html")

# --- Create Default Admin User on Startup ---
def create_default_admin() -> None:
    """Create default admin user if no users exist"""
    conn = get_db_connection()
    user_count = conn.execute("SELECT COUNT(*) as count FROM users").fetchone()['count']
    conn.close()
    
    if user_count == 0:
        admin_user = os.environ.get("VIBE_ADMIN_USER", "admin")
        admin_pass = os.environ.get("VIBE_ADMIN_PASS", "admin123")
        is_default = admin_user == "admin" and admin_pass == "admin123"
        
        logger.info(f"Creating {'default ' if is_default else ''}admin user...")
        # If it's the default admin/admin123, force password change
        create_user(admin_user, admin_pass, "admin@localhost", "admin", must_change_password=is_default)
        
        if is_default:
            logger.info(f"Default admin created: username='{admin_user}', password='{admin_pass}'")
            logger.warning("⚠️  CRITICAL: Default password used. User MUST change it on first login.")
        else:
            logger.info(f"Admin user '{admin_user}' created from environment variables.")

if not os.environ.get("TESTING"):
    create_default_admin()

def is_port_in_use(port: int) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", port))
            return False
        except socket.error:
            return True

def find_available_port(start_port: int, max_attempts: int = 100) -> int:
    port = start_port
    while is_port_in_use(port) and port < start_port + max_attempts:
        port += 1
    return port

if __name__ == "__main__":
    import uvicorn
    import argparse
    
    parser = argparse.ArgumentParser(description="Vibe CBR Reader Server")
    parser.add_argument("--port", "-p", type=int, help="Port to run the server on")
    args = parser.parse_args()
    
    port = args.port
    if port is None:
        port = find_available_port(8501)
        logger.info(f"No port specified, using first available port: {port}")
    else:
        if is_port_in_use(port):
            logger.warning(f"Warning: Port {port} is already in use. Uvicorn may fail to start.")
            
    uvicorn.run(app, host="0.0.0.0", port=port)
