from app.database.database import Base, engine
import app.models  # importante: registra todos los modelos

print("Creando tablas...")

Base.metadata.create_all(bind=engine)

print("OK - tablas creadas")