import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import ASSETS_DIR, TEMPLATES_DIR
from app.core.security import security_headers_middleware
from app.db import init_db
from app.routers import admin, api, pages


def create_app() -> FastAPI:
    app = FastAPI(
        title="RENSOF Web",
        description="Plataforma de inteligencia estrategica para organizaciones de Latinoamerica.",
        version="2.0.0",
    )

    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
    app.add_middleware(
        SessionMiddleware,
        secret_key=os.getenv("RENSOF_SESSION_SECRET", "rensof-dev-session-secret"),
        same_site="lax",
        https_only=False,
        max_age=60 * 60 * 8,
    )
    app.middleware("http")(security_headers_middleware)

    app.include_router(api.router)
    app.include_router(admin.router)
    app.include_router(pages.router)

    @app.on_event("startup")
    def startup_event() -> None:
        init_db()

    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

    @app.exception_handler(404)
    async def app_not_found_handler(request: Request, exc: HTTPException) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "404.html",
            {
                "page_title": "Pagina no encontrada | RENSOF",
                "page_description": "La direccion solicitada no esta disponible o fue movida.",
                "active_page": "",
            },
            status_code=404,
        )

    return app


app = create_app()
