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
- **scanner.py**: Background library scanning and metadata extraction logic.
- **database.py**: SQLAlchemy/SQLite schema definitions and connection management.
- **config.py**: Global configuration and paths.

### Frontend Architecture
- **static/js/main.js**: Application entry point and window function exposure.
- **static/js/components/**: Unified UI components (card-renderers, fan-renderer).
- **static/js/utils/**: Specialized logic (progress, sorting, api helpers).
- **static/js/state.js**: Global state management (centralized `state` object).
- **static/js/library.js**: Core library browsing and navigation logic.
- **static/js/reader.js**: Reader engine and display logic.

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
    pages INTEGER,
    processed BOOLEAN DEFAULT 0,
    volume REAL,
    chapter REAL
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

-- User & Session tables (users, reading_progress, user_preferences, sessions, bookmarks)
-- See database.py for full SQLAlchemy definitions.
```

## API Endpoints (Highlights)
- `GET /api/books`: List all comics.
- `GET /api/series/{series_name}`: Detailed series metadata + comics list.
- `POST /api/scan`: Incremental library scan.
- `POST /api/rescan`: Full database wipe and re-index.
- `POST /api/progress/{comic_id}`: Sync reading progress.
- `POST /api/auth/login`: Session-based authentication.

## Coding Conventions
- **Frontend**: Modular Vanilla JS. No build step. Use `state.js` for all shared state.
- **Backend**: FastAPI with type hints. Parameterized queries via SQLAlchemy.
- **Naming**: `snake_case` for Python, `camelCase` for JavaScript.
- **Folder Structure**: `Root → Category → Subcategory → Title → Comics`.

## Code Quality Goals
- ✅ Modularized JS/CSS components
- ⏳ Python type hints completion
- ⏳ Backend Unit Tests
- ⏳ ESLint/Prettier integration
- ⏳ Documentation completion
