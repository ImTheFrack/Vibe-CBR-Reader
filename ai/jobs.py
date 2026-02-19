from typing import Dict, Any, Optional
import uuid
import time
import logging

logger = logging.getLogger(__name__)

# In-memory job store (job_id -> job_dict)
# Structure:
# {
#   "id": str,
#   "status": "pending" | "processing" | "completed" | "failed",
#   "progress_message": str,
#   "result": Optional[dict],
#   "error": Optional[str],
#   "created_at": float
# }
_JOBS: Dict[str, Dict[str, Any]] = {}

def create_job() -> str:
    """Create a new job and return its ID."""
    job_id = str(uuid.uuid4())
    _JOBS[job_id] = {
        "id": job_id,
        "status": "pending",
        "progress_message": "Initializing...",
        "result": None,
        "error": None,
        "created_at": time.time()
    }
    return job_id

def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a job by ID."""
    return _JOBS.get(job_id)

def update_job(job_id: str, status: Optional[str] = None, message: Optional[str] = None, result: Optional[Any] = None, error: Optional[str] = None):
    """Update a job's status."""
    job = _JOBS.get(job_id)
    if not job:
        return
    
    if status:
        job["status"] = status
    if message:
        job["progress_message"] = message
    if result:
        job["result"] = result
        job["status"] = "completed"
    if error:
        job["error"] = error
        job["status"] = "failed"
        
    logger.debug(f"Job {job_id} updated: status={job['status']}, msg={message}")

def cleanup_old_jobs(max_age_seconds: int = 300):
    """Remove jobs older than max_age_seconds."""
    now = time.time()
    to_remove = [jid for jid, job in _JOBS.items() if now - job["created_at"] > max_age_seconds]
    for jid in to_remove:
        del _JOBS[jid]
