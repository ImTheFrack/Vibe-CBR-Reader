from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional
import json
import os
import sys
import re
from database import get_all_users, delete_user, update_user_role, update_user_password, approve_user, get_running_scan_job, get_latest_scan_job, stop_running_scan_job, create_scan_job
from dependencies import get_admin_user
from db.settings import get_all_settings, set_setting, get_setting
from db.connection import get_db_connection
from scanner import fast_scan_library_task, rescan_library_task, thumbnail_rescan_task, metadata_rescan_task
from config import COMICS_DIR
import httpx
from ai.client import AIClient

router = APIRouter(prefix="/api/admin", tags=["admin"])

class RoleUpdate(BaseModel):
    role: str

class PasswordReset(BaseModel):
    new_password: str

class ThumbnailSettings(BaseModel):
    thumb_quality: Optional[int] = None
    thumb_ratio: Optional[str] = None
    thumb_width: Optional[int] = None
    thumb_height: Optional[int] = None
    thumb_format: Optional[str] = None
    require_approval: Optional[int] = None
    
    @field_validator('thumb_quality')
    @classmethod
    def validate_quality(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Quality must be between 0 and 100')
        return v
    
    @field_validator('thumb_width')
    @classmethod
    def validate_width(cls, v):
        if v is not None and (v < 60 or v > 300):
            raise ValueError('Width must be between 60 and 300')
        return v
    
    @field_validator('thumb_height')
    @classmethod
    def validate_height(cls, v):
        if v is not None and (v < 100 or v > 600):
            raise ValueError('Height must be between 100 and 600')
        return v
    
    @field_validator('thumb_format')
    @classmethod
    def validate_format(cls, v):
        if v is not None and v not in ['webp', 'png', 'jpg', 'best']:
            raise ValueError('Format must be one of: webp, png, jpg, best')
        return v
    
    @field_validator('thumb_ratio')
    @classmethod
    def validate_ratio(cls, v):
        if v is not None and not re.match(r'^\d+:\d+$', v):
            raise ValueError('Ratio must match pattern \\d+:\\d+')
        return v

@router.get("/users")
async def list_users(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> List[Dict[str, Any]]:
    """List all users with reading statistics (admin only)"""
    conn = get_db_connection()
    
    # Query users with reading stats using LEFT JOIN
    users = conn.execute('''
        SELECT 
            u.id, u.username, u.email, u.role, u.created_at, u.approved, u.must_change_password,
            COALESCE(SUM(rp.seconds_read), 0) as total_seconds_read,
            COUNT(DISTINCT rp.comic_id) as comics_started,
            COUNT(DISTINCT CASE WHEN rp.completed = 1 THEN rp.comic_id END) as comics_completed
        FROM users u
        LEFT JOIN reading_progress rp ON u.id = rp.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    ''').fetchall()
    
    conn.close()
    
    # Convert rows to dictionaries
    return [dict(user) for user in users]

@router.put("/users/{user_id}/role")
async def admin_update_user_role(user_id: int, data: RoleUpdate, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Update user role (admin only)"""
    if data.role not in ['admin', 'reader']:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Prevent admin from changing their own role (safety)
    if user_id == admin_user['id'] and data.role != 'admin':
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    
    success = update_user_role(user_id, data.role)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update role")
    
    return {"message": "Role updated"}

@router.put("/users/{user_id}/password")
async def admin_reset_password(user_id: int, data: PasswordReset, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Force reset user password (admin only)"""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # If the admin is resetting THEIR OWN password, we clear the 'must_change' flag.
    # If they are resetting someone ELSE's, we keep it True.
    must_change = (user_id != admin_user['id'])
    
    update_user_password(user_id, data.new_password, must_change=must_change)
    
    if must_change:
        return {"message": "Password reset successful, user must change it on next login"}
    return {"message": "Password updated successfully"}

@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: int, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Delete a user (admin only)"""
    # Prevent admin from deleting themselves
    if user_id == admin_user['id']:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    delete_user(user_id)
    return {"message": "User deleted"}

@router.put("/users/{user_id}/approve")
async def admin_approve_user(user_id: int, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Approve a pending user account (admin only)"""
    approve_user(user_id)
    return {"message": "User approved"}

@router.get("/gaps")
async def get_all_gaps(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> List[Dict[str, Any]]:
    """Identify missing chapters/volumes across all series"""
    from db.series import get_gaps_report
    return get_gaps_report()

@router.get("/duplicates")
async def get_duplicates(
    current_user: Dict[str, Any] = Depends(get_admin_user)
) -> List[Dict[str, Any]]:
    """Get duplicate comics report"""
    from db.comics import get_duplicate_comics
    return get_duplicate_comics()

@router.get("/settings")
async def get_settings(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """Get all admin settings (admin only)"""
    settings = get_all_settings()
    
    # Parse numeric values for frontend
    parsed_settings = {}
    for key, value in settings.items():
        if key in ['thumb_quality', 'thumb_width', 'thumb_height']:
            try:
                parsed_settings[key] = int(value)
            except (ValueError, TypeError):
                parsed_settings[key] = value
        elif key == 'require_approval':
            try:
                parsed_settings[key] = int(value)
            except (ValueError, TypeError):
                parsed_settings[key] = value
        else:
            parsed_settings[key] = value
            
    # Add library stats
    conn = get_db_connection()
    try:
        parsed_settings['total_series'] = conn.execute('SELECT COUNT(*) FROM series').fetchone()[0]
        parsed_settings['total_comics'] = conn.execute('SELECT COUNT(*) FROM comics').fetchone()[0]
    except Exception:
        parsed_settings['total_series'] = 0
        parsed_settings['total_comics'] = 0
    finally:
        conn.close()
    
    return parsed_settings

@router.put("/settings")
async def update_settings(
    data: ThumbnailSettings,
    admin_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    """Update admin settings (admin only)"""
    # Update only provided (non-None) fields
    if data.thumb_quality is not None:
        set_setting('thumb_quality', str(data.thumb_quality))
    
    if data.thumb_ratio is not None:
        set_setting('thumb_ratio', data.thumb_ratio)
    
    if data.thumb_width is not None:
        set_setting('thumb_width', str(data.thumb_width))
    
    if data.thumb_height is not None:
        set_setting('thumb_height', str(data.thumb_height))
    
    if data.thumb_format is not None:
        set_setting('thumb_format', data.thumb_format)
    
    if data.require_approval is not None:
        set_setting('require_approval', str(data.require_approval))
    
    # Return updated settings
    settings = get_all_settings()
    
    # Parse numeric values for frontend
    parsed_settings = {}
    for key, value in settings.items():
        if key in ['thumb_quality', 'thumb_width', 'thumb_height']:
            try:
                parsed_settings[key] = int(value)
            except (ValueError, TypeError):
                parsed_settings[key] = value
        elif key == 'require_approval':
            try:
                parsed_settings[key] = int(value)
            except (ValueError, TypeError):
                parsed_settings[key] = value
        else:
            parsed_settings[key] = value
    
    return parsed_settings

@router.post("/scan")
async def scan_library(background_tasks: BackgroundTasks, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    if not os.path.exists(COMICS_DIR):
        raise HTTPException(status_code=404, detail="Comics directory not found")
    
    running_job = get_running_scan_job()
    if running_job:
        raise HTTPException(status_code=409, detail="A scan is already in progress")
    
    job_id = create_scan_job(scan_type='fast', total_comics=0)
    background_tasks.add_task(fast_scan_library_task, job_id)
    return {"message": "Fast scan started"}

@router.post("/scan/stop")
async def stop_scan(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Stop the currently running scan"""
    success = stop_running_scan_job()
    if not success:
        raise HTTPException(status_code=404, detail="No running scan found")
    
    return {"message": "Scan cancellation requested"}

class NSFWConfig(BaseModel):
    categories: Optional[List[str]] = None
    subcategories: Optional[List[str]] = None
    tag_patterns: Optional[List[str]] = None

class TagAction(BaseModel):
    tag: str
    display: Optional[str] = None
    target: Optional[str] = None

@router.get("/tags")
async def get_admin_tags(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """Get all tags with stats and status (admin only)"""
    from db.series import get_tag_management_data
    return get_tag_management_data()

@router.post("/tags/blacklist")
async def admin_blacklist_tag(data: TagAction, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Add a tag to the blacklist (admin only)"""
    from db.series import blacklist_tag
    if blacklist_tag(data.tag):
        return {"message": f"Tag '{data.tag}' blacklisted"}
    raise HTTPException(status_code=400, detail="Failed to blacklist tag")

@router.post("/tags/whitelist")
async def admin_whitelist_tag(data: TagAction, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Add a tag to the whitelist (admin only)"""
    from db.series import whitelist_tag
    if whitelist_tag(data.tag, data.display):
        return {"message": f"Tag '{data.tag}' whitelisted/renamed"}
    raise HTTPException(status_code=400, detail="Failed to whitelist tag")

@router.post("/tags/merge")
async def admin_merge_tags(data: TagAction, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Merge source tag into target tag (admin only)"""
    from db.series import merge_tags
    if not data.target:
        raise HTTPException(status_code=400, detail="Target tag required for merge")
    if merge_tags(data.tag, data.target):
        return {"message": f"Tag '{data.tag}' merged into '{data.target}'"}
    raise HTTPException(status_code=400, detail="Failed to merge tags")

@router.delete("/tags/modification/{norm:path}")
async def admin_remove_modification(norm: str, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Remove any modification for this tag (admin only)"""
    from db.series import remove_tag_modification
    if remove_tag_modification(norm):
        return {"message": "Tag modification removed"}
    raise HTTPException(status_code=400, detail="Failed to remove modification")

@router.get("/nsfw-config")
async def get_nsfw_config(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """Get current NSFW configuration with available options (admin only)"""
    from db.nsfw import get_nsfw_config as get_config
    
    # Get current config
    config = get_config()
    
    # Get available categories and subcategories from database
    conn = get_db_connection()
    try:
        available_categories = conn.execute(
            'SELECT DISTINCT category FROM series WHERE category IS NOT NULL ORDER BY category'
        ).fetchall()
        available_subcategories = conn.execute(
            'SELECT DISTINCT subcategory FROM series WHERE subcategory IS NOT NULL ORDER BY subcategory'
        ).fetchall()
    finally:
        conn.close()
    
    return {
        'categories': config.get('categories', []),
        'subcategories': config.get('subcategories', []),
        'tag_patterns': config.get('tag_patterns', []),
        'available_categories': [row['category'] for row in available_categories],
        'available_subcategories': [row['subcategory'] for row in available_subcategories],
    }

@router.put("/nsfw-config")
async def update_nsfw_config(
    data: NSFWConfig,
    admin_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    """Save NSFW configuration and recompute flags (admin only)"""
    from db.nsfw import recompute_nsfw_flags
    
    # Save only provided (non-None) fields
    if data.categories is not None:
        set_setting('nsfw_categories', json.dumps(data.categories))
    
    if data.subcategories is not None:
        set_setting('nsfw_subcategories', json.dumps(data.subcategories))
    
    if data.tag_patterns is not None:
        set_setting('nsfw_tag_patterns', json.dumps(data.tag_patterns))
    
    # Recompute NSFW flags for all series
    recompute_nsfw_flags()
    
    # Return updated config
    from db.nsfw import get_nsfw_config as get_config
    config = get_config()
    
    conn = get_db_connection()
    try:
        available_categories = conn.execute(
            'SELECT DISTINCT category FROM series WHERE category IS NOT NULL ORDER BY category'
        ).fetchall()
        available_subcategories = conn.execute(
            'SELECT DISTINCT subcategory FROM series WHERE subcategory IS NOT NULL ORDER BY subcategory'
        ).fetchall()
    finally:
        conn.close()
    
    return {
        'categories': config.get('categories', []),
        'subcategories': config.get('subcategories', []),
        'tag_patterns': config.get('tag_patterns', []),
        'available_categories': [row['category'] for row in available_categories],
        'available_subcategories': [row['subcategory'] for row in available_subcategories],
    }

@router.post("/nsfw-config/load-defaults")
async def load_default_nsfw_config(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """Load default NSFW tag patterns and merge with existing (admin only)"""
    from db.nsfw import get_default_nsfw_tag_patterns, recompute_nsfw_flags
    
    # Get current config
    current_patterns = get_setting('nsfw_tag_patterns') or '[]'
    try:
        current_list = json.loads(current_patterns)
    except (json.JSONDecodeError, TypeError):
        current_list = []
    
    # Get default patterns
    default_patterns = get_default_nsfw_tag_patterns()
    
    # Merge without duplicates (case-insensitive)
    merged = list(current_list)
    current_lower = [p.lower() for p in current_list]
    
    for pattern in default_patterns:
        if pattern.lower() not in current_lower:
            merged.append(pattern)
    
    # Save merged patterns
    set_setting('nsfw_tag_patterns', json.dumps(merged))
    
    # Recompute NSFW flags
    recompute_nsfw_flags()
    
    # Return updated config
    from db.nsfw import get_nsfw_config as get_config
    config = get_config()
    
    conn = get_db_connection()
    try:
        available_categories = conn.execute(
            'SELECT DISTINCT category FROM series WHERE category IS NOT NULL ORDER BY category'
        ).fetchall()
        available_subcategories = conn.execute(
            'SELECT DISTINCT subcategory FROM series WHERE subcategory IS NOT NULL ORDER BY subcategory'
        ).fetchall()
    finally:
        conn.close()
    
    return {
        'categories': config.get('categories', []),
        'subcategories': config.get('subcategories', []),
        'tag_patterns': config.get('tag_patterns', []),
        'available_categories': [row['category'] for row in available_categories],
        'available_subcategories': [row['subcategory'] for row in available_subcategories],
    }

@router.get("/scan/status")
async def get_scan_status(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """Get current scan progress"""
    latest_job = get_latest_scan_job()
    
    if not latest_job:
        return {
            "id": None,
            "status": "idle",
            "total_comics": 0,
            "processed_comics": 0,
            "started_at": None,
            "completed_at": None,
            "errors": None
        }
    
    return {
        "id": latest_job['id'],
        "status": latest_job['status'],
        "total_comics": latest_job['total_comics'],
        "processed_comics": latest_job['processed_comics'],
        "current_file": latest_job.get('current_file'),
        "phase": latest_job.get('phase'),
        "new_comics": latest_job.get('new_comics', 0),
        "deleted_comics": latest_job.get('deleted_comics', 0),
        "changed_comics": latest_job.get('changed_comics', 0),
        "processed_pages": latest_job.get('processed_pages', 0),
        "page_errors": latest_job.get('page_errors', 0),
        "processed_thumbnails": latest_job.get('processed_thumbnails', 0),
        "thumbnail_errors": latest_job.get('thumbnail_errors', 0),
        "thumb_bytes_written": latest_job.get('thumb_bytes_written', 0),
        "thumb_bytes_saved": latest_job.get('thumb_bytes_saved', 0),
        "started_at": latest_job['started_at'],
        "completed_at": latest_job['completed_at'],
        "errors": latest_job.get('errors'),
        "cancel_requested": bool(latest_job.get('cancel_requested', 0))
    }

@router.post("/rescan")
async def rescan_library(background_tasks: BackgroundTasks, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    if not os.path.exists(COMICS_DIR):
        raise HTTPException(status_code=404, detail="Comics directory not found")
    
    running_job = get_running_scan_job()
    if running_job:
        raise HTTPException(status_code=409, detail="A scan is already in progress")
    
    job_id = create_scan_job(scan_type='full', total_comics=0)
    background_tasks.add_task(rescan_library_task, job_id)
    return {"message": "Full rescan started in background"}

@router.post("/scan/thumbnails")
async def scan_thumbnails(background_tasks: BackgroundTasks, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Regenerate all thumbnails"""
    running_job = get_running_scan_job()
    if running_job:
        raise HTTPException(status_code=409, detail="A scan is already in progress")
    
    job_id = create_scan_job(scan_type='thumbnails', total_comics=0)
    background_tasks.add_task(thumbnail_rescan_task, job_id)
    return {"message": "Thumbnail rescan started"}

@router.post("/scan/metadata")
async def scan_metadata(background_tasks: BackgroundTasks, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Re-parse all series.json files"""
    running_job = get_running_scan_job()
    if running_job:
        raise HTTPException(status_code=409, detail="A scan is already in progress")
    
    job_id = create_scan_job(scan_type='metadata', total_comics=0)
    background_tasks.add_task(metadata_rescan_task, job_id)
    return {"message": "Metadata rescan started"}

@router.post("/system/reload")
async def system_reload(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Force backend cache invalidation and warm up"""
    from db.series import warm_up_metadata_cache
    warm_up_metadata_cache()
    return {"message": "System caches reloaded"}

def restart_server():
    """Helper to restart the current process"""
    import time
    time.sleep(1) # Give time for the response to be sent
    os.execv(sys.executable, [sys.executable] + sys.argv)

@router.post("/system/restart")
async def system_restart(background_tasks: BackgroundTasks, admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, str]:
    """Gracefully restart the server process"""
    background_tasks.add_task(restart_server)
    return {"message": "Server restart initiated"}

class AISettings(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None

class AISettingsResponse(BaseModel):
    provider: str
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None

@router.get("/ai-settings")
async def get_ai_settings(admin_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """Get AI configuration settings (admin only)"""
    from db.settings import get_setting
    
    provider = get_setting('ai_provider') or 'openai'
    model = get_setting('ai_model') or 'gpt-4o-mini'
    api_key = get_setting('ai_api_key') or ''
    base_url = get_setting('ai_base_url') or ''
    
    masked_key = ''
    if api_key and len(api_key) >= 4:
        masked_key = '*' * min(len(api_key) - 4, 20) + api_key[-4:]
    
    return {
        "provider": provider,
        "model": model,
        "api_key": masked_key,
        "base_url": base_url
    }

@router.put("/ai-settings")
async def update_ai_settings(
    data: AISettings,
    admin_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    """Update AI configuration settings (admin only)"""
    from db.settings import set_setting, get_setting
    
    if data.provider is not None:
        set_setting('ai_provider', data.provider)
    
    if data.model is not None:
        set_setting('ai_model', data.model)
    
    if data.api_key is not None and data.api_key.strip():
        set_setting('ai_api_key', data.api_key.strip())
    
    if data.base_url is not None:
        set_setting('ai_base_url', data.base_url)
    
    provider = get_setting('ai_provider') or 'openai'
    model = get_setting('ai_model') or 'gpt-4o-mini'
    api_key = get_setting('ai_api_key') or ''
    base_url = get_setting('ai_base_url') or ''
    
    masked_key = ''
    if api_key and len(api_key) >= 4:
        masked_key = '*' * min(len(api_key) - 4, 20) + api_key[-4:]
    
    return {
        "provider": provider,
        "model": model,
        "api_key": masked_key,
        "base_url": base_url
    }

@router.post("/ai-settings/test")
async def test_ai_connection(
    data: AISettings,
    admin_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    """Test AI connection with provided settings (admin only)"""
    import logging
    logger = logging.getLogger(__name__)
    
    provider = data.provider or 'openai'
    logger.info(f"AI Test: provider={provider}, model={data.model}, base_url={data.base_url}")
    
    # Handle masked API key
    from db.settings import get_setting
    stored_key = get_setting('ai_api_key') or ''
    api_key_to_use = data.api_key

    # Check if key is masked (matches stored key pattern)
    if api_key_to_use and stored_key and len(stored_key) >= 4:
        masked_stored = '*' * min(len(stored_key) - 4, 20) + stored_key[-4:]
        if api_key_to_use == masked_stored:
            api_key_to_use = stored_key
            logger.info("AI Test: Using stored API key (unmasked)")

    # Ollama doesn't require an API key, but OpenAI SDK needs a non-empty string
    if not api_key_to_use and provider == 'ollama':
        api_key_to_use = 'ollama'  # Dummy key for Ollama
        logger.info("AI Test: Using dummy API key for Ollama")
    elif not api_key_to_use:
        logger.error("AI Test: No API key provided")
        raise HTTPException(status_code=400, detail="API key is required for this provider")
    
    model = data.model or ('llama2' if provider == 'ollama' else 'gpt-4o-mini')

    # Handle Base URL for Ollama (append /v1 if missing)
    base_url = data.base_url
    if provider == 'ollama' and base_url and not base_url.endswith('/v1'):
        base_url = base_url.rstrip('/') + '/v1'
        logger.info(f"AI Test: Appended /v1 to Ollama URL: {base_url}")

    client = AIClient(
        api_key=api_key_to_use,
        model=model,
        base_url=base_url,
    )
    client.provider = provider

    try:
        await client._post_chat(  # pyright: ignore[reportPrivateUsage]
            messages=[{'role': 'user', 'content': 'Say "Connection successful"'}],
            max_tokens=10,
        )
        return {"success": True, "message": "Connection successful"}
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code if e.response else 400
        detail = e.response.text[:300] if e.response and e.response.text else "No response body"
        logger.error(f"AI Test: HTTP {status_code}: {detail}")
        raise HTTPException(status_code=400, detail=f"API returned HTTP {status_code}: {detail}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="Connection timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI Test: Exception - {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Connection test error: {str(e)}")
