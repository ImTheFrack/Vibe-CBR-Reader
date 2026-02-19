from typing import Dict, Any
from config import (
    VIBE_AI_PROVIDER,
    VIBE_AI_MODEL,
    VIBE_AI_API_KEY,
    VIBE_AI_BASE_URL,
    VIBE_AI_WEB_SEARCH_DEFAULT,
)


def get_ai_settings() -> Dict[str, Any]:
    """
    Load AI settings with precedence: database settings > environment variables.
    Database settings (from admin UI) take precedence over environment defaults.
    """
    from db.settings import get_setting
    
    db_provider = get_setting('ai_provider')
    db_model = get_setting('ai_model')
    db_api_key = get_setting('ai_api_key')
    db_base_url = get_setting('ai_base_url')
    db_web_search = get_setting('ai_web_search_default')
    
    settings = {
        'provider': db_provider or VIBE_AI_PROVIDER,
        'model': db_model or VIBE_AI_MODEL,
        'api_key': db_api_key or VIBE_AI_API_KEY,
        'base_url': db_base_url or VIBE_AI_BASE_URL,
        'web_search_default': db_web_search.lower() == 'true' if db_web_search else VIBE_AI_WEB_SEARCH_DEFAULT,
    }

    return settings


def get_ai_config() -> Dict[str, Any]:
    """Alias for get_ai_settings() for backward compatibility."""
    return get_ai_settings()


def is_ai_configured() -> bool:
    """Check if AI is properly configured with an API key."""
    settings = get_ai_settings()
    return bool(settings.get('api_key'))
