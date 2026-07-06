from db.database import Base, SessionLocal, engine
from db import models  # noqa: F401
from db.seed import seed_database


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_database(session)
