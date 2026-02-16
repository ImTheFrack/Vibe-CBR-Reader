# Vibe CBR Reader - TODO & Roadmap

This file tracks the project's outstanding tasks, known bugs, and future roadmap.

- [ ] **Collections & Discovery**:
    - **Shared Lists**: Custom lists with `is_public` flags; community view to browse public collections.
    - [x] **Advanced Search**: [Implemented] Deep metadata search (synopsis, authors) using SQLite FTS5. Supports multi-word prefix matching.
    - [x] **Contextual Sidebar**: [Implemented] One-level-up hierarchical navigation with location highlighting; remains visible in title view.
    - [x] **Optimized Tagging System**: 
        - **Features**: Multi-word consolidation, metadata-based matching, and deep-linking support.
        - **Performance**: 128x speedup via module-level caching and word-set tokenization.
        - **Task**: [Implemented] Trigger cache invalidation in `database.py` at the end of library scan jobs.
    - [x] **Filters**: [Implemented] Dynamic, context-aware UI filters with propagation for genre, status, and progress.
- [X] **Anonymous Star Ratings**: [Implemented] 5-star system for series with average scores and individual user vote memory.
    - apiPost added
- [x] **Page Annotations**: Save notes, snippets, or highlights on specific pages.
    - Backend: Complete (db/annotations.py, routes/annotations.py)
    - Frontend: Complete (reader.js, annotation panel in index.html, CSS in viewsnew.css)
- [ ] **Duplicate Detection**: Identify duplicate files by name, size, and fuzzy title matching.
    - BACKEND HAS BEEN STARTED.
- [ ] **External Metadata**: Auto-fetch from MAL, AniList, or internal `ComicInfo.xml`.
- **VIBEMANGA INTEGRATION**:
  - [ ] **Reorganize**: Categorize, with AI assistance
  - [ ] **Scrape, Match, Grab & Pull**: Torrents integration via nyaa.si and qbittorrent.
  - [ ] **Metadata Supplementation/Editing**: Allow supplementing or editing metadata, including with AI assistance.
- [ ] **API Pagination**: Add pagination for `/api/books` and `/api/series`.
- [ ] **PWA Support**: Offline reading and installable app via Service Workers.
   - BACKEND STARTED OR MAYBE COMPLETE?
- [ ] **OPDS Feed**: Expose library for external reader apps (Librera, KOReader)
- [ ] **User Avatars**: Support Gravatar or local uploads.
