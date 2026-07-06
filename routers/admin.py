from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from core.config import TEMPLATES_DIR
from core.security import (
    authenticate_admin_credentials,
    clear_admin_session,
    get_or_create_csrf_token,
    is_admin_authenticated,
    set_admin_session,
    verify_csrf_token,
)
from db.database import SessionLocal
from services.content_service import (
    add_case_study,
    add_email_account,
    add_metric,
    add_publication,
    add_product,
    delete_case_study,
    delete_email_account,
    delete_metric,
    delete_publication,
    delete_product,
    get_admin_content,
    get_contact_inbox,
    get_contact_inbox_summary,
    get_email_accounts,
    get_email_areas,
    update_case_study,
    set_primary_email_account,
    update_contact_message_status,
    update_email_account,
    update_metric,
    update_publication,
    update_product,
)

router = APIRouter(prefix="/admin", tags=["admin"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def _require_admin(request: Request):
    if not is_admin_authenticated(request):
        return RedirectResponse("/admin/login", status_code=303)
    return None


def _csrf_or_redirect(request: Request, csrf_token: str):
    if not verify_csrf_token(request, csrf_token):
        return RedirectResponse("/admin/login", status_code=303)
    return None


@router.get("/login")
def admin_login_page(request: Request):
    if is_admin_authenticated(request):
        return RedirectResponse("/admin", status_code=303)

    csrf_token = get_or_create_csrf_token(request)
    return templates.TemplateResponse(
        request,
        "admin_login.html",
        {
            "page_title": "Login Admin | RENSOF",
            "page_description": "Acceso administrativo a RENSOF.",
            "active_page": "",
            "error_message": "",
            "csrf_token": csrf_token,
        },
    )


@router.post("/login")
def admin_login_submit(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    csrf_token: str = Form(...),
):
    if not verify_csrf_token(request, csrf_token):
        return templates.TemplateResponse(
            request,
            "admin_login.html",
            {
                "page_title": "Login Admin | RENSOF",
                "page_description": "Acceso administrativo a RENSOF.",
                "active_page": "",
                "error_message": "Sesion invalida. Recarga la pagina e intenta de nuevo.",
                "csrf_token": get_or_create_csrf_token(request),
            },
            status_code=403,
        )

    if authenticate_admin_credentials(username.strip(), password):
        set_admin_session(request, username.strip())
        return RedirectResponse("/admin", status_code=303)

    return templates.TemplateResponse(
        request,
        "admin_login.html",
        {
            "page_title": "Login Admin | RENSOF",
            "page_description": "Acceso administrativo a RENSOF.",
            "active_page": "",
            "error_message": "Credenciales invalidas.",
            "csrf_token": get_or_create_csrf_token(request),
        },
        status_code=401,
    )


@router.post("/logout")
def admin_logout(request: Request, csrf_token: str = Form(...)):
    if not verify_csrf_token(request, csrf_token):
        return RedirectResponse("/admin/login", status_code=303)

    clear_admin_session(request)
    request.session.pop("rensof_csrf_token", None)
    return RedirectResponse("/admin/login", status_code=303)


@router.get("")
def admin_page(request: Request):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response

    csrf_token = get_or_create_csrf_token(request)
    with SessionLocal() as session:
        content = get_admin_content(session)
    return templates.TemplateResponse(
        request,
        "admin.html",
        {
            "page_title": "Admin | RENSOF",
            "page_description": "Panel de administracion de contenido RENSOF.",
            "active_page": "admin",
            "admin_section": "dashboard",
            "csrf_token": csrf_token,
            **content,
        },
    )


@router.get("/correos")
def admin_email_accounts_page(
    request: Request,
    q: str = Query(default=""),
    area: str = Query(default=""),
    principal_only: bool = Query(default=False),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response

    csrf_token = get_or_create_csrf_token(request)
    with SessionLocal() as session:
        email_accounts = get_email_accounts(session, query=q, area=area, principal_only=principal_only)
        inbox_summary = get_contact_inbox_summary(session)
        area_options = get_email_areas(session)

    return templates.TemplateResponse(
        request,
        "admin_emails.html",
        {
            "page_title": "Correos | RENSOF Admin",
            "page_description": "Gestion de cuentas de correo RENSOF.",
            "active_page": "admin",
            "admin_section": "emails",
            "csrf_token": csrf_token,
            "email_accounts": email_accounts,
            "area_options": area_options,
            "search_query": q,
            "selected_area": area,
            "principal_only": principal_only,
            **inbox_summary,
        },
    )


@router.get("/emails")
def admin_email_accounts_legacy(request: Request):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    return RedirectResponse("/admin/correos", status_code=303)


@router.get("/publicaciones")
def admin_publications_page(request: Request):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response

    csrf_token = get_or_create_csrf_token(request)
    with SessionLocal() as session:
        content = get_admin_content(session)

    return templates.TemplateResponse(
        request,
        "admin_publications.html",
        {
            "page_title": "Publicaciones | RENSOF Admin",
            "page_description": "Gestion del repositorio editorial RENSOF.",
            "active_page": "admin",
            "admin_section": "publications",
            "csrf_token": csrf_token,
            "publications": content["publications"],
            "email_accounts": content["email_accounts"],
        },
    )


@router.get("/bandeja")
def admin_inbox_legacy(request: Request):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    return RedirectResponse("/admin/correos/bandeja", status_code=303)


@router.get("/correos/bandeja")
def admin_contact_inbox_page(
    request: Request,
    q: str = Query(default=""),
    area: str = Query(default=""),
    status: str = Query(default=""),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response

    csrf_token = get_or_create_csrf_token(request)
    with SessionLocal() as session:
        messages = get_contact_inbox(session, query=q, area=area, status=status)
        area_options = get_email_areas(session)

    return templates.TemplateResponse(
        request,
        "admin_inbox.html",
        {
            "page_title": "Bandeja de contacto | RENSOF Admin",
            "page_description": "Bandeja visual de mensajes de contacto.",
            "active_page": "admin",
            "admin_section": "inbox",
            "csrf_token": csrf_token,
            "messages": messages,
            "area_options": area_options,
            "search_query": q,
            "selected_area": area,
            "selected_status": status,
        },
    )
@router.post("/correos/{email_id}/principal")
def admin_set_primary_email(request: Request, email_id: int, csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        set_primary_email_account(session, email_id)
    return RedirectResponse("/admin/correos", status_code=303)


@router.post("/bandeja/{message_id}/status")
def admin_update_inbox_message_status(
    request: Request,
    message_id: int,
    status: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        update_contact_message_status(session, message_id, status)
    return RedirectResponse("/admin/correos/bandeja", status_code=303)


@router.post("/products/add")
def admin_add_product(request: Request, name: str = Form(...), subtitle: str = Form(...), csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        add_product(session, name, subtitle)
    return RedirectResponse("/admin", status_code=303)


@router.post("/products/{product_id}/update")
def admin_update_product(
    request: Request,
    product_id: int,
    name: str = Form(...),
    subtitle: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        update_product(session, product_id, name, subtitle)
    return RedirectResponse("/admin", status_code=303)


@router.post("/products/{product_id}/delete")
def admin_delete_product(request: Request, product_id: int, csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        delete_product(session, product_id)
    return RedirectResponse("/admin", status_code=303)


@router.post("/metrics/add")
def admin_add_metric(
    request: Request,
    metric_group: str = Form(...),
    label: str = Form(...),
    value: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        add_metric(session, metric_group, label, value)
    return RedirectResponse("/admin", status_code=303)


@router.post("/metrics/{metric_id}/update")
def admin_update_metric(
    request: Request,
    metric_id: int,
    metric_group: str = Form(...),
    label: str = Form(...),
    value: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        update_metric(session, metric_id, metric_group, label, value)
    return RedirectResponse("/admin", status_code=303)


@router.post("/metrics/{metric_id}/delete")
def admin_delete_metric(request: Request, metric_id: int, csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        delete_metric(session, metric_id)
    return RedirectResponse("/admin", status_code=303)


@router.post("/cases/add")
def admin_add_case(
    request: Request,
    title: str = Form(...),
    description: str = Form(...),
    media: str = Form(...),
    overlay: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        add_case_study(session, title, description, media, overlay)
    return RedirectResponse("/admin", status_code=303)


@router.post("/cases/{case_id}/update")
def admin_update_case(
    request: Request,
    case_id: int,
    title: str = Form(...),
    description: str = Form(...),
    media: str = Form(...),
    overlay: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        update_case_study(session, case_id, title, description, media, overlay)
    return RedirectResponse("/admin", status_code=303)


@router.post("/cases/{case_id}/delete")
def admin_delete_case(request: Request, case_id: int, csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        delete_case_study(session, case_id)
    return RedirectResponse("/admin", status_code=303)


@router.post("/publications/add")
def admin_add_publication(
    request: Request,
    title: str = Form(...),
    summary: str = Form(...),
    category: str = Form(...),
    author_name: str = Form(...),
    contact_email: str = Form(...),
    status: str = Form("draft"),
    published_at: str = Form(""),
    tags: str = Form(""),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        add_publication(session, title, summary, category, author_name, contact_email, status, published_at, tags)
    return RedirectResponse("/admin", status_code=303)


@router.post("/publications/{publication_id}/update")
def admin_update_publication(
    request: Request,
    publication_id: int,
    title: str = Form(...),
    summary: str = Form(...),
    category: str = Form(...),
    author_name: str = Form(...),
    contact_email: str = Form(...),
    status: str = Form("draft"),
    published_at: str = Form(""),
    tags: str = Form(""),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        update_publication(
            session,
            publication_id,
            title,
            summary,
            category,
            author_name,
            contact_email,
            status,
            published_at,
            tags,
        )
    return RedirectResponse("/admin", status_code=303)


@router.post("/publications/{publication_id}/delete")
def admin_delete_publication(request: Request, publication_id: int, csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        delete_publication(session, publication_id)
    return RedirectResponse("/admin", status_code=303)


@router.post("/emails/add")
def admin_add_email(
    request: Request,
    display_name: str = Form(...),
    email: str = Form(...),
    area: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        add_email_account(session, display_name, email, area)
    return RedirectResponse("/admin", status_code=303)


@router.post("/emails/{email_id}/update")
def admin_update_email(
    request: Request,
    email_id: int,
    display_name: str = Form(...),
    email: str = Form(...),
    area: str = Form(...),
    csrf_token: str = Form(...),
):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        update_email_account(session, email_id, display_name, email, area)
    return RedirectResponse("/admin", status_code=303)


@router.post("/emails/{email_id}/delete")
def admin_delete_email(request: Request, email_id: int, csrf_token: str = Form(...)):
    redirect_response = _require_admin(request)
    if redirect_response:
        return redirect_response
    csrf_redirect = _csrf_or_redirect(request, csrf_token)
    if csrf_redirect:
        return csrf_redirect
    with SessionLocal() as session:
        delete_email_account(session, email_id)
    return RedirectResponse("/admin", status_code=303)
