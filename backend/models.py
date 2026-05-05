from sqlalchemy import (
	Column, Integer, String, Text, ForeignKey, Date, Enum, Numeric, TIMESTAMP
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base

class MealTypeEnum(str, enum.Enum):
	breakfast = "breakfast"
	lunch = "lunch"
	dinner = "dinner"
	snack = "snack"
	dessert = "dessert"

class User(Base):
	__tablename__ = "users"

	id = Column(Integer, primary_key=True, index=True)
	email = Column(String, unique=True, nullable=False)
	meal_plans = relationship("MealPlan", back_populates="user")


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    short_name = Column(String, unique=True, nullable=False)

    recipe_ingredients = relationship("RecipeIngredient", back_populates="unit")

class Ingredient(Base):
    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    category = Column(String)

    recipe_ingredients = relationship("RecipeIngredient", back_populates="ingredient")

class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    meal_type = Column(Enum(MealTypeEnum), nullable=False)
    servings = Column(Integer, default=1)
    created_at = Column(TIMESTAMP, server_default=func.now())

    ingredients = relationship(
        "RecipeIngredient",
        back_populates="recipe",
        cascade="all, delete"
    )

    meal_plan_items = relationship("MealPlanItem", back_populates="recipe")

class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id = Column(Integer, primary_key=True, index=True)

    recipe_id = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"))
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"))
    unit_id = Column(Integer, ForeignKey("units.id"))

    quantity = Column(Numeric, nullable=False)

    recipe = relationship("Recipe", back_populates="ingredients")
    ingredient = relationship("Ingredient", back_populates="recipe_ingredients")
    unit = relationship("Unit", back_populates="recipe_ingredients")

class MealPlan(Base):
    __tablename__ = "meal_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

    name = Column(String)
    start_date = Column(Date)
    end_date = Column(Date)

    user = relationship("User", back_populates="meal_plans")
    items = relationship(
        "MealPlanItem",
        back_populates="meal_plan",
        cascade="all, delete"
    )

class MealPlanItem(Base):
    __tablename__ = "meal_plan_items"

    id = Column(Integer, primary_key=True, index=True)

    meal_plan_id = Column(Integer, ForeignKey("meal_plans.id", ondelete="CASCADE"))
    recipe_id = Column(Integer, ForeignKey("recipes.id"))

    date = Column(Date, nullable=False)
    meal_type = Column(Enum(MealTypeEnum), nullable=False)

    meal_plan = relationship("MealPlan", back_populates="items")
    recipe = relationship("Recipe", back_populates="meal_plan_items")
