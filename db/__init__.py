from .connection import get_db_connection, init_db
from .comics import delete_comics_by_ids, get_pending_comics, update_comic_metadata
from .users import (
    create_user, authenticate_user, create_session, validate_session, 
    delete_session, get_all_users, delete_user, update_user_role, 
    update_user_password, user_exists
)
from .progress import (
    get_reading_progress, update_reading_progress, clear_reading_progress,
    delete_reading_progress, get_user_preferences, update_user_preferences,
    get_bookmarks, add_bookmark, remove_bookmark, get_user_stats
)
from .series import (
    create_or_update_series, get_series_by_name, get_series_with_comics,
    update_comic_series_id, get_all_series, get_series_by_tags, invalidate_tag_cache,
    search_series, get_gaps_report, add_rating, get_series_rating, get_user_rating,
    force_rebuild_fts, warm_up_metadata_cache
)
from .jobs import (
    create_scan_job, update_scan_progress, complete_scan_job,
    get_scan_status, get_latest_scan_job, get_running_scan_job
)
from .settings import (
    get_setting, set_setting, get_all_settings, get_thumbnail_settings
)
