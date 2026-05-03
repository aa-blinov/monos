from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
import datetime

Base = declarative_base()

class NoteIndex(Base):
    __tablename__ = "notes_index"
    
    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True)
    name = Column(String)
    title = Column(String)
    is_dir = Column(Boolean, default=False)
    parent_path = Column(String, index=True)
    content = Column(Text)
    tags = Column(String)  # Сохраняем как JSON-строку
    last_modified = Column(DateTime)
    last_opened = Column(DateTime, default=datetime.datetime.now)
    hash = Column(String)  # Для быстрой проверки изменений

class FolderConfig(Base):
    __tablename__ = "folder_config"
    
    path = Column(String, primary_key=True, index=True)
    icon = Column(String)  # Имя иконки или эмодзи

def get_engine(db_path: str):
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    
    # Пытаемся проверить схему (простой сброс при ошибке для кэша)
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text("SELECT last_opened FROM notes_index LIMIT 1"))
    except Exception:
        print("Schema mismatch detected, resetting database...")
        Base.metadata.drop_all(bind=engine)
    
    Base.metadata.create_all(bind=engine)
    return engine

def get_session(engine):
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()
