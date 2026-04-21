"""
Embedding generation module for Bhagavad Gita verses.

This module creates semantic embeddings for Gita verses using sentence transformers,
enabling semantic search capabilities.
"""
import json
import pickle
from pathlib import Path
from typing import Dict, List, Any, Optional
import numpy as np
from fastembed import TextEmbedding
# from sentence_transformers import SentenceTransformer
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import settings
from src.logger import setup_logger
from src.exceptions import DataFileNotFoundError, EmbeddingGenerationError

logger = setup_logger(__name__, settings.LOG_LEVEL, settings.LOG_FILE)


class EmbeddingGenerator:
    """Generate and manage embeddings for Gita verses."""
    
    def __init__(
        self,
        model_name: str = None,
        input_file: Optional[Path] = None,
        output_file: Optional[Path] = None
    ):
        """
        Initialize the embedding generator.
        
        Args:
            model_name: Name of the sentence transformer model
            input_file: Path to input JSON file with Gita data
            output_file: Path to save embeddings
        """
        self.model_name = model_name or settings.SENTENCE_TRANSFORMER_MODEL
        self.input_file = input_file or settings.gita_emotions_path
        self.output_file = output_file or settings.embeddings_path
        self.model: Optional[TextEmbedding] = None
        
    def load_data(self) -> Dict[str, Any]:
        """
        Load Gita data from JSON file.
        
        Returns:
            Dictionary containing Gita data
            
        Raises:
            DataFileNotFoundError: If input file doesn't exist
        """
        logger.info(f"Loading Gita data from {self.input_file}")
        
        if not self.input_file.exists():
            raise DataFileNotFoundError(
                f"Input file not found: {self.input_file}. "
                "Please ensure the data file exists."
            )
        
        try:
            with open(self.input_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.info(f"Successfully loaded data from {self.input_file}")
            return data
        except json.JSONDecodeError as e:
            raise EmbeddingGenerationError(f"Invalid JSON in {self.input_file}: {e}")
        except Exception as e:
            raise EmbeddingGenerationError(f"Error loading data: {e}")
    
    def load_model(self) -> TextEmbedding:
        """
        Load the sentence transformer model.
        
        Returns:
            Loaded SentenceTransformer model
        """
        if self.model is None:
            logger.info(f"Loading Sentence Transformer model: {self.model_name}")
            try:
                self.model = TextEmbedding(model_name=self.model_name)
                logger.info("Model loaded successfully")
            except Exception as e:
                raise EmbeddingGenerationError(f"Failed to load model: {e}")
        
        return self.model
    
    def prepare_texts(self, data: Dict[str, Any]) -> tuple[List[Dict], List[str]]:
        """
        Prepare texts from Gita data for embedding.
        
        Args:
            data: Dictionary containing Gita chapters and verses
            
        Returns:
            Tuple of (shloka_list, texts_to_embed)
        """
        logger.info("Preparing texts for embedding...")
        
        shloka_list = []
        texts_to_embed = []
        
        chapters = data.get('chapters', {})
        
        for ch_id, verses in chapters.items():
            for v_id, verse in verses.items():
                meaning = verse.get('meaning', '')
                text = verse.get('text', '')
                
                # IMPROVED: Combine Sanskrit + English Meaning + Emotions for richer semantic embeddings
                # Prioritizing English meaning ensures better compatibility with the English embedding model
                meaning_english = verse.get('meaning_english', verse.get('meaning', '')) # Fallback to Hindi if no English
                
                # Get top emotions > 0.3
                emotions = verse.get('emotions', {})
                dominant_emotion = verse.get('dominant_emotion', 'neutral')
                top_emotions = [k for k, v in emotions.items() if v > 0.3]
                emotion_text = " ".join(top_emotions)
                
                # Create a "Super String" for the AI to read
                # Format: [English Meaning] [Sanskrit] [Emotion Keywords]
                full_text = f"{meaning_english} {text} {dominant_emotion} {emotion_text}"
                
                shloka_info = {
                    "id": f"{ch_id}.{v_id}",
                    "chapter": ch_id,
                    "verse": v_id,
                    "sanskrit": text,
                    "meaning": meaning, # Keep original (Hindi) for display
                    "meaning_english": meaning_english, # Keep English for LLM context
                    "emotions": emotions,
                    "dominant_emotion": dominant_emotion
                }
                
                shloka_list.append(shloka_info)
                texts_to_embed.append(full_text)
        
        logger.info(f"Prepared {len(texts_to_embed)} verses for embedding (using English-first approach)")
        return shloka_list, texts_to_embed
    
    def generate_embeddings(
        self,
        texts: List[str],
        batch_size: Optional[int] = None
    ) -> np.ndarray:
        """
        Generate embeddings for texts.
        
        Args:
            texts: List of texts to embed
            batch_size: Batch size for encoding
            
        Returns:
            Numpy array of embeddings
        """
        batch_size = batch_size or settings.EMBEDDING_BATCH_SIZE
        model = self.load_model()
        
        logger.info(f"Generating embeddings for {len(texts)} texts...")
        
        try:
            # FastEmbed handles batching internally, but we can specify batch_size if needed
            # It returns a generator of numpy arrays (batches)
            embedding_gen = model.embed(texts, batch_size=batch_size)
            
            # Combine all batches into a single numpy array
            embeddings = np.concatenate(list(embedding_gen), axis=0)
            logger.info("Embeddings generated successfully")
            return embeddings
        except Exception as e:
            raise EmbeddingGenerationError(f"Failed to generate embeddings: {e}")
    
    def save_embeddings(
        self,
        shlokas: List[Dict],
        embeddings: np.ndarray
    ) -> None:
        """
        Save embeddings and metadata to file.
        
        Args:
            shlokas: List of shloka metadata
            embeddings: Numpy array of embeddings
        """
        logger.info(f"Saving embeddings to {self.output_file}")
        
        try:
            # Ensure output directory exists
            self.output_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.output_file, 'wb') as f:
                pickle.dump({
                    'shlokas': shlokas,
                    'embeddings': embeddings,
                    'model_name': self.model_name
                }, f)
            
            logger.info(f"Successfully saved embeddings to {self.output_file}")
        except Exception as e:
            raise EmbeddingGenerationError(f"Failed to save embeddings: {e}")
    
    def create_embeddings(self) -> None:
        """
        Main method to create and save embeddings.
        
        This orchestrates the entire embedding generation process.
        """
        try:
            # Load data
            data = self.load_data()
            
            # Prepare texts
            shloka_list, texts_to_embed = self.prepare_texts(data)
            
            # Generate embeddings
            embeddings = self.generate_embeddings(texts_to_embed)
            
            # Save results
            self.save_embeddings(shloka_list, embeddings)
            
            logger.info("✓ Embedding generation completed successfully!")
            logger.info(f"You can now use the semantic search functionality.")
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise


def main():
    """Main entry point for embedding generation."""
    try:
        generator = EmbeddingGenerator()
        generator.create_embeddings()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        return 1
    return 0


if __name__ == "__main__":
    exit(main())
