"""Tests for AI package functionality."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json

from ai.client import AIClient, get_ai_client
from ai.prompts import RECIPE_MIXER_SYSTEM_PROMPT, build_recipe_prompt
from ai.cache import (
    hash_request,
    get_cached_recommendations,
    cache_recommendations,
    clear_user_cache,
)


class TestAIClientInitialization:
    """Test AI client initialization."""

    def test_ai_client_initialization(self):
        """Test that client creates with config."""
        client = AIClient(api_key="test-key", model="gpt-4o-mini")

        assert client.api_key == "test-key"
        assert client.model == "gpt-4o-mini"
        assert client.base_url is not None

    def test_ai_client_with_base_url(self):
        """Test client with custom base_url."""
        client = AIClient(
            api_key="test-key",
            model="gpt-4o-mini",
            base_url="https://custom.api.com/v1"
        )

        assert client.base_url == "https://custom.api.com/v1"

    def test_get_ai_client_factory(self):
        """Test factory function returns client."""
        with patch('ai.client.get_ai_settings') as mock_settings:
            mock_settings.return_value = {
                'api_key': 'test-key',
                'model': 'gpt-4o-mini',
                'base_url': None,
                'web_search_default': False,
            }
            client = get_ai_client()
            assert isinstance(client, AIClient)


class TestAIGetRecommendations:
    """Test AI recommendation generation."""

    @pytest.mark.asyncio
    async def test_ai_get_recommendations_success(self):
        """Test that client returns recommendations on success."""
        fake_api_response = {
            "choices": [{
                "message": {
                    "content": json.dumps([{
                        "title": "Test Manga",
                        "author": "Test Author",
                        "why": "Great match",
                        "match_score": 90,
                        "attributes_matched": ["Narrative Structure & Pacing"]
                    }])
                }
            }]
        }

        client = AIClient(api_key="test-key")

        with patch.object(client, '_post_chat', new_callable=AsyncMock, return_value=fake_api_response):
            base_series = {
                "title": "One Piece",
                "synopsis": "Pirate adventure",
                "author": "Eiichiro Oda"
            }
            attributes = {
                "narrative": {"instruction": "keep"},
                "characters": {"instruction": "keep"},
                "world": {"instruction": "keep"},
                "visual": {"instruction": "keep"},
                "emotional": {"instruction": "keep"},
                "tropes": {"instruction": "keep"},
                "metadata": {"instruction": "keep"},
            }

            result = await client.get_recommendations(base_series, attributes)

            assert len(result) == 1
            assert result[0]["title"] == "Test Manga"

    @pytest.mark.asyncio
    async def test_ai_get_recommendations_cached(self, test_db):
        """Test that cached recommendations are returned on second call."""
        test_recommendations = [
            {"title": "Cached Manga", "match_score": 85}
        ]
        test_hash = "abc123"

        cache_recommendations(1, test_hash, test_recommendations)

        result = get_cached_recommendations(1, test_hash)

        assert result == test_recommendations

    @pytest.mark.asyncio
    async def test_ai_graceful_failure(self):
        """Test that client returns empty list on API error."""
        import httpx

        client = AIClient(api_key="test-key")

        async def raise_http_error(*args, **kwargs):
            raise httpx.HTTPStatusError(
                "API Error",
                request=httpx.Request("POST", "http://test"),
                response=httpx.Response(500, text="Internal Server Error"),
            )

        with patch.object(client, '_post_chat', side_effect=raise_http_error):
            base_series = {"title": "Test"}
            attributes = {"narrative": {"instruction": "keep"}}

            result = await client.get_recommendations(base_series, attributes)

            assert result == []

    @pytest.mark.asyncio
    async def test_ai_graceful_failure_no_api_key(self):
        """Test that client returns empty list when no API key."""
        with patch('ai.config.get_ai_settings') as mock_settings:
            mock_settings.return_value = {
                'api_key': None,
                'model': 'gpt-4o-mini',
                'base_url': None,
                'web_search_default': False,
            }
            client = AIClient()

            base_series = {"title": "Test"}
            attributes = {"narrative": {"instruction": "keep"}}

            result = await client.get_recommendations(base_series, attributes)

            assert result == []


class TestPrompts:
    """Test prompt engineering."""

    def test_prompt_includes_all_categories(self):
        """Test that all 7 categories are included in prompt."""
        series_data = {
            "title": "Test Series",
            "synopsis": "A great series"
        }
        attributes = {
            "narrative": {"instruction": "keep", "details": "Fast pacing"},
            "characters": {"instruction": "change", "details": "More ensemble"},
            "world": {"instruction": "keep"},
            "visual": {"instruction": "keep"},
            "emotional": {"instruction": "keep"},
            "tropes": {"instruction": "keep"},
            "metadata": {"instruction": "keep"},
        }

        prompt = build_recipe_prompt(series_data, attributes)

        assert "Narrative Structure & Pacing" in prompt
        assert "Character Archetypes & Dynamics" in prompt
        assert "World Building & Systems" in prompt
        assert "Visual Identity" in prompt
        assert "Emotional Resonance" in prompt
        assert "Niche Tropes & Specific Content" in prompt
        assert "Meta-Data & Context" in prompt

    def test_prompt_includes_series_data(self):
        """Test that series data is included in prompt."""
        series_data = {
            "title": "One Piece",
            "author": "Eiichiro Oda",
            "synopsis": "Pirate adventure",
            "genres": "Action, Adventure",
            "tags": "Pirates, Treasure",
            "status": "Ongoing",
            "demographics": "Shonen"
        }
        attributes = {
            "narrative": {"instruction": "keep"},
            "characters": {"instruction": "keep"},
            "world": {"instruction": "keep"},
            "visual": {"instruction": "keep"},
            "emotional": {"instruction": "keep"},
            "tropes": {"instruction": "keep"},
            "metadata": {"instruction": "keep"},
        }

        prompt = build_recipe_prompt(series_data, attributes)

        assert "One Piece" in prompt
        assert "Eiichiro Oda" in prompt
        assert "Pirate adventure" in prompt

    def test_prompt_handles_keep_instruction(self):
        """Test that keep instruction is properly included."""
        series_data = {"title": "Test"}
        attributes = {
            "narrative": {"instruction": "keep", "details": "Long arcs"},
            "characters": {"instruction": "keep"},
            "world": {"instruction": "keep"},
            "visual": {"instruction": "keep"},
            "emotional": {"instruction": "keep"},
            "tropes": {"instruction": "keep"},
            "metadata": {"instruction": "keep"},
        }

        prompt = build_recipe_prompt(series_data, attributes)

        assert "keep" in prompt.lower()
        assert "Long arcs" in prompt

    def test_prompt_handles_change_instruction(self):
        """Test that change instruction is properly included."""
        series_data = {"title": "Test"}
        attributes = {
            "narrative": {"instruction": "change", "details": "Shorter arcs"},
            "characters": {"instruction": "keep"},
            "world": {"instruction": "keep"},
            "visual": {"instruction": "keep"},
            "emotional": {"instruction": "keep"},
            "tropes": {"instruction": "keep"},
            "metadata": {"instruction": "keep"},
        }

        prompt = build_recipe_prompt(series_data, attributes)

        assert "change" in prompt.lower()
        assert "Shorter arcs" in prompt


class TestCache:
    """Test caching functionality."""

    def test_hash_request(self):
        """Test request hashing produces consistent results."""
        series_data = {"title": "One Piece", "author": "Oda"}
        attributes = {"narrative": {"instruction": "keep"}}

        hash1 = hash_request(series_data, attributes)
        hash2 = hash_request(series_data, attributes)

        assert hash1 == hash2
        assert len(hash1) == 64

    def test_hash_request_different_inputs(self):
        """Test different inputs produce different hashes."""
        series1 = {"title": "One Piece"}
        series2 = {"title": "Naruto"}
        attributes = {"narrative": {"instruction": "keep"}}

        hash1 = hash_request(series1, attributes)
        hash2 = hash_request(series2, attributes)

        assert hash1 != hash2

    def test_cache_recommendations(self, test_db):
        """Test caching recommendations."""
        recommendations = [
            {"title": "Test Manga", "match_score": 90}
        ]

        result = cache_recommendations(1, "test-hash-123", recommendations)

        assert result is True

    def test_get_cached_recommendations(self, test_db):
        """Test retrieving cached recommendations."""
        recommendations = [
            {"title": "Cached", "match_score": 85}
        ]

        cache_recommendations(1, "test-hash-456", recommendations)

        cached = get_cached_recommendations(1, "test-hash-456")

        assert cached is not None
        assert len(cached) == 1
        assert cached[0]["title"] == "Cached"

    def test_get_cached_recommendations_miss(self, test_db):
        """Test cache miss returns None."""
        result = get_cached_recommendations(1, "nonexistent-hash")

        assert result is None

    def test_clear_user_cache(self, test_db):
        """Test clearing user cache."""
        clear_user_cache(1)
        clear_user_cache(2)

        recommendations = [{"title": "Test"}]
        cache_recommendations(1, "hash-1", recommendations)
        cache_recommendations(1, "hash-2", recommendations)

        count = clear_user_cache(1)

        assert count == 2

        cached1 = get_cached_recommendations(1, "hash-1")
        cached2 = get_cached_recommendations(1, "hash-2")

        assert cached1 is None
        assert cached2 is None


class TestSystemPrompt:
    """Test system prompt content."""

    def test_system_prompt_exists(self):
        """Test that system prompt is defined."""
        assert RECIPE_MIXER_SYSTEM_PROMPT is not None
        assert len(RECIPE_MIXER_SYSTEM_PROMPT) > 0

    def test_system_prompt_includes_categories(self):
        """Test system prompt mentions all categories."""
        assert "Narrative Structure & Pacing" in RECIPE_MIXER_SYSTEM_PROMPT
        assert "Character Archetypes & Dynamics" in RECIPE_MIXER_SYSTEM_PROMPT
        assert "World Building & Systems" in RECIPE_MIXER_SYSTEM_PROMPT
        assert "Visual Identity" in RECIPE_MIXER_SYSTEM_PROMPT
        assert "Emotional Resonance" in RECIPE_MIXER_SYSTEM_PROMPT
        assert "Niche Tropes & Specific Content" in RECIPE_MIXER_SYSTEM_PROMPT
        assert "Meta-Data & Context" in RECIPE_MIXER_SYSTEM_PROMPT