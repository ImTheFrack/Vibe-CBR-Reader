from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from dependencies import get_current_user
from db.annotations import get_annotations, add_annotation, delete_annotation, update_annotation

router = APIRouter(prefix="/api", tags=["annotations"])


class AnnotationCreate(BaseModel):
    comic_id: str
    page_number: int
    note: Optional[str] = None
    highlight_text: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None


class AnnotationUpdate(BaseModel):
    note: Optional[str] = None
    highlight_text: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None


@router.get("/annotations/{comic_id}")
async def list_annotations(
    comic_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all annotations for a comic"""
    return get_annotations(current_user['id'], comic_id)


@router.get("/annotations/{comic_id}/{page_number}")
async def get_page_annotations(
    comic_id: str,
    page_number: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get annotations for a specific page"""
    return get_annotations(current_user['id'], comic_id, page_number)


@router.post("/annotations")
async def create_annotation(
    annotation: AnnotationCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new annotation"""
    annotation_id = add_annotation(
        current_user['id'],
        annotation.comic_id,
        annotation.page_number,
        annotation.note,
        annotation.highlight_text,
        annotation.x,
        annotation.y,
        annotation.width,
        annotation.height
    )
    return {"id": annotation_id, "message": "Annotation created successfully"}


@router.delete("/annotations/{annotation_id}")
async def remove_annotation(
    annotation_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Delete an annotation"""
    deleted = delete_annotation(current_user['id'], annotation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"message": "Annotation deleted successfully"}


@router.put("/annotations/{annotation_id}")
async def edit_annotation(
    annotation_id: int,
    annotation: AnnotationUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """Update an annotation"""
    updated = update_annotation(current_user['id'], annotation_id, **annotation.dict(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"message": "Annotation updated successfully"}
