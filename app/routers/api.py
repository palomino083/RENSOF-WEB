from fastapi import APIRouter, Query

from app.db.database import SessionLocal
from app.services.content_service import get_email_accounts, get_home_content, get_publications

router = APIRouter(prefix="/api/v1", tags=["content"])


@router.get("/home-content")
def home_content():
    with SessionLocal() as session:
        content = get_home_content(session)
    return content.model_dump()


@router.get("/publications")
def publications(
    q: str = Query(default=""),
    include_drafts: bool = Query(default=False),
):
    with SessionLocal() as session:
        status_filter = None if include_drafts else "published"
        rows = get_publications(session, query=q, status=status_filter)
    return [row.model_dump() for row in rows]


@router.get("/email-accounts")
def email_accounts():
    with SessionLocal() as session:
        rows = get_email_accounts(session)
    return [row.model_dump() for row in rows]


@router.get("/health", include_in_schema=False)
@router.get("/healthz", include_in_schema=False)
def health_check():
    return {"status": "ok", "service": "rensof-web"}
