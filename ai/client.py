import json
import logging
from typing import Optional, List, Dict, Any

import httpx

from ai.config import get_ai_settings
from ai.prompts import RECIPE_MIXER_SYSTEM_PROMPT, build_recipe_prompt

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 120.0


class AIClient:

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        settings = get_ai_settings()

        self.provider = settings.get('provider', 'openai')
        self.api_key = api_key or settings.get('api_key') or None
        self.model = model or settings.get('model', 'gpt-4o-mini') or 'gpt-4o-mini'
        self.base_url = base_url or settings.get('base_url') or None

        if not self.api_key and self.provider == 'ollama':
            self.api_key = 'ollama'

        # Only append /v1 for ollama provider (local API)
        # OpenAI already has /v1 in default URL
        # OpenRouter, Anthropic, Google use their own URL structures
        logger.debug(f"AIClient init: provider={self.provider}, base_url={self.base_url}")
        if self.provider == 'ollama' and self.base_url and not self.base_url.endswith('/v1'):
            self.base_url = self.base_url.rstrip('/') + '/v1'
            logger.debug(f"AIClient init: Appended /v1, new base_url={self.base_url}")
        else:
            logger.debug(f"AIClient init: Skipped /v1 append (provider={self.provider}, has_v1={self.base_url and self.base_url.endswith('/v1')})")

        if not self.base_url:
            self.base_url = 'https://api.openai.com/v1'

    async def _post_chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> Dict[str, Any]:
        url = (self.base_url or '').rstrip('/') + '/chat/completions'
        headers = {
            'Content-Type': 'application/json',
        }
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'

        payload = {
            'model': model or self.model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
        }

        logger.debug(f"Calling AI API: {url} with model={payload['model']}")

        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
            logger.debug(f"AI API response status: {resp.status_code}")
            if resp.status_code >= 400:
                logger.error(f"AI API error: {resp.status_code} - {resp.text[:200]}")
            resp.raise_for_status()
            return resp.json()

    async def get_recommendations(
        self,
        base_series,
        attributes: Dict[str, Any],
        use_web_search: bool = False,
        custom_request: str = '',
    ) -> List[Dict[str, Any]]:
        if not self.api_key:
            logger.error("Cannot get recommendations: no API key configured")
            return []

        try:
            user_prompt = build_recipe_prompt(base_series, attributes, custom_request)

            data = await self._post_chat(
                messages=[
                    {'role': 'system', 'content': RECIPE_MIXER_SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_prompt},
                ],
            )

            content = data['choices'][0]['message']['content']
            if not content:
                logger.warning("Empty response from AI API")
                return []

            recommendations = self._parse_recommendations(content)
            logger.info(f"Generated {len(recommendations)} recommendations")
            return recommendations

        except httpx.HTTPStatusError as e:
            logger.error(f"AI API HTTP error {e.response.status_code}: {e.response.text[:300]}")
            return []
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error getting recommendations: {e}")
            return []

    def _parse_recommendations(self, content: str) -> List[Dict[str, Any]]:
        if '```json' in content:
            start = content.find('```json') + 7
            end = content.find('```', start)
            content = content[start:end].strip()
        elif '```' in content:
            start = content.find('```') + 3
            end = content.find('```', start)
            content = content[start:end].strip()

        data = json.loads(content)

        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            if 'recommendations' in data:
                return data['recommendations']
            elif 'results' in data:
                return data['results']
            else:
                return [data]
        else:
            return []


def get_ai_client() -> AIClient:
    return AIClient()