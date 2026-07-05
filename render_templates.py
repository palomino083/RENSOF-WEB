"""
Script para renderizar plantillas Jinja2 a archivos HTML estáticos
"""

from pathlib import Path
import re

BASE_DIR = Path(__file__).resolve().parent

def render_template(template_name: str, context: dict) -> str:
    """Renderiza una plantilla Jinja2 manualmente (parsing simple)"""
    template_path = BASE_DIR / "templates" / template_name
    
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")
    
    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Leer base.html si la plantilla lo hereda
    if "{% extends" in content:
        base_path = BASE_DIR / "templates" / "base.html"
        with open(base_path, 'r', encoding='utf-8') as f:
            base_content = f.read()
        
        # Extraer bloque content
        match = re.search(r'{% block content %}(.*?){% endblock %}', content, re.DOTALL)
        if match:
            block_content = match.group(1)
            # Reemplazar {% block content %}...{% endblock %} en base.html
            base_content = base_content.replace('{% block content %}{% endblock %}', block_content)
            content = base_content
    
    # Renderizar variables simples
    for key, value in context.items():
        # Reemplazar {{ variable }}
        if isinstance(value, str):
            content = content.replace('{{ ' + key + ' }}', value)
            content = content.replace('{{ ' + key + ' if ' + key + ' else', value + ' if False else')
        elif value is None:
            content = content.replace('{{ ' + key + ' if ' + key + ' else', 'None if False else')
        elif isinstance(value, list):
            # Para listas, hacer que el for loop no se ejecute
            content = re.sub(
                r'{%\s*for\s+\w+\s+in\s+' + key + r'\s*%}.*?{%\s*endfor\s*%}',
                '',
                content,
                flags=re.DOTALL
            )
    
    # Remover tags de plantilla no procesados
    content = re.sub(r'{%.*?%}', '', content, flags=re.DOTALL)
    content = re.sub(r'{{.*?}}', '', content, flags=re.DOTALL)
    
    return content

def main():
    """Renderiza todas las plantillas"""
    pages = {
        'home.html': {
            'page_title': 'Inicio | RENSOF',
            'page_description': 'Tecnología que impulsa decisiones inteligentes',
            'page_og_title': 'RENSOF | Plataforma de Inteligencia Estratégica',
            'page_og_description': 'Aplicaciones especializadas',
            'page_og_url': 'https://rensof.pe',
            'page_og_image': '/assets/img/og-rensof-social.svg',
            'active_page': 'inicio',
            'primary_email': '',
        },
        'servicios.html': {
            'page_title': 'ALVENT ERP PRO | RENSOF',
            'page_description': 'Plataforma integral',
            'page_og_title': 'ALVENT ERP PRO',
            'page_og_description': 'Plataforma de Business Intelligence',
            'active_page': 'servicios',
        },
        'contacto.html': {
            'page_title': 'Contacto | RENSOF',
            'page_description': 'Activa RENSOF en tu organización',
            'page_og_title': 'Contacto RENSOF',
            'page_og_description': 'Solicita una demo',
            'active_page': 'contacto',
            'primary_email': 'contacto@rensof.pe',
            'products': [],
            'email_accounts': [],
            'message_sent': False,
        },
        'nosotros.html': {
            'page_title': 'Nosotros | RENSOF',
            'page_description': 'Impulsar organizaciones inteligentes',
            'page_og_title': 'Quiénes somos',
            'page_og_description': 'Misión y visión',
            'active_page': 'nosotros',
        },
        'proyectos.html': {
            'page_title': 'Casos y Sectores | RENSOF',
            'page_description': 'Arquitecturas de decisión',
            'page_og_title': 'Casos de éxito',
            'page_og_description': 'Implementaciones',
            'active_page': 'proyectos',
        },
        'publicaciones.html': {
            'page_title': 'Publicaciones | RENSOF',
            'page_description': 'Centro de conocimiento',
            'page_og_title': 'Publicaciones',
            'page_og_description': 'Investigación aplicada',
            'active_page': 'publicaciones',
            'search_query': '',
            'total_results': 0,
        }
    }
    
    for template_name, context in pages.items():
        try:
            html = render_template(template_name, context)
            output_path = BASE_DIR / template_name.replace('.html', '_static.html')
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"✓ {template_name} → {output_path.name}")
        except Exception as e:
            print(f"✗ {template_name}: {e}")

if __name__ == "__main__":
    main()
