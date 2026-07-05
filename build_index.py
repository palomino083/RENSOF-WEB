#!/usr/bin/env python3
"""
Script para extraer home.html de templates y crear index.html limpio
"""
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

def clean_jinja(content):
    """Elimina todos los tags Jinja2"""
    # Eliminar {% extends ... %}
    content = re.sub(r'{%\s*extends\s+[^}]*%}', '', content)
    # Eliminar {% block ... %} y {% endblock %}
    content = re.sub(r'{%\s*block\s+[^}]*%}', '', content)
    content = re.sub(r'{%\s*endblock\s*%}', '', content)
    # Eliminar {% if ... %} ... {% endif %}
    content = re.sub(r'{%\s*if\s+[^}]*%}.*?{%\s*endif\s*%}', '', content, flags=re.DOTALL)
    # Eliminar variables {{ ... }}
    content = re.sub(r'{{\s*[^}]*}}', '', content)
    return content

# Leer base.html
with open(BASE_DIR / 'templates' / 'base.html', 'r', encoding='utf-8') as f:
    base = f.read()

# Leer home.html
with open(BASE_DIR / 'templates' / 'home.html', 'r', encoding='utf-8') as f:
    home = f.read()

# Extraer contenido de home (entre {% block content %} y {% endblock %})
home_match = re.search(r'{%\s*block\s+content\s*%}(.*){%\s*endblock\s*%}', home, re.DOTALL)
home_content = home_match.group(1) if home_match else home

# Limpiar Jinja2 de todo
home_content = clean_jinja(home_content)
base_clean = clean_jinja(base)

# Encontrar dónde insertar el contenido en base.html
# Buscar {% block content %}{% endblock %}
content_placeholder = re.search(r'{%\s*block\s+content\s*%}\s*{%\s*endblock\s*%}', base_clean)
if content_placeholder:
    # Reemplazar el placeholder con el contenido de home
    full_html = base_clean[:content_placeholder.start()] + home_content + base_clean[content_placeholder.end():]
else:
    # Si no encuentra, construir manualmente
    full_html = base_clean.replace('{% block content %}{% endblock %}', home_content)

# Limpieza final
full_html = re.sub(r'\n\s*\n\s*\n', '\n\n', full_html)  # Eliminar líneas en blanco excesivas

# Guardar como index.html
with open(BASE_DIR / 'index.html', 'w', encoding='utf-8') as f:
    f.write(full_html)

print("✓ index.html creado desde templates/home.html")
