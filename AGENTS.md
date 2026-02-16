# AGENTS.md - Vibe CBR Reader

Guidelines for AI coding agents working on this codebase.

## Tech Stack
- **Backend**: Python 3.10+ (FastAPI)
- **Frontend**: Modular Vanilla ES6 JavaScript (no framework)
- **Database**: SQLite with WAL mode
- **Archives**: CBR/CBZ comic book files (via `rarfile` + `zipfile`)

---

## Build / Run / Test Commands

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt   # for testing

# Run development server (auto port discovery from 8501)
python server.py

# Run with explicit port
python server.py --port 8080
# or
uvicorn server:app --host 0.0.0.0 --port 8501

# Run all tests
pytest

# Run specific test file
pytest tests/test_api.py

# Run specific test function
pytest tests/test_api.py::test_config_endpoint

# Run with verbose output
pytest -v

# Lint JavaScript (if npm available)
npx eslint static/js/**/*.js

# Format JavaScript
npx prettier --write "static/js/**/*.js"
```

---

## Project Structure

```
vibecbr/
├── server.py          # FastAPI entry point, router registration
├── config.py          # Environment config (COMICS_DIR, DB_PATH, SECRET_KEY)
├── database.py        # Legacy DB functions (migrating to db/ package)
├── logger.py          # Centralized rotating file logger
├── dependencies.py    # FastAPI dependency injection (auth)
├── db/                # Database package
│   ├── connection.py  # SQLite connection (WAL, 30s timeout)
│   ├── users.py       # Auth, sessions, bcrypt hashing
│   ├── comics.py      # Comic metadata CRUD
│   ├── series.py      # Series metadata + tag filtering
│   ├── progress.py    # Reading progress + bookmarks
│   ├── annotations.py # Page-level annotations CRUD
│   └── jobs.py        # Scan job tracking
├── scanner/           # Library scanning package
│   ├── tasks.py       # Phase 1 (sync) + Phase 2 (process)
│   ├── archives.py    # CBR/CBZ extraction + thumbnails
│   └── utils.py       # Natural sort, filename parsing
├── routes/            # API route modules
│   ├── auth.py        # /api/auth/*
│   ├── library.py     # /api/books, /api/search, /api/cover
│   ├── users.py       # /api/progress, /api/preferences
│   ├── series.py      # /api/series, ratings
│   ├── annotations.py # /api/annotations/*
│   ├── admin.py       # /api/admin/*, /api/scan/*
│   └── discovery.py   # /api/discovery/*
├── static/
│   ├── js/
│   │   ├── main.js        # App entry, window exports
│   │   ├── state.js      # Global state singleton
│   │   ├── router.js     # View navigation
│   │   ├── actions.js    # Central action registry for event delegation
│   │   ├── reader/       # Reader modules (refactored from reader.js)
│   │   │   ├── ui.js     # UI visibility management
│   │   │   ├── gestures.js # Touch gesture handling
│   │   │   ├── prefetch.js # Image prefetching
│   │   │   ├── core.js   # Core reader functions
│   │   │   ├── navigation.js # Page navigation
│   │   │   ├── bookmarks.js # Bookmark management
│   │   │   ├── annotations.js # Annotation management
│   │   │   ├── filters.js # Visual filters/settings
│   │   │   ├── auto-advance.js # Auto-advance timer
│   │   │   ├── progress.js # Reading progress tracking
│   │   │   ├── scrubber.js # Page scrubber
│   │   │   ├── click-zones.js # Click zone handling
│   │   │   └── index.js  # Barrel export
│   │   ├── admin/        # Admin modules (refactored from admin.js)
│   │   │   ├── users.js  # User management
│   │   │   ├── tags.js   # Tag management
│   │   │   ├── scan.js   # Scan functionality
│   │   │   ├── settings.js # Settings management
│   │   │   ├── system.js # System controls
│   │   │   └── index.js  # Barrel export
│   │   ├── library/      # Library browsing modules
│   │   │   ├── navigation.js
│   │   │   ├── view-renderers.js
│   │   │   ├── search.js
│   │   │   ├── selection.js
│   │   │   └── renderers/  # View renderer modules
│   │   │       ├── folder-renderer.js
│   │   │       ├── title-renderer.js
│   │   │       ├── comic-renderer.js
│   │   │       ├── detail-renderer.js
│   │   │       └── index.js
│   │   └── components/   # Reusable UI renderers
│   └── css/              # Modular CSS (base, layout, views)
└── tests/                # pytest test suite
    ├── conftest.py       # Fixtures (test_db, test_client, test_user)
    ├── test_api.py       # API endpoint tests
    ├── test_auth.py      # Authentication tests
    └── test_db.py        # Database function tests
