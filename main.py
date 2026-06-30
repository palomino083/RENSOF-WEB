from pathlib import Path
from typing import Dict, Final

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles


BASE_DIR: Final = Path(__file__).resolve().parent
ASSETS_DIR: Final = BASE_DIR / "assets"

PAGES: Final = {
    "": "index.html",
    "index": "index.html",
    "nosotros": "nosotros.html",
    "servicios": "servicios.html",
    "proyectos": "proyectos.html",
    "publicaciones": "publicaciones.html",
    "contacto": "contacto.html",
}

SECURITY_HEADERS: Final = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

app = FastAPI(
    title="RENSOF Web",
    description="Sitio web corporativo de RENSOF servido con FastAPI.",
    version="1.0.0",
)

app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


def page_response(page_name: str) -> FileResponse:
    file_name = PAGES.get(page_name)
    if not file_name:
        raise HTTPException(status_code=404)

    file_path = BASE_DIR / file_name
    if not file_path.is_file():
        raise HTTPException(status_code=404)

    return FileResponse(file_path, media_type="text/html")


@app.get("/health", include_in_schema=False)
@app.get("/healthz", include_in_schema=False)
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "rensof-web"}


@app.get("/", response_class=HTMLResponse)
def home() -> FileResponse:
    return page_response("")


@app.get("/{page_name}", response_class=HTMLResponse, response_model=None)
def clean_page(page_name: str) -> Response:
    if page_name.endswith(".html"):
        clean_name = page_name[:-5]
        clean_path = "/" if clean_name == "index" else f"/{clean_name}"
        return RedirectResponse(clean_path, status_code=308)

    return page_response(page_name)


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException) -> HTMLResponse:
    return HTMLResponse(
        """
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Pagina no encontrada | RENSOF</title>
          <link rel="stylesheet" href="/assets/css/style.css">
        </head>
        <body>
          <main class="page-main">
            <section class="page-hero">
              <div class="container">
                <p class="eyebrow">404</p>
                <h1>Pagina no encontrada</h1>
                <p>La direccion solicitada no esta disponible o fue movida.</p>
                <a class="btn btn-success" href="/">Volver al inicio</a>
              </div>
            </section>
          </main>
        </body>
        </html>
        """,
        status_code=404,
    )
