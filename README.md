# Vibe CBR Reader

A modern, web-based comic book reader designed for CBR and CBZ archives. Featuring a sleek MangaDex-inspired interface, it offers a powerful hierarchical navigation system and full metadata support via `series.json`.

## Core Features

- **Multiple View Modes**: Browse your library in Grid, List, or Detailed card views.
- **Hierarchical Navigation**: Efficiently navigate through large libraries using a Root → Category → Subcategory → Title structure.
- **Contextual Sidebar**: Always know where you are with a sidebar that adapts to your current location.
- **Flatten Mode**: View all comics in a subtree with a single toggle.
- **Rich Metadata**: Automatic parsing of `series.json` to display synopses, authors, genres, and external links (MAL/AniList).
- **Advanced Reader**:
  - Single page, double page (spread), and long strip (webtoon) modes.
  - Left-to-right (Western) and Right-to-left (Manga) reading directions.
  - Page bookmarks and progress tracking saved to your user account.
- **Dark/Light Themes**: Customizable interface with persistent user preferences.
- **Global Search**: Search across titles, series, and categories with scoped or global options.

## Technical Considerations

### Security
- **Authentication**: Secure password hashing using `bcrypt` with lazy migration from legacy formats.
- **Session Management**: Secure session tracking via HTTP-only, SameSite cookies with 30-day expiry.
- **Admin Hardening**: Forced password change for default credentials and environment-based admin setup.
- **Access Control**: Administrative routes (scanning, user management) are protected by role-based authorization.
- **SQL Safety**: Comprehensive use of parameterized queries to prevent SQL injection.
- **Path Traversal Protection**: Securely serves comic files while preventing unauthorized access to the filesystem.

### Scalability & Architecture
- **Modular Design**: Refactored backend and frontend into logical packages (`db/`, `scanner/`, `library/`) for maintainability.
- **Structured Logging**: Centralized logging system with console output and rotating file backups.
- **Portable Configuration**: Full support for environment variables via `.env` files.
- **Large Libraries**: Optimized to support 10k+ comics with efficient SQLite WAL-mode queries.
- **Background Processing**: Multi-threaded library scanning and thumbnail generation.

### Cross-Platform
- Works seamlessly on Windows, Linux, and macOS.
- **Mobile Responsive**: Fully optimized for tablets and smartphones.
- **Docker Support**: Ready for containerized deployment on NAS or servers.

## Keyboard Shortcuts

- `←` / `A`: Previous page
- `→` / `D` / `Space`: Next page
- `Shift + ←`: Previous chapter/volume
- `Shift + →`: Next chapter/volume
- `F`: Toggle Fullscreen
- `B`: Toggle Bookmark
- `ESC`: Close Reader

## TODO & Roadmap

For a detailed list of planned features, known bugs, and project roadmap, please see [TODO.md](TODO.md).

## Recent Changes

### 2026-02-05
- **Security Hardening**: Migrated to `bcrypt` hashing with lazy migration, audited and fixed all SQL queries for full parameterization, and hardened registration logic.
- **Admin & Setup**: Implemented forced password changes for default accounts, supported environment-based admin credentials, and added a non-dismissible security update flow.
- **Modular Architecture**: Refactored monolithic files (`database.py`, `scanner.py`, `library.js`) into clean, maintainable packages (`db/`, `scanner/`, `library/`).
- **User Management**: Added a full-stack administrative dashboard for managing user roles, deletions, and forced password resets.
- **Infrastructure**: Integrated `python-dotenv` for portable configuration, implemented structured logging (Console + Rotating File), and added randomized secret key fallbacks.
- **Format Support**: Added support for **Jpeg XL (.jxl)** image archives with automatic MIME type detection and proper content-type responses.
- **Optimized Tagging**: Implemented a high-performance tagging system with a 128x speedup using module-level caching and word-set tokenization.
- **Reading History**: Added ability to purge entire reading history or remove individual items from the "Recent" tab.
- **Export System**: Implemented backend for streaming multi-comic exports as CBZ files using zero-compression for speed.
- **Reader Enhancements**:
    - **Performance**: Added background preloading for the next 2-3 pages.
    - **Gestures**: Implemented native mobile gestures for swipes and pinch-to-zoom.
    - **Per-Comic Memory**: Reader now remembers specific settings (zoom, direction) for each title.
    - **Utility**: Added session/series time tracking and custom remappable keybindings.

### 2026-02-03
- **Audit**: Full codebase review with 8 confirmed bugs documented.
- **Updated**: Roadmap expanded from 3 to 7 phases reflecting actual feature state.
- **Tracked**: All completed features now properly listed in roadmap.

### 2026-02-01
- **Overhaul**: Redesigned Title View UI for better readability.
- **Refactor**: Unified frontend rendering logic, reducing code size and improving maintainability.
- **Improved**: Added support for nested folder metadata scanning.
- **Feature**: Full Library Rescan with confirmation (Shift+Click on Scan).
- **Fixes**: Optimized volume/chapter sorting and fixed various UI navigation bugs.
