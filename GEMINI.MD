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
- **static/js/state.js**: Global state management (centralized `state` object, including navigation history).
- **static/js/library.js**: Core library browsing and navigation logic (including `handleBack`).
- **static/js/reader.js**: Reader engine and display logic (Single, Double Page, and Long Strip modes).
- **static/css/**: Modularized CSS files (base, components, layout, tags, variables, views).

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

## Navigation System
- **Hierarchical Browsing**: Root → Category → Subcategory → Title.
- **Contextual Back Button**: Smart "Back" button in series detail view that tracks whether the user came from Library, Recent, Tags, or Search.
- **Search Persistence**: Navigating back from a series detail view restores the previous search query and results.

## Recent Changes
- **2026-02-01**: IMPLEMENTED - Functional Double Page and Long Strip (Webtoon) display modes in reader.
- **2026-02-01**: IMPLEMENTED - Contextual "Back" button in series detail view.
- **2026-02-01**: IMPLEMENTED - Search persistence when navigating back from titles.
- **2026-02-01**: FIXED - `ReferenceError` for `continueReading` in Recent view.
- **2026-02-01**: ENHANCED - Centralized state tracking for navigation history (`previousView`, `previousSearchQuery`).

## Code Quality Goals
- ✅ Modularized JS/CSS components
- ⏳ Python type hints completion
- ⏳ Backend Unit Tests
- ⏳ ESLint/Prettier integration
- ⏳ Documentation completion
