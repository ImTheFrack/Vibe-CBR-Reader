import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from config import COMICS_DIR
from database import init_db, get_db_connection, create_user
from routes import auth, library, users, series, admin

app = FastAPI(title="Vibe CBR Reader")

# Get the directory where the script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Mount static files directory
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Initialize DB on startup
init_db()

# Include Routers
app.include_router(auth.router)
app.include_router(library.router)
app.include_router(users.router)
app.include_router(series.router)
app.include_router(admin.router)

# --- Main Routes ---

@app.get("/")
async def read_root(request: Request):
    index_path = os.path.join(BASE_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), media_type="text/html")

# --- Create Default Admin User on Startup ---
def create_default_admin():
    """Create default admin user if no users exist"""
    conn = get_db_connection()
    user_count = conn.execute("SELECT COUNT(*) as count FROM users").fetchone()['count']
    conn.close()
    
    if user_count == 0:
        print("Creating default admin user...")
        create_user("admin", "admin123", "admin@localhost", "admin")
        print("Default admin created: username='admin', password='admin123'")
        print("⚠️  Please change the default password after first login!")

# Create default admin on startup
create_default_admin()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