```

---

## Python Code Style

### Imports
```python
# 1. Standard library
import os
import hashlib
from typing import Optional, Dict, Any, List

# 2. Third-party
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

# 3. Local modules (absolute imports preferred)
from db.connection import get_db_connection
from dependencies import get_current_user
```

### Naming
- **Functions/Variables**: `snake_case`
- **Classes/Pydantic Models**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private functions**: `_leading_underscore`

### Functions
```python
def create_user(username: str, password: str, role: str = 'reader') -> Optional[int]:
    """Create a new user with hashed password.
    
    Returns user_id on success, None on duplicate username.
    """
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            (username, hash_password(password), role)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()
```

### SQL Safety
**ALWAYS use parameterized queries** with `?` placeholders:
```python
# GOOD
conn.execute('SELECT * FROM users WHERE username = ?', (username,))

# BAD - SQL injection risk
conn.execute(f'SELECT * FROM users WHERE username = "{username}"')
```

### Database Connection Pattern
```python
conn = get_db_connection()
try:
    # ... operations ...
    conn.commit()
finally:
    conn.close()
```

### Type Hints
Use typing module for clarity:
```python
from typing import Optional, Dict, Any, List

def get_all_users() -> List[Dict[str, Any]]:
    ...

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    ...
```

---

## JavaScript Code Style

### ES6 Modules
```javascript
// Imports at top
import { state } from '../state.js';
import { navigate } from '../router.js';
import { apiGet, apiPost } from '../api.js';

// Exports at bottom
export function myFunction() { ... }

// Cross-module access via window (for HTML onclick handlers)
window.myFunction = myFunction;
```

### Prettier Config (enforced)
- Semi-colons: **required**
- Quotes: **single**
- Tab width: **2 spaces**
- Print width: **100 chars**
- Trailing commas: **ES5**

### ESLint Rules (enforced)
- `prefer-const`: **error** - use `const` when variable is not reassigned
- `no-var`: **error** - always use `let` or `const`
- `object-shorthand`: **error** - use `{ foo }` not `{ foo: foo }`
- `prefer-template`: **warn** - use backticks for string interpolation

### State Management
All global state lives in `static/js/state.js`:
```javascript
export const state = {
    comics: [],
    currentLevel: 'root',
    viewMode: 'grid',
    currentUser: null,
    // ... see state.js for full schema
};
```

### Naming
- **Functions**: `camelCase`
- **Variables**: `camelCase` or `snake_case` (be consistent within module)
- **Constants**: `UPPER_SNAKE_CASE`
- **DOM element IDs**: `kebab-case` (`breadcrumb-container`)

### Async/Await
```javascript
// Preferred
async function loadComics() {
    const data = await apiGet('/api/books');
    state.comics = data.items;
}

