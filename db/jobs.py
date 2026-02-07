import json
import sqlite3
from typing import Optional, Dict, Any, List
from .connection import get_db_connection

def create_scan_job(scan_type: str = 'fast', total_comics: int = 0) -> int:
    """Create a new scan job and return its ID"""
    conn = get_db_connection()
    cursor = conn.execute(
        '''INSERT INTO scan_jobs (scan_type, total_comics, status) 
           VALUES (?, ?, 'running')''',
        (scan_type, total_comics)
    )
    assert cursor.lastrowid is not None
    job_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return job_id

def update_scan_progress(job_id: int, processed_comics: int, errors: Optional[List[str]] = None, conn: Optional[sqlite3.Connection] = None, **kwargs: Any) -> None:
    """Update scan job progress with flexible metrics"""
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    errors_json = json.dumps(errors) if errors else None
    
    updates = ["processed_comics = ?", "errors = ?"]
    params: List[Any] = [processed_comics, errors_json]
    
    # Whitelist of allowed metric columns for scan_jobs table updates.
    # Only these columns can be updated via kwargs to prevent SQL injection.
    # All values are parameterized in the UPDATE statement.
    allowed_metrics = [
        'current_file', 'phase', 'new_comics', 'deleted_comics', 'changed_comics',
        'processed_pages', 'page_errors', 'processed_thumbnails', 'thumbnail_errors',
        'thumb_bytes_written', 'thumb_bytes_saved'
    ]
    
    for key, value in kwargs.items():
        if key in allowed_metrics and value is not None:
            updates.append(f"{key} = ?")
            params.append(value)
        
    params.append(job_id)
    
    sql = f"UPDATE scan_jobs SET {', '.join(updates)} WHERE id = ?"
    conn.execute(sql, params)
    if own_conn:
        conn.commit()
        conn.close()

def complete_scan_job(job_id: int, status: str = 'completed', errors: Optional[List[str]] = None, conn: Optional[sqlite3.Connection] = None) -> None:
    """Mark scan job as completed or failed"""
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    errors_json = json.dumps(errors) if errors else None
    
    conn.execute(
        '''UPDATE scan_jobs 
           SET status = ?, completed_at = CURRENT_TIMESTAMP, errors = ?
           WHERE id = ?''',
        (status, errors_json, job_id)
    )
    if own_conn:
        conn.commit()
        conn.close()

def _parse_job(job: Any) -> Optional[Dict[str, Any]]:
    if not job:
        return None
    result = dict(job)
    if result.get('errors'):
        try:
            result['errors'] = json.loads(result['errors'])
        except (json.JSONDecodeError, TypeError):
            pass
    return result

def get_scan_status(job_id: int) -> Optional[Dict[str, Any]]:
    """Get status of a specific scan job"""
    conn = get_db_connection()
    job = conn.execute(
        '''SELECT * FROM scan_jobs WHERE id = ?''',
        (job_id,)
    ).fetchone()
    conn.close()
    return _parse_job(job)

def get_latest_scan_job() -> Optional[Dict[str, Any]]:
    """Get the most recent scan job"""
    conn = get_db_connection()
    job = conn.execute(
        '''SELECT * FROM scan_jobs ORDER BY started_at DESC LIMIT 1'''
    ).fetchone()
    conn.close()
    return _parse_job(job)

def get_running_scan_job() -> Optional[Dict[str, Any]]:
    """Get the currently running scan job, if any"""
    conn = get_db_connection()
    job = conn.execute(
        '''SELECT * FROM scan_jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1'''
    ).fetchone()
    conn.close()
    return _parse_job(job)

def stop_running_scan_job() -> bool:
    """Request cancellation of the currently running scan job"""
    conn = get_db_connection()
    cursor = conn.execute(
        '''UPDATE scan_jobs SET cancel_requested = 1 WHERE status = 'running' '''
    )
    rowcount = cursor.rowcount
    conn.commit()
    conn.close()
    return rowcount > 0

def check_scan_cancellation(job_id: int) -> bool:
    """Check if cancellation has been requested for the job"""
    conn = get_db_connection()
    row = conn.execute(
        '''SELECT cancel_requested FROM scan_jobs WHERE id = ?''',
        (job_id,)
    ).fetchone()
    conn.close()
    return bool(row['cancel_requested']) if row else False
