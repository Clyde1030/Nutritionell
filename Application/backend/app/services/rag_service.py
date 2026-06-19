"""
RAG lookup service — given a product name (and optional brand),
retrieve the best-matching USDA food record from PostgreSQL.

Strategy (Phase 2 — mock/keyword):
  1. Exact product_name match  (case-insensitive)
  2. ILIKE partial match on product_name
  3. Return None if nothing found

Phase 3 will upgrade this to a pgvector cosine-similarity search using
Gemini / text-embedding-004 embeddings.
"""
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usda import USDAFood


class RAGService:
    async def lookup(
        self,
        product_name: str,
        brand: Optional[str],
        db: AsyncSession,
    ) -> Optional[USDAFood]:
        """
        Return the most relevant USDAFood row for this product, or None.
        Falls back gracefully through three strategies.
        """
        # Strategy 1 — exact match on both brand + product_name
        if brand and brand.lower() not in ("unknown", ""):
            result = await db.execute(
                select(USDAFood).where(
                    func.lower(USDAFood.brand) == brand.lower(),
                    func.lower(USDAFood.product_name) == product_name.lower(),
                )
            )
            food = result.scalar_one_or_none()
            if food:
                return food

        # Strategy 2 — exact product_name match (ignore brand)
        result = await db.execute(
            select(USDAFood).where(
                func.lower(USDAFood.product_name) == product_name.lower()
            )
        )
        food = result.scalar_one_or_none()
        if food:
            return food

        # Strategy 3 — partial ILIKE on first significant word (≥4 chars)
        keywords = [w for w in product_name.split() if len(w) >= 4]
        if keywords:
            pattern = f"%{keywords[0].lower()}%"
            result = await db.execute(
                select(USDAFood)
                .where(func.lower(USDAFood.product_name).like(pattern))
                .limit(1)
            )
            food = result.scalar_one_or_none()
            if food:
                return food

        return None


rag_service = RAGService()
