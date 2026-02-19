import json
import logging
from typing import Optional, List, Dict, Any, Callable

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
        progress_callback: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """
        Send a chat completion request to the AI provider.
        Supports streaming responses if progress_callback is provided.
        """
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

        # Enable streaming if a callback is provided
        if progress_callback:
            payload['stream'] = True

        logger.debug(f"Calling AI API: {url} with model={payload['model']}, stream={bool(progress_callback)}")

        full_content = ""
        
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            if progress_callback:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    logger.debug(f"AI API streaming response status: {response.status_code}")
                    if response.status_code >= 400:
                        content = await response.read()
                        logger.error(f"AI API error: {response.status_code} - {content[:200]}")
                        response.raise_for_status()

                    buffer = ""
                    sse_encountered = False
                    
                    async for chunk in response.aiter_bytes():
                        # Decode chunk and add to buffer
                        try:
                            text_chunk = chunk.decode("utf-8")
                        except UnicodeDecodeError:
                            # Fallback for split multi-byte characters (simplistic but usually sufficient for stream)
                            text_chunk = chunk.decode("utf-8", errors="replace")
                        
                        buffer += text_chunk
                        
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                                
                            if line.startswith("data: "):
                                sse_encountered = True
                                data_str = line[len("data: "):].strip()
                                if data_str == "[DONE]":
                                    continue
                                try:
                                    chunk_data = json.loads(data_str)
                                    choices = chunk_data.get('choices', [])
                                    if choices:
                                        delta = choices[0].get('delta', {}).get('content', '')
                                        if delta:
                                            full_content += delta
                                            if progress_callback:
                                                try:
                                                    await progress_callback(delta)
                                                except Exception as e:
                                                    logger.warning(f"Progress callback failed: {e}")
                                except json.JSONDecodeError:
                                    pass
                                except Exception as e:
                                    logger.warning(f"Error processing stream chunk: {e}")
                    
                    # Fallback: If no SSE was processed, try parsing the whole buffer as JSON
                    # This handles providers that ignore stream=True and return a normal response
                    if not sse_encountered and not full_content:
                        # Re-assemble the buffer with any remaining part
                        full_body = buffer
                        try:
                            # Try to read the already consumed response if buffer logic was partial
                            # But since we iterated aiter_bytes, we rely on what we captured.
                            # Ideally we captured everything.
                            data = json.loads(full_body)
                            if isinstance(data, dict):
                                choices = data.get('choices', [])
                                if choices:
                                    # Standard non-streamed response structure uses 'message' not 'delta'
                                    content = choices[0].get('message', {}).get('content', '')
                                    if content:
                                        full_content = content
                        except json.JSONDecodeError:
                            logger.warning("Failed to parse non-streamed response as JSON")


                return {
                    'choices': [{
                        'message': {'content': full_content}
                    }]
                }

            else:
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
        progress_callback: Optional[Callable[[str], None]] = None,
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
                progress_callback=progress_callback
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