import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ==========================================
# DATABASE CONFIGURATION
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'alvent.db'}"
)

# SQLite requires special configuration
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# ==========================================
# ENGINE AND SESSION
# ==========================================

engine: Engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Verify connections before use
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

# ==========================================
# DEPENDENCY INJECTION
# ==========================================

def get_db() -> Generator[Session, None, None]:
    """
    Dependency injection function for database sessions.
    
    Yields:
        Session: SQLAlchemy session instance
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()