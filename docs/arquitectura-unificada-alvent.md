# Arquitectura Unificada RENSOF + ALVENT

## Objetivo

Operar una sola arquitectura en un mismo repositorio (RENSOF-WEB), con ALVENT integrado por subrutas y proxy interno.

## Decisiones aplicadas

- Se incorporo ALVENT en apps/alvent (backend y frontend).
- Se habilito proxy FastAPI en RENSOF:
  - /alven/app -> frontend ALVENT
  - /alven/api -> backend ALVENT
- /alven es la ruta canonica de experiencia comercial.
- /alvent mantiene compatibilidad legacy con redireccion 308 a /alven.

## Variables de entorno relevantes

- ALVENT_FRONTEND_ORIGIN (ejemplo local: http://127.0.0.1:3100)
- ALVENT_BACKEND_ORIGIN (ejemplo local: http://127.0.0.1:8100)
- ALVENT_APP_URL (recomendado: /alven/app/login)

## Flujo de navegacion

1. Usuario entra a /alven.
2. CTA principal abre /alven/app/login.
3. RENSOF reenvia trafico al frontend ALVENT.
4. Llamadas API pasan por /alven/api hacia backend ALVENT.

## Recomendacion de produccion

- Ajustar frontend ALVENT para consumir /alven/api como API base en produccion.
- Publicar RENSOF como gateway unico (dominio rensof.pe).
- Mantener ALVENT backend/frontend como servicios internos del mismo despliegue.
