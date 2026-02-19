"""AI recommendations API routes.

Provides endpoints for AI-powered manga recommendations using Recipe Mixer.
"""

import asyncio
import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dependencies import get_current_user
from db.connection import get_db_connection
from ai.client import get_ai_client
from ai.cache import hash_request, get_cached_recommendations, cache_recommendations
from ai.prompts import RECIPE_MIXER_SYSTEM_PROMPT, build_recipe_prompt
from db.series import get_series_by_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Timeout for AI requests in seconds
AI_TIMEOUT_SECONDS = 30


# --- Pydantic Models ---


class RecommendationsRequest(BaseModel):
    """Request model for recommendations endpoint."""
    series_ids: List[int]
    attributes: Dict[str, Any] = {}
    use_web_search: bool = False
    ignore_cache: bool = False
    custom_request: str = ''


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


# --- Endpoints ---


@router.post("/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(
    data: RecommendationsRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> RecommendationsResponse:
    """Get AI-powered manga recommendations based on selected series.

    Uses Recipe Mixer system to generate recommendations by analyzing
    the base series and specified attributes (aspects to keep/change).

    Args:
        data: Request containing series_ids, attributes, and options

    Returns:
        RecommendationsResponse with list of recommendations
    """
    user_id = current_user['id']

    if not data.series_ids:
        return RecommendationsResponse(
            recommendations=[],
            message="No series provided for recommendations"
        )

    all_series = []
    for sid in data.series_ids:
        s = get_series_data(sid)
        if s:
            all_series.append(s)

    if not all_series:
        return RecommendationsResponse(
            recommendations=[],
            message="None of the provided series were found"
        )

    request_hash = hash_request(all_series, data.attributes, data.custom_request)

    cached = None if data.ignore_cache else get_cached_recommendations(user_id, request_hash)
    if cached is not None:
        logger.info(f"Returning cached recommendations for user {user_id}")
        enriched = [match_recommendation_to_library(rec) for rec in cached]
        user_prompt = build_recipe_prompt(all_series, data.attributes, data.custom_request)
        return RecommendationsResponse(
            recommendations=enriched,
            cached=True,
            prompt=user_prompt,
            system_prompt=RECIPE_MIXER_SYSTEM_PROMPT
        )

    user_prompt = build_recipe_prompt(all_series, data.attributes, data.custom_request)

    try:
        ai_client = get_ai_client()
        recommendations = await asyncio.wait_for(
            ai_client.get_recommendations(
                base_series=all_series,
                attributes=data.attributes,
                use_web_search=data.use_web_search,
                custom_request=data.custom_request,
            ),
            timeout=AI_TIMEOUT_SECONDS
        )

        if recommendations:
            cache_recommendations(user_id, request_hash, recommendations)

        if not recommendations:
            return RecommendationsResponse(
                recommendations=[],
                message="Could not generate recommendations. Check AI configuration.",
                prompt=user_prompt,
                system_prompt=RECIPE_MIXER_SYSTEM_PROMPT
            )

        enriched = [match_recommendation_to_library(rec) for rec in recommendations]

        return RecommendationsResponse(
            recommendations=enriched,
            prompt=user_prompt,
            system_prompt=RECIPE_MIXER_SYSTEM_PROMPT
        )

    except asyncio.TimeoutError:
        logger.error(f"AI request timed out after {AI_TIMEOUT_SECONDS}s for user {user_id}")
        return RecommendationsResponse(
            recommendations=[],
            message=f"AI request timed out after {AI_TIMEOUT_SECONDS} seconds. Please try again."
        )

    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        return RecommendationsResponse(
            recommendations=[],
            message=f"Error generating recommendations: {str(e)}"
        )
