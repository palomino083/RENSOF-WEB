# ALVENT dentro de RENSOF-WEB

Este directorio contiene el codigo fuente de ALVENT integrado en la arquitectura de RENSOF-WEB.

## Estructura

- backend/: API FastAPI de ALVENT
- frontend/: Aplicacion Next.js de ALVENT
- requirements.txt: dependencias Python originales de ALVENT

## Puertos recomendados en arquitectura unificada

- RENSOF-WEB (gateway): 8000
- ALVENT backend: 8100
- ALVENT frontend: 3100

## Arranque local (manual)

1. Backend ALVENT:

```powershell
Set-Location apps/alvent/backend
..\..\..\.venv\Scripts\python.exe -m pip install -r ..\requirements.txt
..\..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```

2. Frontend ALVENT:

```powershell
Set-Location apps/alvent/frontend
npm install
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:8100'
npm run dev -- -p 3100
```

3. RENSOF-WEB:

```powershell
Set-Location .
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Acceso integrado:

- Landing: /alven
- App proxificada: /alvent/app/login
- API proxificada: /alvent/api/health