// Avoid raw promises when possible
apiGet('/api/books').then(data => { ... }); // Only for fire-and-forget
```

---

## Modular Architecture

### Module Organization
Large features are split into focused modules under feature directories:

```
static/js/
├── reader/          # Reader feature modules
│   ├── ui.js       # UI visibility (show/hide)
│   ├── gestures.js # Touch gestures
│   ├── core.js     # Core functionality
│   └── index.js    # Barrel export
├── admin/           # Admin feature modules
│   ├── users.js    # User management
│   ├── tags.js     # Tag management
│   └── index.js    # Barrel export
└── library/
    └── renderers/   # View rendering modules
        ├── folder-renderer.js
        ├── title-renderer.js
        └── index.js
```

### Barrel Exports
Each feature directory has an `index.js` that re-exports all modules:
```javascript
// static/js/reader/index.js
export { showReaderUI, hideReaderUI } from './ui.js';
export { GestureController } from './gestures.js';
export { startReading } from './core.js';
```

### Module Size Guidelines
- **Target**: 50-150 lines per module
- **Maximum**: 200 lines (exceptions for complex views)
- **Focus**: Single responsibility per module

---

## Domain Terminology (CRITICAL)

| Term | Meaning | Example |
|------|---------|---------|
| **Comic** | A single .cbz/.cbr file | `One Piece v01.cbz` |
| **Chapter** | Display term for a comic entry | "5 chapters" |
| **Title** | A manga series folder | "One Piece" |
| **Series** | Metadata record for a Title | `series` table row |
| **Category** | Top-level library folder | "Action, Adventure & Adrenaline" |
| **Subcategory** | Genre/theme grouping | "Battle Shonen" |

**Navigation Hierarchy**: Root → Category → Subcategory → Title → Comics

---

## Common Patterns

### Window Export Pattern
Functions called from HTML or across modules must be exported to window:
```javascript
// At end of module
window.myFunction = myFunction;
window.anotherFunction = anotherFunction;
```

### Event Delegation with Action Registry
Global click handler in `main.js` uses central action registry:
```javascript
import { ACTION_REGISTRY } from './actions.js';

document.addEventListener('click', (event) => {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    
    const action = actionElement.dataset.action;
    const handler = ACTION_REGISTRY.actions.get(action);
    
    if (handler) {
        handler(event, actionElement);
    }
});
```

Register actions in `main.js`:
```javascript
import { registerAction } from './actions.js';

registerAction('close-reader', closeReader);
registerAction('toggle-bookmark', toggleBookmark);
```

Use `data-action` attributes in HTML:
```html
<button data-action="close-reader">Close</button>
<button data-action="toggle-bookmark">Bookmark</button>
```

### API Helper
Use `api.js` helpers instead of raw fetch:
```javascript
import { apiGet, apiPost, apiDelete } from '../api.js';

const data = await apiGet('/api/books');
await apiPost('/api/progress', { comic_id: '123', page: 5 });
```

---

## Testing Notes

- Tests use in-memory SQLite (`:memory:`) via `conftest.py`
- Fixtures: `test_db`, `test_client`, `test_user`, `admin_user`
- Tests are isolated - database cleared between tests
- Set `TESTING=1` environment variable to skip admin user creation

---

## Security Requirements

- **Passwords**: bcrypt hashing (lazy migration from SHA256)
- **Sessions**: HttpOnly cookies, 30-day expiry
- **SQL**: 100% parameterized queries
- **Admin routes**: RBAC enforced via `Depends(get_current_user)` + role check
- **Path traversal**: Validated when serving comic files

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBE_COMICS_DIR` | `O:/ArrData/media/comics/manga` | Library root path |
| `VIBE_DB_PATH` | `comics.db` | SQLite database file |
| `VIBE_CACHE_DIR` | `./cache` | Thumbnail cache directory |
| `VIBE_SECRET_KEY` | (random) | Session signing key |
| `VIBE_ADMIN_USER` | `admin` | Default admin username |
| `VIBE_ADMIN_PASS` | `admin123` | Default admin password |
| `VIBE_ENV` | `development` | Set to `production` for hardening |
| `VIBE_COOKIE_SECURE` | `false` | Set `true` for HTTPS-only cookies |