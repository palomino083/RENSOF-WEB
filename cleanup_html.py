#!/usr/bin/env python3
"""
Script para limpiar tags Jinja2 de archivos HTML
"""
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Archivos HTML a limpiar
html_files = [
    "index.html",
    "servicios.html",
    "contacto.html",
    "nosotros.html",
    "proyectos.html",
    "publicaciones.html",
]

def clean_jinja_tags(content):
    """Elimina todos los tags Jinja2 del contenido HTML"""
    # Eliminar {% extends ... %}
    content = re.sub(r'{%\s*extends\s+[^}]*%}', '', content)
    
    # Eliminar {% block ... %} y {% endblock %}
    content = re.sub(r'{%\s*block\s+[^}]*%}', '', content)
    content = re.sub(r'{%\s*endblock\s*%}', '', content)
    
    # Eliminar {% if ... %} ... {% endif %}
    content = re.sub(r'{%\s*if\s+[^}]*%}.*?{%\s*endif\s*%}', '', content, flags=re.DOTALL)
    
    # Eliminar otros tags Jinja2 de control de flujo
    content = re.sub(r'{%\s*for\s+[^}]*%}', '', content)
    content = re.sub(r'{%\s*endfor\s*%}', '', content)
    
    # Eliminar variables {{ ... }}
    content = re.sub(r'{{\s*[^}]*}}', '', content)
    
    return content

for html_file in html_files:
    file_path = BASE_DIR / html_file
    if file_path.exists():
        print(f"Limpiando {html_file}...", end=" ")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Limpiar tags Jinja2
        cleaned = clean_jinja_tags(content)
        
        # Escribir archivo limpio
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        
        print("✓")

print("\n✓ Todos los archivos HTML fueron limpiados de tags Jinja2")
