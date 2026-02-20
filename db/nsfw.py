import json
import sqlite3
from collections.abc import Mapping
from fnmatch import fnmatch
from typing import cast

from logger import logger
from .connection import get_db_connection
from .series import extract_tags, normalize_tag
from .settings import get_setting


def get_nsfw_config() -> dict[str, list[str]]:
    categories_raw = get_setting('nsfw_categories')
    subcategories_raw = get_setting('nsfw_subcategories')
    tag_patterns_raw = get_setting('nsfw_tag_patterns')

    def parse_list(value: str | None, default: list[str]) -> list[str]:
        if value is None:
            return list(default)
        try:
            parsed_raw = cast(object, json.loads(value))
            if isinstance(parsed_raw, list):
                parsed_list = cast(list[object], parsed_raw)
                items: list[str] = []
                for item in parsed_list:
                    item_str = str(item).strip()
                    if item_str:
                        items.append(item_str)
                return items
        except json.JSONDecodeError:
            pass
        items = [item.strip() for item in value.split(',') if item.strip()]
        return items if items else list(default)

    return {
        'categories': parse_list(categories_raw, []),
        'subcategories': parse_list(subcategories_raw, []),
        'tag_patterns': parse_list(tag_patterns_raw, get_default_nsfw_tag_patterns()),
    }


def matches_nsfw_tag_pattern(series_tags: list[str], patterns: list[str]) -> bool:
    if not series_tags or not patterns:
        return False
    normalized_tags = [normalize_tag(tag) for tag in series_tags]
    normalized_tags = [tag for tag in normalized_tags if tag]
    if not normalized_tags:
        return False
    normalized_patterns = [str(pattern).strip().lower() for pattern in patterns if str(pattern).strip()]
    for tag in normalized_tags:
        for pattern in normalized_patterns:
            if fnmatch(tag, pattern):
                return True
    return False


def determine_series_nsfw(
    series_row: Mapping[str, object] | sqlite3.Row | None,
    nsfw_config: dict[str, list[str]],
) -> bool:
    def get_value(row: Mapping[str, object] | sqlite3.Row, key: str) -> object | None:
        if isinstance(row, sqlite3.Row):
            try:
                return cast(object, row[key])
            except KeyError:
                return None
        mapping: Mapping[str, object] = row
        return mapping.get(key)

    if not series_row or get_value(series_row, 'id') is None:
        return False

    if get_value(series_row, 'is_adult'):
        return True

    category_value = get_value(series_row, 'category')
    category = str(category_value).strip().lower() if category_value is not None else ''
    if category:
        for entry in nsfw_config.get('categories', []):
            entry_norm = str(entry).strip().lower()
            if entry_norm and entry_norm in category:
                return True

    subcategory_value = get_value(series_row, 'subcategory')
    subcategory = str(subcategory_value).strip().lower() if subcategory_value is not None else ''
    if subcategory:
        for entry in nsfw_config.get('subcategories', []):
            entry_norm = str(entry).strip().lower()
            if entry_norm and entry_norm == subcategory:
                return True

    tag_sources: list[str] = []
    for key in ('genres', 'tags', 'demographics'):
        tag_sources.extend(extract_tags(get_value(series_row, key)))
    if matches_nsfw_tag_pattern(tag_sources, nsfw_config.get('tag_patterns', [])):
        return True

    return False


def recompute_nsfw_flags(conn: sqlite3.Connection | None = None) -> None:
    owns_conn = False
    if conn is None:
        conn = get_db_connection()
        owns_conn = True

    nsfw_config = get_nsfw_config()
    rows: list[sqlite3.Row] = conn.execute(
        'SELECT id, is_adult, category, subcategory, genres, tags, demographics, nsfw_override FROM series'
    ).fetchall()

    updates: list[tuple[int, int]] = []
    flagged = 0
    for row in rows:
        override = row['nsfw_override']
        if override is not None:
            is_nsfw = int(override)
        else:
            is_nsfw = 1 if determine_series_nsfw(row, nsfw_config) else 0
        updates.append((is_nsfw, row['id']))
        if is_nsfw:
            flagged += 1

    if updates:
        _ = conn.executemany('UPDATE series SET is_nsfw = ? WHERE id = ?', updates)
        _ = conn.commit()

    logger.info(f"Recomputed NSFW flags for {len(updates)} series ({flagged} flagged).")

    if owns_conn:
        _ = conn.close()


def get_default_nsfw_tag_patterns() -> list[str]:
    return [
        'adultery',
        '*breast*',
        'futanari',
        'lactation',
        'pet play',
        'scissoring',
        'voyeur',
        'sexual*',
        'sexless',
        'yaoi',
        'yuri',
        'vore',
        'armpits',
        'hypersexuality',
        'human pet',
        '*chest',
        'ero guro',
        'eroge',
        'rimjob',
        'deepthroat',
        'masochism',
        'facial',
        'anal*',
        'oral*',
        'boob*',
        'group sex',
        'cheating',
        'threesome',
        'smut',
        '* sex',
        'sex *',
        '* sex *',
        'prostitution',
        'whore',
        'incest',
        'fetish',
        'defloration',
        'femboy',
        'virginity',
        'omegaverse',
        'torture',
        'masturb*',
        'handjob',
        'cunnilingus',
        'femdom',
        'MILF',
        'fellatio',
        '* breasts',
        'rape',
        'slavery',
        'ecchi',
        'erotica',
    ]
