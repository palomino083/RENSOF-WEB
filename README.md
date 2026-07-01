# RENSOF WEB

Version escalable con FastAPI + templates Jinja2 para posicionar RENSOF como plataforma de inteligencia estrategica.

## Arquitectura

- app/core: configuracion y seguridad.
- app/db: SQLite + SQLAlchemy (modelos, inicializacion y seed).
- app/models: modelos de dominio (contenido de plataforma).
- app/services: logica de negocio y orquestacion de contenido.
- app/routers: rutas web y API.
- templates: vistas dinamicas del sitio.
- assets: estilos, imagenes y scripts.

## Ejecutar

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## Despliegue en Render

El acceso real a ALVENT dentro de RENSOF requiere tres servicios activos:

- RENSOF web: FastAPI principal de este repositorio.
- ALVENT frontend: Next.js en apps/alvent/frontend.
- ALVENT backend: FastAPI en apps/alvent/backend.

El archivo [render.yaml](render.yaml) deja preparada una blueprint base para publicar los tres servicios desde el monorepo.

Notas importantes:

- Si ALVENT_FRONTEND_ORIGIN apunta a localhost o a una URL caída, RENSOF mostrará el modo de contingencia.
- El frontend ALVENT debe estar desplegado y responder para que /alven/app/login y /alven/app/dashboard abran el aplicativo completo.
- El backend ALVENT debe estar desplegado para que el login y los módulos operen sin fallback.

## Endpoints clave

- Home dinamico: /
- Paginas dinamicas: /servicios, /alven, /proyectos, /nosotros, /publicaciones, /contacto
- App ALVENT proxificada: /alven/app/login
- API ALVENT proxificada: /alven/api
- Panel admin minimo: /admin
- API de contenido: /api/v1/home-content
- API editorial: /api/v1/publications
- API correos: /api/v1/email-accounts
- Health checks: /api/v1/health y /api/v1/healthz

La base de datos SQLite se crea automaticamente al iniciar la app (archivo rensof.db) y se carga con datos iniciales.

## Seguridad admin

El acceso a /admin usa login por formulario + sesion segura por cookie (sin popup HTTP Basic).

- Variable de entorno usuario: RENSOF_ADMIN_USER
- Variable de entorno clave: RENSOF_ADMIN_PASSWORD
- Variable de entorno para firma de sesion: RENSOF_SESSION_SECRET
- Variable de entorno origen frontend ALVENT: ALVENT_FRONTEND_ORIGIN
- Variable de entorno origen backend ALVENT: ALVENT_BACKEND_ORIGIN
- Variable de entorno de entrada ALVENT en RENSOF: ALVENT_APP_URL
- Referencia de ejemplo: .env.example

La clave admin puede dejarse en texto plano para desarrollo o definirse como hash PBKDF2 con este formato:

- pbkdf2_sha256$<iteraciones>$<salt_hex>$<hash_hex>

Rutas:

- Login: /admin/login
- Logout: POST /admin/logout
- Panel: /admin

Todos los formularios del panel incluyen CSRF y requieren una sesion valida.

## Migraciones (Alembic)

```bash
alembic upgrade head
alembic revision -m "descripcion_del_cambio"
alembic revision --autogenerate -m "descripcion_del_cambio"
alembic downgrade -1
```

Flujo recomendado de desarrollo:

1. Modificar modelos SQLAlchemy en app/db/models.py.
2. Generar migracion con autogenerate.
3. Revisar el archivo generado en alembic/versions/.
4. Aplicar migracion con alembic upgrade head.

## Repositorio editorial y correos

- El panel admin permite CRUD de publicaciones persistentes.
- Cada publicacion maneja estado (draft/published), fecha de publicacion y tags.
- El panel admin permite CRUD de cuentas de correo.
- Cada publicacion puede asignarse a un correo de contacto.
- El formulario de contacto muestra correos asignables por area.
- La pagina publica /publicaciones incorpora buscador por texto y muestra tags/fecha/estado.
