from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

# Determine database engine configuration
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=False,
    pool_pre_ping=True,
)

# Apply performance pragmas for SQLite (WAL mode, fast sync)
if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.execute("PRAGMA synchronous = NORMAL")
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)

    # If SQLite, initialize FTS5 full-text search table for instant search across segments
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
                        transcript_id UNINDEXED,
                        segment_id UNINDEXED,
                        speaker,
                        text
                    );
                    """
                )
            )
            conn.commit()
