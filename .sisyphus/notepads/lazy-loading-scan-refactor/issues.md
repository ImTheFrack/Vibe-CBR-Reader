# Lazy Loading Scan Refactor - Issues & Blockers

## Active Issues
None yet - work just starting.

## Resolved Issues
None yet.

## Potential Risks
1. **Database Migration**: SQLite ALTER TABLE limitations - may need table recreation
2. **Race Conditions**: Concurrent thumbnail generation needs atomic file operations
3. **Timeout Handling**: Thumbnail generation timeout with threading (signals incompatible with web servers)
4. **Concurrent Scans**: Need database-based scan lock

## Mitigation Strategies
- Use temp file + atomic rename for thumbnails
- Use threading with join(timeout=10) instead of signals
- Check for running scans before starting new one
- Enable WAL mode for better SQLite concurrency
