#!/usr/bin/env python3
"""Script para preparar archivos HTML estáticos desde templates/"""

from pathlib import Path
import re

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
PUBLIC_DIR = BASE_DIR / "public"

def clean_jinja2_tags(content: str) -> str:
    """Remueve tags de Jinja2 del HTML"""
    # Remover {% extends ...%}
    content = re.sub(r'{%\s*extends\s+["\'].*?["\']\s*%}', '', content)
    # Remover {% block content %}...{% endblock %}
    content = re.sub(r'{%\s*block\s+\w+\s*%}', '', content)
    content = re.sub(r'{%\s*endblock\s*%}', '', content)
    # Remover otros tags de control
    content = re.sub(r'{%.*?%}', '', content, flags=re.DOTALL)
    # Remover variables que no se pueden resolver
    content = re.sub(r'{{\s*\w+.*?}}', '', content)
    return content

def process_home():
    """Procesa home.html a index.html"""
    home_path = TEMPLATES_DIR / "home.html"
    base_path = TEMPLATES_DIR / "base.html"
    
    with open(home_path, 'r', encoding='utf-8') as f:
        home_content = f.read()
    
    with open(base_path, 'r', encoding='utf-8') as f:
        base_content = f.read()
    
    # Extraer el contenido del bloque content
    match = re.search(r'{%\s*block\s+content\s*%}(.*?){%\s*endblock\s*%}', home_content, re.DOTALL)
    if match:
        block_content = match.group(1)
        # Reemplazar el bloque en base.html
        base_content = base_content.replace('{% block content %}{% endblock %}', block_content)
    
    # Limpiar tags de Jinja2
    base_content = clean_jinja2_tags(base_content)
    
    # Escribir index.html
    output_path = PUBLIC_DIR / "index.html"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(base_content)
    
    print(f"✓ home.html → {output_path.name}")

def process_page(template_name: str, output_name: str = None):
    """Procesa una página plantilla"""
    if output_name is None:
        output_name = template_name
    
    template_path = TEMPLATES_DIR / template_name
    base_path = TEMPLATES_DIR / "base.html"
    
    with open(template_path, 'r', encoding='utf-8') as f:
        page_content = f.read()
    
    with open(base_path, 'r', encoding='utf-8') as f:
        base_content = f.read()
    
    # Extraer el contenido del bloque content
    match = re.search(r'{%\s*block\s+content\s*%}(.*?){%\s*endblock\s*%}', page_content, re.DOTALL)
    if match:
        block_content = match.group(1)
        # Reemplazar el bloque en base.html
        base_content = base_content.replace('{% block content %}{% endblock %}', block_content)
    
    # Limpiar tags de Jinja2
    base_content = clean_jinja2_tags(base_content)
    
    # Escribir archivo
    output_path = PUBLIC_DIR / output_name
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(base_content)
    
    print(f"✓ {template_name} → {output_name}")

def main():
    """Procesa todas las páginas"""
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    
    process_home()
    process_page("servicios.html")
    process_page("contacto.html")
    process_page("nosotros.html")
    process_page("proyectos.html")
    process_page("publicaciones.html")
    process_page("404.html")
    
    print("\n✓ Todos los archivos HTML fueron preparados en public/")

if __name__ == "__main__":
    main()
