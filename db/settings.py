import sqlite3
from typing import Optional, Dict, Any
from .connection import get_db_connection


def get_setting(key: str) -> Optional[str]:
    """Get a single admin setting by key"""
    conn = get_db_connection()
    result = conn.execute(
        'SELECT value FROM admin_settings WHERE key = ?',
        (key,)
    ).fetchone()
    conn.close()
    return result['value'] if result else None


def set_setting(key: str, value: str) -> bool:
    """Set or update an admin setting"""
    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)',
            (key, value)
        )
        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get_all_settings() -> Dict[str, str]:
    """Get all admin settings as a dictionary"""
    conn = get_db_connection()
    results = conn.execute('SELECT key, value FROM admin_settings').fetchall()
    conn.close()
    return {row['key']: row['value'] for row in results}


def get_thumbnail_settings() -> Dict[str, Any]:
    """Get thumbnail-related settings with proper type conversion"""
    conn = get_db_connection()
    results = conn.execute('SELECT key, value FROM admin_settings').fetchall()
    conn.close()
    
    settings_dict = {row['key']: row['value'] for row in results}
    
    return {
        'quality': int(settings_dict.get('thumb_quality', '70')),
        'ratio': settings_dict.get('thumb_ratio', '9:14'),
        'width': int(settings_dict.get('thumb_width', '225')),
        'height': int(settings_dict.get('thumb_height', '350')),
        'format': settings_dict.get('thumb_format', 'webp'),
        'require_approval': int(settings_dict.get('require_approval', '0'))
    }
