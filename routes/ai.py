"""AI recommendations API routes.

Provides endpoints for AI-powered manga recommendations using Recipe Mixer.
"""

import asyncio
import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel

from dependencies import get_current_user
from db.connection import get_db_connection
from ai.client import get_ai_client
from ai.cache import hash_request, get_cached_recommendations, cache_recommendations
from ai.prompts import RECIPE_MIXER_SYSTEM_PROMPT, build_recipe_prompt
from ai.jobs import create_job, get_job, update_job, cleanup_old_jobs
from db.series import get_series_by_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Timeout for AI requests in seconds
AI_TIMEOUT_SECONDS = 120


# --- Pydantic Models ---


class RecommendationsRequest(BaseModel):
    """Request model for recommendations endpoint."""
    series_ids: List[int]
    attributes: Dict[str, Any] = {}
    use_web_search: bool = False
    ignore_cache: bool = False
    custom_request: str = ''


class RecommendationJobStart(BaseModel):
    job_id: str
    message: str


class RecommendationJobStatus(BaseModel):
    id: str
    status: str
    progress_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class RecommendationItem(BaseModel):
    """Single recommendation item."""
    title: Optional[str] = None
    reason: Optional[str] = None
    # Additional fields may be present from AI response


class RecommendationsResponse(BaseModel):
    """Response model for recommendations endpoint."""
    recommendations: List[Dict[str, Any]] = []
    message: Optional[str] = None
    cached: bool = False
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None


# --- Helper Functions ---


def get_series_data(series_id: int) -> Optional[Dict[str, Any]]:
    """Fetch series metadata from database.

    Args:
        series_id: ID of the series to fetch

    Returns:
        Series data dictionary or None if not found
    """
    conn = get_db_connection()
    try:
        row = conn.execute(
            '''
            SELECT id, name, title, title_english, title_japanese, synonyms,
                   authors, synopsis, genres, tags, demographics, status,
                   total_volumes, total_chapters, release_year
            FROM series WHERE id = ?
            ''',
            (series_id,)
        ).fetchone()

        if not row:
            return None

        # Convert to dict, handling None values
        return {k: row[k] for k in row.keys() if row[k] is not None}
    finally:
        conn.close()


