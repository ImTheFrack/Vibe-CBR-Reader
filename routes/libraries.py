from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from dependencies import get_current_user, get_admin_user
from db.libraries import (
    get_libraries, get_library, get_default_library,
    create_library, update_library, delete_library,
    get_library_comics_count
)

router = APIRouter(prefix="/api", tags=["libraries"])


class LibraryCreate(BaseModel):
    name: str
    path: str
    is_default: bool = False


class LibraryUpdate(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    is_default: Optional[bool] = None


@router.get("/libraries")
async def list_libraries(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all libraries"""
    libraries = get_libraries()
    # Add comic counts
    for lib in libraries:
        lib['comics_count'] = get_library_comics_count(lib['id'])
    return libraries


@router.get("/libraries/{library_id}")
async def get_library_by_id(
    library_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get a specific library"""
    library = get_library(library_id)
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    library['comics_count'] = get_library_comics_count(library_id)
    return library


@router.get("/libraries/default")
async def get_default(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Optional[Dict[str, Any]]:
    """Get the default library"""
    library = get_default_library()
    if library:
        library['comics_count'] = get_library_comics_count(library['id'])
    return library


@router.post("/libraries")
async def create_new_library(
    library: LibraryCreate,
    current_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, Any]:
    """Create a new library (admin only)"""
    import os
    if not os.path.exists(library.path):
        raise HTTPException(status_code=400, detail="Path does not exist")
    
    if not os.path.isdir(library.path):
        raise HTTPException(status_code=400, detail="Path is not a directory")
    
    try:
        library_id = create_library(library.name, library.path, library.is_default)
        return {"id": library_id, "message": "Library created successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/libraries/{library_id}")
async def update_existing_library(
    library_id: int,
    library: LibraryUpdate,
    current_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, str]:
    """Update a library (admin only)"""
    if library.path:
        import os
        if not os.path.exists(library.path):
            raise HTTPException(status_code=400, detail="Path does not exist")
        if not os.path.isdir(library.path):
            raise HTTPException(status_code=400, detail="Path is not a directory")
    
    updated = update_library(library_id, **library.dict(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Library not found")
    return {"message": "Library updated successfully"}


@router.delete("/libraries/{library_id}")
async def delete_existing_library(
    library_id: int,
    current_user: Dict[str, Any] = Depends(get_admin_user)
) -> Dict[str, str]:
    """Delete a library (admin only)"""
    # Don't allow deleting the default library
    lib = get_library(library_id)
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    if lib.get('is_default'):
        raise HTTPException(status_code=400, detail="Cannot delete default library")
    
    deleted = delete_library(library_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Library not found")
    return {"message": "Library deleted successfully"}
