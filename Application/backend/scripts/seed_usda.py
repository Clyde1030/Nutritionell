"""
Seed the local PostgreSQL database with representative USDA food items
for development and testing.

Run from the backend/ directory:
  python scripts/seed_usda.py

The script is idempotent — it skips rows that already exist (matched by fdc_id).
"""
import os
import sys

# Allow running from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import Base
from app.models.usda import USDAFood, USDANutrient  # noqa: F401 — registers with Base

# ── Seed data ─────────────────────────────────────────────────────────────────
SEED_FOODS = [
    {
        "fdc_id": 1001,
        "brand": "Kellogg's",
        "product_name": "Frosted Flakes",
        "description": "Sweetened corn cereal",
        "ingredients": "Milled corn, sugar, malt flavor, contains 2% or less of salt. "
                       "BHT added for freshness.",
        "serving_size": 37.0,
        "serving_size_unit": "g",
        "household_serving": "1 cup (37g)",
        "contains_gluten": False,
        "contains_peanuts": False,
        "contains_dairy": False,
        "contains_soy": False,
        "contains_tree_nuts": False,
        "nutrients": [
            ("Energy", 1008, 378.0, "KCAL"),
            ("Protein", 1003, 5.4, "G"),
            ("Total lipid (fat)", 1004, 1.4, "G"),
            ("Carbohydrate, by difference", 1005, 89.2, "G"),
            ("Fiber, total dietary", 1079, 1.4, "G"),
            ("Sugars, total including NLEA", 2000, 37.8, "G"),
            ("Sodium, Na", 1093, 473.0, "MG"),
            ("Calcium, Ca", 1087, 0.0, "MG"),
            ("Iron, Fe", 1089, 16.2, "MG"),
        ],
    },
    {
        "fdc_id": 1002,
        "brand": "Chobani",
        "product_name": "Plain Greek Yogurt",
        "description": "Non-fat plain Greek yogurt",
        "ingredients": "Cultured nonfat milk.",
        "serving_size": 170.0,
        "serving_size_unit": "g",
        "household_serving": "6 oz container",
        "contains_gluten": False,
        "contains_peanuts": False,
        "contains_dairy": True,
        "contains_soy": False,
        "contains_tree_nuts": False,
        "nutrients": [
            ("Energy", 1008, 59.0, "KCAL"),
            ("Protein", 1003, 10.2, "G"),
            ("Total lipid (fat)", 1004, 0.4, "G"),
            ("Carbohydrate, by difference", 1005, 3.6, "G"),
            ("Sugars, total including NLEA", 2000, 3.2, "G"),
            ("Sodium, Na", 1093, 36.0, "MG"),
            ("Calcium, Ca", 1087, 111.0, "MG"),
        ],
    },
    {
        "fdc_id": 1003,
        "brand": "Kind",
        "product_name": "Dark Chocolate Nuts & Sea Salt Bar",
        "description": "Snack bar with nuts, dark chocolate, and sea salt",
        "ingredients": "Almonds, peanuts, chicory root fiber, honey, palm kernel oil, "
                       "sugar, glucose syrup, dark chocolate (cocoa mass, sugar, cocoa butter, "
                       "vanilla extract), sea salt, soy lecithin.",
        "serving_size": 40.0,
        "serving_size_unit": "g",
        "household_serving": "1 bar (40g)",
        "contains_gluten": False,
        "contains_peanuts": True,
        "contains_dairy": False,
        "contains_soy": True,
        "contains_tree_nuts": True,
        "nutrients": [
            ("Energy", 1008, 200.0, "KCAL"),
            ("Protein", 1003, 6.0, "G"),
            ("Total lipid (fat)", 1004, 15.0, "G"),
            ("Saturated fatty acids, total", 1258, 2.5, "G"),
            ("Carbohydrate, by difference", 1005, 16.0, "G"),
            ("Fiber, total dietary", 1079, 7.0, "G"),
            ("Sugars, total including NLEA", 2000, 5.0, "G"),
            ("Sodium, Na", 1093, 125.0, "MG"),
        ],
    },
    {
        "fdc_id": 1004,
        "brand": "Campbell's",
        "product_name": "Chicken Noodle Soup",
        "description": "Condensed chicken noodle soup",
        "ingredients": "Chicken broth, enriched egg noodles (wheat flour, eggs, niacin, "
                       "ferrous sulfate, thiamine mononitrate, riboflavin, folic acid), "
                       "cooked chicken meat, modified food starch, salt, chicken fat.",
        "serving_size": 120.0,
        "serving_size_unit": "ml",
        "household_serving": "1/2 cup condensed (about 120mL)",
        "contains_gluten": True,
        "contains_peanuts": False,
        "contains_dairy": False,
        "contains_soy": False,
        "contains_tree_nuts": False,
        "nutrients": [
            ("Energy", 1008, 75.0, "KCAL"),
            ("Protein", 1003, 3.3, "G"),
            ("Total lipid (fat)", 1004, 2.5, "G"),
            ("Carbohydrate, by difference", 1005, 9.2, "G"),
            ("Sodium, Na", 1093, 1775.0, "MG"),
        ],
    },
    {
        "fdc_id": 1005,
        "brand": "General Mills",
        "product_name": "Cheerios",
        "description": "Whole grain oat cereal",
        "ingredients": "Whole grain oats, modified corn starch, sugar, oat bran, "
                       "salt, calcium carbonate, oat fiber, tripotassium phosphate, "
                       "Vitamin E (mixed tocopherols).",
        "serving_size": 28.0,
        "serving_size_unit": "g",
        "household_serving": "1 cup (28g)",
        "contains_gluten": False,
        "contains_peanuts": False,
        "contains_dairy": False,
        "contains_soy": False,
        "contains_tree_nuts": False,
        "nutrients": [
            ("Energy", 1008, 100.0, "KCAL"),
            ("Protein", 1003, 3.0, "G"),
            ("Total lipid (fat)", 1004, 2.0, "G"),
            ("Carbohydrate, by difference", 1005, 20.0, "G"),
            ("Fiber, total dietary", 1079, 3.0, "G"),
            ("Sugars, total including NLEA", 2000, 1.0, "G"),
            ("Sodium, Na", 1093, 140.0, "MG"),
            ("Iron, Fe", 1089, 8.1, "MG"),
        ],
    },
    {
        "fdc_id": 1006,
        "brand": "Justin's",
        "product_name": "Almond Butter",
        "description": "Classic almond butter",
        "ingredients": "Dry roasted almonds, palm oil.",
        "serving_size": 32.0,
        "serving_size_unit": "g",
        "household_serving": "2 tbsp (32g)",
        "contains_gluten": False,
        "contains_peanuts": False,
        "contains_dairy": False,
        "contains_soy": False,
        "contains_tree_nuts": True,
        "nutrients": [
            ("Energy", 1008, 190.0, "KCAL"),
            ("Protein", 1003, 7.0, "G"),
            ("Total lipid (fat)", 1004, 17.0, "G"),
            ("Saturated fatty acids, total", 1258, 2.5, "G"),
            ("Carbohydrate, by difference", 1005, 7.0, "G"),
            ("Fiber, total dietary", 1079, 3.0, "G"),
            ("Sugars, total including NLEA", 2000, 3.0, "G"),
            ("Sodium, Na", 1093, 65.0, "MG"),
            ("Calcium, Ca", 1087, 80.0, "MG"),
        ],
    },
    {
        "fdc_id": 1007,
        "brand": "Coca-Cola",
        "product_name": "Coca-Cola Classic",
        "description": "Carbonated soft drink",
        "ingredients": "Carbonated water, high fructose corn syrup, caramel color, "
                       "phosphoric acid, natural flavors, caffeine.",
        "serving_size": 355.0,
        "serving_size_unit": "ml",
        "household_serving": "12 fl oz can",
        "contains_gluten": False,
        "contains_peanuts": False,
        "contains_dairy": False,
        "contains_soy": False,
        "contains_tree_nuts": False,
        "nutrients": [
            ("Energy", 1008, 140.0, "KCAL"),
            ("Protein", 1003, 0.0, "G"),
            ("Total lipid (fat)", 1004, 0.0, "G"),
            ("Carbohydrate, by difference", 1005, 39.0, "G"),
            ("Sugars, total including NLEA", 2000, 39.0, "G"),
            ("Sodium, Na", 1093, 45.0, "MG"),
        ],
    },
    {
        "fdc_id": 1008,
        "brand": "Quest",
        "product_name": "Chocolate Chip Cookie Dough Protein Bar",
        "description": "High-protein snack bar",
        "ingredients": "Protein blend (milk protein isolate, whey protein isolate), "
                       "soluble corn fiber, almonds, water, palm oil, cocoa butter, "
                       "sea salt, sucralose, lo han guo.",
        "serving_size": 60.0,
        "serving_size_unit": "g",
        "household_serving": "1 bar (60g)",
        "contains_gluten": False,
        "contains_peanuts": False,
        "contains_dairy": True,
        "contains_soy": False,
        "contains_tree_nuts": True,
        "nutrients": [
            ("Energy", 1008, 190.0, "KCAL"),
            ("Protein", 1003, 21.0, "G"),
            ("Total lipid (fat)", 1004, 7.0, "G"),
            ("Saturated fatty acids, total", 1258, 3.5, "G"),
            ("Carbohydrate, by difference", 1005, 24.0, "G"),
            ("Fiber, total dietary", 1079, 14.0, "G"),
            ("Sugars, total including NLEA", 2000, 1.0, "G"),
            ("Sodium, Na", 1093, 330.0, "MG"),
            ("Calcium, Ca", 1087, 200.0, "MG"),
        ],
    },
]


async def seed():
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        inserted = 0
        skipped = 0

        for food_data in SEED_FOODS:
            # Check if already exists
            result = await session.execute(
                select(USDAFood).where(USDAFood.fdc_id == food_data["fdc_id"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                skipped += 1
                continue

            nutrients_raw = food_data.pop("nutrients")
            food = USDAFood(**food_data)
            session.add(food)
            await session.flush()  # get the generated UUID

            for name, nutrient_id, amount, unit in nutrients_raw:
                session.add(
                    USDANutrient(
                        food_id=food.id,
                        nutrient_name=name,
                        nutrient_id=nutrient_id,
                        amount=amount,
                        unit_name=unit,
                    )
                )

            inserted += 1

        await session.commit()
        print(f"✅  Seed complete — {inserted} foods inserted, {skipped} already existed.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
