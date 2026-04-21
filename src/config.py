"""
Configuration management for Talk to Krishna application.
"""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict



# Force load dotenv at module level
from dotenv import load_dotenv
load_dotenv()

class Settings(BaseSettings):
    """Application settings with validation."""
    
    # API Keys
    GROQ_API_KEY: Optional[str] = None
    
    # File paths
    GITA_EMOTIONS_FILE: str = "data/gita_emotions.json"
    GITA_HINDI_FILE: str = "data/gita_hindi.json"
    EMBEDDINGS_FILE: str = "models/gita_embeddings.pkl"
    MODEL_CACHE_DIR: Optional[str] = os.getenv("FASTEMBED_CACHE_PATH", "models")
    TFIDF_MODEL_FILE: str = "models/gita_tfidf.pkl"
    
    # Model configuration
    SENTENCE_TRANSFORMER_MODEL: str = "BAAI/bge-small-en-v1.5"  # Switched to Small model for Render compatibility (512MB RAM)
    EMBEDDING_BATCH_SIZE: int = 32
    LLM_MODEL: str = "llama-3.3-70b-versatile"  # High quality for answers
    LLM_CLASSIFIER_MODEL: str = "llama-3.1-8b-instant"  # Fast and high rate-limits for gatekeeping
    
    # Search configuration
    DEFAULT_TOP_K: int = 10
    MIN_SIMILARITY_THRESHOLD: float = 0.05
    EMOTION_SCORE_THRESHOLD: float = 0.3
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "app.log"
    
    # Base directory (project root)
    BASE_DIR: Path = Path(__file__).parent.parent
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    def get_file_path(self, filename: str) -> Path:
        """Get absolute path for a file."""
        return self.BASE_DIR / filename
    
    @property
    def gita_emotions_path(self) -> Path:
        return self.get_file_path(self.GITA_EMOTIONS_FILE)
    
    @property
    def gita_hindi_path(self) -> Path:
        return self.get_file_path(self.GITA_HINDI_FILE)
    
    @property
    def embeddings_path(self) -> Path:
        return self.get_file_path(self.EMBEDDINGS_FILE)
    
    @property
    def tfidf_model_path(self) -> Path:
        return self.get_file_path(self.TFIDF_MODEL_FILE)


# Global settings instance
settings = Settings()
