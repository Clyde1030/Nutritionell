"""
SQLAlchemy ORM models for the USDA nutritional RAG store.

Two tables:
  - usda_foods       : one row per branded/generic food item
  - usda_nutrients   : one row per nutrient measurement for a food item

The `embedding` column on usda_foods holds a 768-dim vector (text-embedding-004
or any compatible model) for semantic similarity search via pgvector.
"""
import uuid as _uuid_module
from datetime import datetime
from typing import List, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

# Embedding dimension — matches text-embedding-004 output size.
# Change to 1536 if switching to OpenAI embeddings.
EMBEDDING_DIM = 768


class USDAFood(Base):
    __tablename__ = "usda_foods"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(_uuid_module.uuid4()),
        server_default=func.gen_random_uuid(),
    )

    # USDA FDC identifiers
    fdc_id: Mapped[Optional[int]] = mapped_column(Integer, unique=True, nullable=True, index=True)

    # Core identity
    brand: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Ingredients list (raw text from label)
    ingredients: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Key flagged fields used in scoring
    serving_size: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    serving_size_unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    household_serving: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # Dietary flags (pre-computed for fast filtering)
    contains_gluten: Mapped[bool] = mapped_column(default=False)
    contains_peanuts: Mapped[bool] = mapped_column(default=False)
    contains_dairy: Mapped[bool] = mapped_column(default=False)
    contains_soy: Mapped[bool] = mapped_column(default=False)
    contains_tree_nuts: Mapped[bool] = mapped_column(default=False)

    # pgvector embedding (product_name + ingredients → text embedding)
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship to nutrient rows
    nutrients: Mapped[List["USDANutrient"]] = relationship(
        "USDANutrient",
        back_populates="food",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def nutrient_dict(self) -> dict:
        """Return nutrients as a flat {name: amount_per_100g} dict — handy for the AI prompt."""
        return {n.nutrient_name: n.amount for n in self.nutrients}

    def __repr__(self) -> str:
        return f"<USDAFood fdc_id={self.fdc_id} brand={self.brand!r} name={self.product_name!r}>"


class USDANutrient(Base):
    __tablename__ = "usda_nutrients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    food_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("usda_foods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    nutrient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # USDA nutrient ID for cross-referencing with the USDA API
    nutrient_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit_name: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    food: Mapped["USDAFood"] = relationship("USDAFood", back_populates="nutrients")

    def __repr__(self) -> str:
        return f"<USDANutrient {self.nutrient_name}={self.amount}{self.unit_name}>"
