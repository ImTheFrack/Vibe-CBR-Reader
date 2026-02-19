from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dependencies import get_current_user
from db.lists import (
    create_list as db_create_list,
    get_list as db_get_list,
    get_user_lists as db_get_user_lists,
    update_list as db_update_list,
    delete_list as db_delete_list,
    add_series_to_list as db_add_series_to_list,
    remove_series_from_list as db_remove_series_from_list,
    get_list_items as db_get_list_items,
    reorder_list_items as db_reorder_list_items,
)

router = APIRouter(prefix="/api/lists", tags=["lists"])


# --- Pydantic Models ---

class ListCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: bool = False


class ListUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class AddItem(BaseModel):
    series_id: int
    position: Optional[int] = None


class BulkAddItems(BaseModel):
    series_ids: List[int]


class ReorderItems(BaseModel):
    item_ids: List[int]


# --- Endpoints ---

@router.get("")
async def get_lists(
    limit: int = 20,
    offset: int = 0,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get current user's lists (with pagination)"""
    all_lists = db_get_user_lists(current_user['id'])
    
    # Apply pagination
    total = len(all_lists)
    items = all_lists[offset:offset + limit]
    
    # Add item count to each list
    for lst in items:
        conn = get_db_connection()
        count = conn.execute(
            'SELECT COUNT(*) as cnt FROM user_list_items WHERE list_id = ?',
            (lst['id'],)
        ).fetchone()['cnt']
        conn.close()
        lst['item_count'] = count
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(items) < total
    }


@router.post("", status_code=201)
async def create_list(
    data: ListCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new list"""
    list_id = db_create_list(
        user_id=current_user['id'],
        name=data.name,
        description=data.description,
        is_public=data.is_public
    )
    
    if list_id is None:
        raise HTTPException(status_code=400, detail="List name already exists")
    
    return {
        "id": list_id,
        "name": data.name,
        "description": data.description,
        "is_public": data.is_public,
        "message": "List created successfully"
    }


@router.get("/{list_id}")
async def get_list_details(
    list_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get list details (auth: owner or public)"""
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    # Get items with series info
    items = db_get_list_items(list_id)
    
    return {
        "id": lst['id'],
        "user_id": lst['user_id'],
        "name": lst['name'],
        "description": lst['description'],
        "is_public": lst['is_public'],
        "created_at": lst['created_at'],
        "updated_at": lst['updated_at'],
        "items": items
    }


@router.put("/{list_id}")
async def update_list(
    list_id: int,
    data: ListUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Update list (auth: owner only)"""
    # First check if user owns the list
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    if lst['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to update this list")
    
    # Build update kwargs
    kwargs = {}
    if data.name is not None:
        kwargs['name'] = data.name
    if data.description is not None:
        kwargs['description'] = data.description
    if data.is_public is not None:
        kwargs['is_public'] = data.is_public
    
    success = db_update_list(list_id, current_user['id'], **kwargs)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update list")
    
    return {"message": "List updated successfully"}


@router.delete("/{list_id}")
async def delete_list(
    list_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Delete list (auth: owner only)"""
    # First check if user owns the list
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    if lst['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to delete this list")
    
    success = db_delete_list(list_id, current_user['id'])
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete list")
    
    return {"message": "List deleted successfully"}


@router.post("/{list_id}/items")
async def add_series_to_list(
    list_id: int,
    data: AddItem,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Add series to list"""
    # Check list exists and user has access
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    if lst['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to modify this list")
    
    # Check series exists
    from database import get_db_connection
    conn = get_db_connection()
    series_exists = conn.execute(
        'SELECT id FROM series WHERE id = ?',
        (data.series_id,)
    ).fetchone()
    conn.close()
    
    if not series_exists:
        raise HTTPException(status_code=404, detail="Series not found")
    
    success = db_add_series_to_list(list_id, data.series_id, data.position)
    
    if not success:
        raise HTTPException(status_code=400, detail="Series already in list or failed to add")
    
    return {"message": "Series added to list"}


@router.delete("/{list_id}/items/{series_id}")
async def remove_series_from_list(
    list_id: int,
    series_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Remove series from list"""
    # Check list exists and user has access
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    if lst['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to modify this list")
    
    success = db_remove_series_from_list(list_id, series_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Series not found in list")
    
    return {"message": "Series removed from list"}


@router.post("/{list_id}/reorder")
async def reorder_list(
    list_id: int,
    data: ReorderItems,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Reorder items in a list"""
    # Check list exists and user has access
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    if lst['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to modify this list")
    
    success = db_reorder_list_items(list_id, data.item_ids)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reorder items")
    
    return {"message": "List reordered successfully"}


@router.post("/{list_id}/items/bulk")
async def bulk_add_series(
    list_id: int,
    data: BulkAddItems,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Bulk add series to list (for selection mode)"""
    # Check list exists and user has access
    lst = db_get_list(list_id, current_user['id'])
    
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    
    if lst['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to modify this list")
    
    if not data.series_ids:
        raise HTTPException(status_code=400, detail="No series IDs provided")
    
    # Check series exist
    from database import get_db_connection
    conn = get_db_connection()
    
    added_count = 0
    skipped_count = 0
    
    for series_id in data.series_ids:
        series_exists = conn.execute(
            'SELECT id FROM series WHERE id = ?',
            (series_id,)
        ).fetchone()
        
        if not series_exists:
            skipped_count += 1
            continue
        
        success = db_add_series_to_list(list_id, series_id)
        if success:
            added_count += 1
        else:
            skipped_count += 1
    
    conn.close()
    
    return {
        "message": f"Added {added_count} series, skipped {skipped_count}",
        "added": added_count,
        "skipped": skipped_count
    }


# Import at bottom to avoid circular import
from database import get_db_connection
