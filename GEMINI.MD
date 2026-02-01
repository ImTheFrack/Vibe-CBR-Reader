# Vibe CBR Reader - Developer Context (GEMINI)

This file provides the technical context for AI agents and developers working on the codebase.

## Overview
**Backend**: Python (FastAPI)
**Frontend**: HTML/JS (Modular Vanilla ES6)
**Database**: SQLite

## Project Structure

### Backend Modules
- **server.py**: Entry point, app initialization, and router inclusion.
- **routes/**: API route logic (auth, library, users, series, admin).
- **scanner.py**: Two-phase library scanning and metadata extraction logic.
- **database.py**: SQLAlchemy/SQLite schema definitions and connection management.
- **config.py**: Global configuration and paths.

### Frontend Architecture
- **static/js/main.js**: Application entry point and window function exposure.
- **static/js/components/**: Unified UI components (card-renderers, fan-renderer).
- **static/js/utils/**: Specialized logic (progress, sorting, api helpers).
- **static/js/state.js**: Global state management (centralized `state` object).
- **static/js/library.js**: Core library browsing, folder tree generation, and navigation logic.
- **static/js/reader.js**: Reader engine supporting Single, Double Page, and Long Strip modes.
- **static/css/**: Modularized CSS files.

## Database Schema

```sql
-- Core comic storage
CREATE TABLE comics (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE,
    title TEXT,
    series TEXT,
    category TEXT,
    filename TEXT,
    size_str TEXT,
    size_bytes INTEGER,
    mtime INTEGER,
    pages INTEGER,
    processed BOOLEAN DEFAULT 0,
    has_thumbnail BOOLEAN DEFAULT 0,
    volume REAL,
    chapter REAL,
    series_id INTEGER REFERENCES series(id)
)

-- Metadata storage
CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    title TEXT,
    title_english TEXT,
    title_japanese TEXT,
    synonyms TEXT, -- JSON
    authors TEXT, -- JSON
    synopsis TEXT,
    genres TEXT, -- JSON
    tags TEXT, -- JSON
    demographics TEXT, -- JSON
    status TEXT,
    total_volumes INTEGER,
    total_chapters INTEGER,
    release_year INTEGER,
    mal_id INTEGER,
    anilist_id INTEGER,
    cover_comic_id TEXT,
    category TEXT,
    subcategory TEXT
)

-- Scan jobs tracking
CREATE TABLE scan_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT DEFAULT 'running',
    total_comics INTEGER DEFAULT 0,
    processed_comics INTEGER DEFAULT 0,
    current_file TEXT,
    phase TEXT,
    new_comics INTEGER DEFAULT 0,
    deleted_comics INTEGER DEFAULT 0,
    changed_comics INTEGER DEFAULT 0,
    processed_pages INTEGER DEFAULT 0,
    page_errors INTEGER DEFAULT 0,
    processed_thumbnails INTEGER DEFAULT 0,
    thumbnail_errors INTEGER DEFAULT 0,
    errors TEXT,
    scan_type TEXT DEFAULT 'fast'
)
```

## API Endpoints (Highlights)
- `GET /api/config`: Exposes `COMICS_DIR` for frontend path relativization.
- `GET /api/books`: List all comics.
- `GET /api/series/{series_name}`: Detailed series metadata + comics list.
- `GET /api/read/{comic_id}`: Reader metadata (includes on-demand page counting).
- `GET /api/scan/status`: Detailed real-time scan metrics and phase tracking.
- `POST /api/scan`: Unified two-phase library scan.
- `POST /api/rescan`: Full database wipe and re-index.

## Scanning Architecture (Two-Phase)
- **Phase 1: Syncing**: Fast directory walk. Detects new, deleted, and changed files (via `mtime` and `size_bytes`). Updates folder structure and series records without opening archives.
- **Phase 2: Processing**: Background worker that opens archives to count pages and extract thumbnails for "pending" items.
- **On-Demand**: The `/api/read/{id}` endpoint performs "lazy" page counting if a comic hasn't been processed yet, ensuring the reader always has correct totals.

## Navigation System
- **Hierarchical Browsing**: Root → Category → Subcategory → Title.
- **Dynamic Relativization**: Frontend fetches `COMICS_DIR` from backend to accurately "subtract" the root path and derive categories, regardless of library location.
- **Contextual Back Button**: Smart navigation that remembers search queries and previous views.

## Recent Changes
- **2026-02-01**: IMPLEMENTED - Robust two-phase scanner with change detection (`mtime`/`size`) and deletion handling.
- **2026-02-01**: IMPLEMENTED - Real-time scan metrics dashboard (Phase tracking, New/Changed/Deleted counts, Success/Error rates).
- **2026-02-01**: IMPLEMENTED - On-demand page counting in reader to support "Fast Scan" entry.
- **2026-02-01**: ENHANCED - Robust path relativization in frontend using backend-supplied `COMICS_DIR`.
- **2026-02-01**: FIXED - "Database is locked" issues using WAL mode and 30s connection timeouts.

## Code Quality Goals
- ✅ Modularized JS/CSS components
- ✅ Robust Error Handling in Scan Tasks
- ⏳ Python type hints completion
- ⏳ Backend Unit Tests
- ⏳ ESLint/Prettier integration