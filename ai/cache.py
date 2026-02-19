"""Caching for AI recommendations.

Provides caching functionality with TTL support for AI-generated recommendations.
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from db.connection import get_db_connection

logger = logging.getLogger(__name__)


def hash_request(series_data, attributes: Dict[str, Any], custom_request: str = '') -> str:
    """Generate SHA256 hash for request deduplication.

    Args:
        series_data: Single series dict or list of series dicts
        attributes: Attributes dictionary
        custom_request: User's custom request text

    Returns:
        SHA256 hash string
    """
    if isinstance(series_data, list):
        series_for_hash = [_normalize_for_hash(s) for s in series_data]
    else:
        series_for_hash = _normalize_for_hash(series_data)

    normalized = {
        'series': series_for_hash,
        'attributes': _normalize_for_hash(attributes),
        'custom_request': (custom_request or '').strip().lower(),
    }

    # Serialize to JSON with sorted keys for consistency
    json_str = json.dumps(normalized, sort_keys=True, ensure_ascii=False)

    # Generate SHA256 hash
    return hashlib.sha256(json_str.encode('utf-8')).hexdigest()


def _normalize_for_hash(data: Any) -> Any:
    """Normalize data for consistent hashing.

    Recursively processes data to ensure consistent representation.

    Args:
        data: Data to normalize

    Returns:
        Normalized data
    """
    if isinstance(data, dict):
        return {k: _normalize_for_hash(v) for k, v in sorted(data.items())}
    elif isinstance(data, list):
        return [_normalize_for_hash(item) for item in data]
    elif isinstance(data, str):
        return data.strip().lower()
    elif isinstance(data, (int, float, bool, type(None))):
        return data
    else:
        return str(data)


def get_cached_recommendations(
    user_id: int,
    request_hash: str,
) -> Optional[List[Dict[str, Any]]]:
    """Get cached recommendations if they exist and are not expired.

    Args:
        user_id: User ID
        request_hash: SHA256 hash of the request

    Returns:
        List of recommendations if cache hit, None if miss or expired
    """
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            """
            SELECT recommendations, expires_at
            FROM ai_recommendation_cache
            WHERE user_id = ? AND request_hash = ?
            """,
            (user_id, request_hash),
        )
        row = cursor.fetchone()

        if not row:
            logger.debug(f"Cache miss for user {user_id}, hash {request_hash[:8]}...")
            return None

        # Check if expired
        expires_at = row['expires_at']
        if expires_at:
            expires_datetime = datetime.fromisoformat(expires_at)
            if datetime.now() > expires_datetime:
                logger.debug(f"Cache expired for user {user_id}, hash {request_hash[:8]}...")
                # Clean up expired entry
                conn.execute(
                    "DELETE FROM ai_recommendation_cache WHERE user_id = ? AND request_hash = ?",
                    (user_id, request_hash),
                )
                conn.commit()
                return None

        # Return cached recommendations
        recommendations_json = row['recommendations']
        if recommendations_json:
            recommendations = json.loads(recommendations_json)
            logger.debug(f"Cache hit for user {user_id}, hash {request_hash[:8]}...")
            return recommendations

        return None

    except Exception as e:
        logger.error(f"Error getting cached recommendations: {e}")
        return None
    finally:
        conn.close()


def cache_recommendations(
    user_id: int,
    request_hash: str,
    recommendations: List[Dict[str, Any]],
    ttl_hours: int = 24,
) -> bool:
    """Cache recommendations with TTL.

    Args:
        user_id: User ID
        request_hash: SHA256 hash of the request
        recommendations: List of recommendation dictionaries
        ttl_hours: Time to live in hours (default: 24)

    Returns:
        True if cached successfully, False on error
    """
    conn = get_db_connection()
    try:
        # Calculate expiration time
        expires_at = datetime.now() + timedelta(hours=ttl_hours)

        # Serialize recommendations to JSON
        recommendations_json = json.dumps(recommendations, ensure_ascii=False)

        # Insert or replace in cache
        conn.execute(
            """
            INSERT OR REPLACE INTO ai_recommendation_cache
            (user_id, request_hash, recommendations, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, request_hash, recommendations_json, datetime.now().isoformat(), expires_at.isoformat()),
        )
        conn.commit()

        logger.debug(f"Cached {len(recommendations)} recommendations for user {user_id}, hash {request_hash[:8]}...")
        return True

    except Exception as e:
        logger.error(f"Error caching recommendations: {e}")
        return False
    finally:
        conn.close()


def clear_user_cache(user_id: int) -> int:
    """Clear all cached recommendations for a user.

    Args:
        user_id: User ID

    Returns:
        Number of entries cleared
    """
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM ai_recommendation_cache WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
        count = cursor.rowcount
        logger.info(f"Cleared {count} cached recommendations for user {user_id}")
        return count
    except Exception as e:
        logger.error(f"Error clearing user cache: {e}")
        return 0
    finally:
        conn.close()


def clear_expired_cache() -> int:
    """Clear all expired cache entries.

    Returns:
        Number of entries cleared
    """
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM ai_recommendation_cache WHERE expires_at < ?",
            (datetime.now().isoformat(),),
        )
        conn.commit()
        count = cursor.rowcount
        if count > 0:
            logger.info(f"Cleared {count} expired recommendation cache entries")
        return count
    except Exception as e:
        logger.error(f"Error clearing expired cache: {e}")
        return 0
    finally:
        conn.close()