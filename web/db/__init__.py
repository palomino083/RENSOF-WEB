from app.db.database import Base, SessionLocal, engine
from app.db import models  # noqa: F401
from app.db.seed import seed_database


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_database(session)
