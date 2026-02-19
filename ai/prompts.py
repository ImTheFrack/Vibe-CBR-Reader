"""Prompt engineering for Vibe CBR AI recommendations.

Contains system prompts and prompt builder for manga recommendations.
"""

RECIPE_MIXER_SYSTEM_PROMPT = """You are a manga recommendation expert called "Recipe Mixer". Your task is to analyze a base manga series and user preferences, then recommend similar manga that match their desired attributes.

When analyzing, consider these 7 attribute categories:
1. Narrative Structure & Pacing: Plot complexity, arc length, chapter vs volume release style, pacing rhythm
2. Character Archetypes & Dynamics: Protagonist type, relationship dynamics, ensemble cast patterns, antagonist design
3. World Building & Systems: Setting depth, magic/system complexity, world-building approach, lore density
4. Visual Identity: Art style, panel composition, action choreography, character design philosophy
5. Emotional Resonance: Tonal range, emotional beats, humor style, drama intensity
6. Niche Tropes & Specific Content: Genre-specific tropes, themes, content warnings, target demographics
7. Meta-Data & Context: Publication history, author style, adaptation status, cultural context

For each recommendation, provide:
- title: The manga title (Japanese or English, whichever is more recognized)
- author: Author name if known
- why: Brief explanation of how it matches the requested attributes (2-3 sentences)
- match_score: Estimated match percentage (0-100)
- attributes_matched: List of which attribute categories match

Always respond with valid JSON in one of these formats:
- A JSON array of recommendation objects
- An object with "recommendations" key containing the array

Example response format:
```json
[
  {
    "title": "Fullmetal Alchemist",
    "author": "Hiromu Arakawa",
    "why": "Shares the same narrative complexity and philosophical themes as the base series, with similar character dynamics between brothers.",
    "match_score": 92,
    "attributes_matched": ["Narrative Structure & Pacing", "Character Archetypes & Dynamics", "World Building & Systems"]
  }
]
```

Provide 5-10 recommendations that best match the user's desired attributes."""


def _format_series_block(series_data: dict, label: str = "Base Series") -> list:
    """Format a single series into prompt lines."""
    lines = []
    lines.append(f"### {label}: {series_data.get('title', 'Unknown')}")

    if series_data.get('author') or series_data.get('authors'):
        lines.append(f"**Author**: {series_data.get('author') or series_data.get('authors')}")

    if series_data.get('synopsis'):
        lines.append(f"**Synopsis**: {series_data.get('synopsis')}")

    if series_data.get('genres'):
        lines.append(f"**Genres**: {series_data.get('genres')}")

    if series_data.get('tags'):
        lines.append(f"**Tags**: {series_data.get('tags')}")

    if series_data.get('status'):
        lines.append(f"**Status**: {series_data.get('status')}")

    if series_data.get('demographics'):
        lines.append(f"**Demographics**: {series_data.get('demographics')}")

    return lines


def build_recipe_prompt(
    series_data,
    attributes: dict,
    custom_request: str = '',
) -> str:
    """Build user prompt for recipe mixing request.

    Args:
        series_data: Single series dict OR list of series dicts
        attributes: Dictionary containing the 7 attribute categories.
                    Each category should have a 'keep' or 'change' instruction.
        custom_request: Optional user-provided text to replace the default ## Request section.

    Returns:
        Formatted prompt string for the AI
    """
    prompt_parts = []

    if isinstance(series_data, list):
        all_series = series_data
    else:
        all_series = [series_data]

    prompt_parts.append("## Base Series")

    if len(all_series) == 1:
        prompt_parts.extend(_format_series_block(all_series[0]))
    else:
        prompt_parts.append(f"The user has selected {len(all_series)} series as their base:")
        for i, s in enumerate(all_series, 1):
            prompt_parts.append("")
            prompt_parts.extend(_format_series_block(s, f"Series {i}"))

    prompt_parts.append("\n## Attribute Preferences")

    # Define the 7 categories
    categories = [
        ("Narrative Structure & Pacing", "narrative"),
        ("Character Archetypes & Dynamics", "characters"),
        ("World Building & Systems", "world"),
        ("Visual Identity", "visual"),
        ("Emotional Resonance", "emotional"),
        ("Niche Tropes & Specific Content", "tropes"),
        ("Meta-Data & Context", "metadata"),
    ]

    for category_name, attr_key in categories:
        attr_data = attributes.get(attr_key, {})
        instruction = attr_data.get('instruction', 'keep')
        details = attr_data.get('details', '')

        prompt_parts.append(f"\n### {category_name}")
        prompt_parts.append(f"**Instruction**: {instruction}")

        if details:
            prompt_parts.append(f"**Details**: {details}")

    # Request
    prompt_parts.append("\n## Request")
    if custom_request and custom_request.strip():
        prompt_parts.append(custom_request.strip())
    else:
        default_request = (
            "Based on the base series and attribute preferences above, "
            "recommend 5-10 manga that match the user's desired attributes. "
            "Prioritize recommendations that align with the 'keep' attributes "
            "and specifically address any 'change' requests."
        )
        prompt_parts.append(default_request)

    return "\n".join(prompt_parts)