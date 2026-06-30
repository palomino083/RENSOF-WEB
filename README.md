# RENSOF WEB

Sitio web de RENSOF listo para publicarse como pagina estatica o ejecutarse como aplicacion FastAPI.

## Contenido

- Inicio
- Nosotros
- Servicios
- Proyectos
- Publicaciones
- Contacto con formulario

## Ejecutar con FastAPI

Instala dependencias y levanta el servidor desde esta carpeta:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Luego abre:

```text
http://127.0.0.1:8000
```

Rutas disponibles:

- `/`
- `/nosotros`
- `/servicios`
- `/proyectos`
- `/publicaciones`
- `/contacto`
- `/health`

## Publicacion estatica

El sitio tambien conserva sus archivos `.html`, por lo que puede subirse a GitHub Pages o a un hosting tradicional. El archivo `CNAME` contiene:

```text
rensof.pe
```

Despues de subir los archivos al repositorio `palomino083/RENSOF-WEB`, activa GitHub Pages desde `Settings > Pages`, usando la rama principal y la carpeta raiz.

## Formulario

El formulario usa FormSubmit y envia a `contacto@rensof.pe`. La primera vez puede requerir confirmacion del correo receptor.