def _normalize_unicode(text: str) -> str:
    """Normalize unicode characters that AI models often substitute."""
    import unicodedata
    replacements = {
        '\u00d7': 'x',   # × → x
        '\u2013': '-',    # – → -
        '\u2014': '-',    # — → -
        '\u2018': "'",    # ' → '
        '\u2019': "'",    # ' → '
        '\u201c': '"',    # " → "
        '\u201d': '"',    # " → "
        '\uff1a': ':',    # ： → :
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return unicodedata.normalize('NFKC', text)


def _extract_search_names(title: str) -> List[str]:
    import re
    names = [title]

    normalized = _normalize_unicode(title)
    if normalized != title:
        names.append(normalized)

    paren_match = re.match(r'^(.+?)\s*\((.+?)\)\s*$', title)
    if paren_match:
        names.append(paren_match.group(1).strip())
        names.append(paren_match.group(2).strip())

    if ':' in title:
        names.append(title.split(':')[0].strip())

    seen = set()
    deduped = []
    for n in names:
        if n not in seen:
            seen.add(n)
            deduped.append(n)
    return deduped


def _enrich_series_match(series: Dict[str, Any]) -> Dict[str, Any]:
    """Add cover_comic_id to a series match if missing."""
    if series.get('cover_comic_id'):
        return series
    conn = get_db_connection()
    try:
        cover = conn.execute(
            'SELECT id FROM comics WHERE series_id = ? LIMIT 1',
            (series['id'],)
        ).fetchone()
        if cover:
            series['cover_comic_id'] = cover['id']
    finally:
        conn.close()
    return series


def match_recommendation_to_library(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Match an AI recommendation against the library.
    
    Returns single match (in_library=True) or multiple candidates
    (library_matches=[...]) for user disambiguation.
    """
    title = rec.get('title', '')
    if not title:
        return rec
    
    search_names = _extract_search_names(title)
    all_matches = {}
    
    for name in search_names:
        # 1) Exact name match — immediate winner
        exact = get_series_by_name(name)
        if exact:
            exact = _enrich_series_match(exact)
            rec['series_id'] = exact['id']
            rec['series_name'] = exact.get('name') or exact.get('title')
            rec['cover_comic_id'] = exact.get('cover_comic_id')
            rec['in_library'] = True
            return rec
        
        # 2) LIKE across name, title, title_english, title_japanese
        conn = get_db_connection()
        try:
            rows = conn.execute(
                '''SELECT * FROM series 
                   WHERE name LIKE ? OR title LIKE ? 
                   OR title_english LIKE ? OR title_japanese LIKE ?
                   LIMIT 10''',
                (f'%{name}%', f'%{name}%', f'%{name}%', f'%{name}%')
            ).fetchall()
            for r in rows:
                all_matches[r['id']] = dict(r)
            
            # 3) Synonyms search
            rows = conn.execute(
                'SELECT * FROM series WHERE synonyms LIKE ? LIMIT 10',
                (f'%{name}%',)
            ).fetchall()
            for r in rows:
                all_matches[r['id']] = dict(r)
        finally:
            conn.close()
    
    matches = list(all_matches.values())
    
    if len(matches) == 1:
        series = _enrich_series_match(matches[0])
        rec['series_id'] = series['id']
        rec['series_name'] = series.get('name') or series.get('title')
        rec['cover_comic_id'] = series.get('cover_comic_id')
        rec['in_library'] = True
    elif len(matches) > 1:
        rec['in_library'] = 'multiple'
        rec['library_matches'] = [
            {
                'id': _enrich_series_match(m)['id'],
                'name': m.get('name') or m.get('title'),
                'cover_comic_id': m.get('cover_comic_id'),
            }
            for m in matches
        ]
    else:
        rec['in_library'] = False
    
    return rec


async def generate_recommendations_task(job_id: str, data: RecommendationsRequest, user_id: int):
    """Background task to generate recommendations."""
    update_job(job_id, status="processing", message="Analyzing request...")
    
    try:
        # 1. Fetch Series Data
        all_series = []
        for sid in data.series_ids:
            s = get_series_data(sid)
            if s:
                all_series.append(s)

        if not all_series and data.series_ids:
            update_job(job_id, error="None of the provided series were found")
            return

        # 2. Check Cache
        request_hash = hash_request(all_series, data.attributes, data.custom_request)
        cached = None if data.ignore_cache else get_cached_recommendations(user_id, request_hash)
        
        if cached is not None:
            logger.info(f"Returning cached recommendations for user {user_id}")
            enriched = [match_recommendation_to_library(rec) for rec in cached]
            user_prompt = build_recipe_prompt(all_series, data.attributes, data.custom_request)
            
            result = {
                "recommendations": enriched,
                "cached": True,
                "prompt": user_prompt,
                "system_prompt": RECIPE_MIXER_SYSTEM_PROMPT
            }
            update_job(job_id, result=result, message="Completed (Cached)")
            return

        # 3. Call AI
        user_prompt = build_recipe_prompt(all_series, data.attributes, data.custom_request)
        
        # Define progress callback
        received_chars = 0
        async def progress(delta: str):
            nonlocal received_chars
            received_chars += len(delta)
            # Update status every ~50 chars to avoid spamming updates
            if received_chars % 50 < len(delta) or received_chars < 100:
                update_job(job_id, message=f"Receiving response... ({received_chars} chars)")

        ai_client = get_ai_client()
        update_job(job_id, message="Contacting AI provider...")
        
        recommendations = await asyncio.wait_for(
            ai_client.get_recommendations(
                base_series=all_series,
                attributes=data.attributes,
                use_web_search=data.use_web_search,
                custom_request=data.custom_request,
                progress_callback=progress,
            ),
            timeout=AI_TIMEOUT_SECONDS
        )

        if recommendations:
            cache_recommendations(user_id, request_hash, recommendations)

        if not recommendations:
            update_job(job_id, error="Could not generate recommendations. Check AI configuration.")
            return

        # 4. Process Results
        update_job(job_id, message="Processing library matches...")
        enriched = [match_recommendation_to_library(rec) for rec in recommendations]

        result = {
            "recommendations": enriched,
            "prompt": user_prompt,
            "system_prompt": RECIPE_MIXER_SYSTEM_PROMPT,
            "cached": False
        }
        update_job(job_id, result=result, message="Completed")

    except asyncio.TimeoutError:
        logger.error(f"AI request timed out for job {job_id}")
        update_job(job_id, error=f"AI request timed out after {AI_TIMEOUT_SECONDS} seconds.")
    except Exception as e:
        logger.error(f"Error in recommendation job {job_id}: {e}")
        update_job(job_id, error=str(e))


# --- Endpoints ---


@router.post("/recommendations", response_model=RecommendationJobStart)
async def start_recommendations_job(
    data: RecommendationsRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> RecommendationJobStart:
    """Start a background job to generate AI recommendations."""
    cleanup_old_jobs()  # Maintenance
    
    job_id = create_job()
    background_tasks.add_task(generate_recommendations_task, job_id, data, current_user['id'])
    
    return RecommendationJobStart(job_id=job_id, message="Recommendation job started")


@router.get("/recommendations/status/{job_id}", response_model=RecommendationJobStatus)
async def get_recommendation_status(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> RecommendationJobStatus:
    """Get the status of a recommendation job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return RecommendationJobStatus(
        id=job['id'],
        status=job['status'],
        progress_message=job['progress_message'],
        result=job['result'],
        error=job['error']
    )
