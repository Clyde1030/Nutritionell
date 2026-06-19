"""Tests for the RAG lookup service."""
import pytest
from app.models.usda import USDAFood, USDANutrient
from app.services.rag_service import RAGService


async def _seed_food(session, **kwargs) -> USDAFood:
    defaults = dict(
        fdc_id=9999,
        brand="TestBrand",
        product_name="Test Cereal",
        contains_gluten=False,
        contains_peanuts=False,
        contains_dairy=False,
        contains_soy=False,
        contains_tree_nuts=False,
    )
    defaults.update(kwargs)
    food = USDAFood(**defaults)
    session.add(food)
    await session.flush()
    session.add(USDANutrient(
        food_id=food.id,
        nutrient_name="Energy",
        nutrient_id=1008,
        amount=150.0,
        unit_name="KCAL",
    ))
    await session.commit()
    return food


@pytest.mark.asyncio
async def test_exact_brand_and_name_match(db_session):
    await _seed_food(db_session)
    svc = RAGService()
    result = await svc.lookup("Test Cereal", "TestBrand", db_session)
    assert result is not None
    assert result.product_name == "Test Cereal"


@pytest.mark.asyncio
async def test_case_insensitive_match(db_session):
    await _seed_food(db_session)
    svc = RAGService()
    result = await svc.lookup("test cereal", "testbrand", db_session)
    assert result is not None


@pytest.mark.asyncio
async def test_name_only_match(db_session):
    await _seed_food(db_session)
    svc = RAGService()
    result = await svc.lookup("Test Cereal", None, db_session)
    assert result is not None


@pytest.mark.asyncio
async def test_partial_keyword_match(db_session):
    await _seed_food(db_session)
    svc = RAGService()
    result = await svc.lookup("Test Something Unknown Cereal", None, db_session)
    # "Test" is 4 chars — should match via partial
    assert result is not None


@pytest.mark.asyncio
async def test_no_match_returns_none(db_session):
    await _seed_food(db_session)
    svc = RAGService()
    result = await svc.lookup("XYZ Totally Unknown Product 99999", "NoBrand", db_session)
    assert result is None


@pytest.mark.asyncio
async def test_nutrient_dict(db_session):
    food = await _seed_food(db_session)
    # Reload with selectin so nutrients are eagerly fetched within the open session
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    result = await db_session.execute(
        select(USDAFood).where(USDAFood.id == food.id).options(selectinload(USDAFood.nutrients))
    )
    food = result.scalar_one()
    nutrients = food.nutrient_dict()
    assert "Energy" in nutrients
    assert nutrients["Energy"] == 150.0
