RENSOF ADMIN PRO - INSTALACION

1) Reemplaza templates/admin.html por templates/admin.html de esta carpeta.
2) Reemplaza templates/partials/admin_sidebar.html por templates/partials/admin_sidebar.html.
3) Opción recomendada: copia TODO el contenido de assets/css/admin-pro.css y pégalo al FINAL de tu assets/css/r2030.css.
4) Opción alternativa: reemplaza tu assets/css/r2030.css con assets/css/r2030.css incluido, que ya trae el CSS integrado.
5) Sube cambios a GitHub y vuelve a desplegar en Render.

No se cambiaron rutas ni variables principales de Jinja. Se mantienen:
- ops_status_counts
- ops_refreshed_at
- ops_metrics
- ops_watch_routes
- ops_alerts
- superagent_name
- superagent_scope
- csrf_token
