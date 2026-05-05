from datetime import date, datetime

from pydantic import BaseModel

from models import MealTypeEnum


class IngredientCreate(BaseModel):
    name: str
    category: str | None = None


class IngredientRead(BaseModel):
    id: int
    name: str
    category: str | None = None

    class Config:
        from_attributes = True


class UnitCreate(BaseModel):
    name: str
    short_name: str


class UnitRead(BaseModel):
    id: int
    name: str
    short_name: str

    class Config:
        from_attributes = True


class RecipeIngredientCreate(BaseModel):
    ingredient_id: int
    quantity: float
    unit_id: int


class RecipeIngredientRead(BaseModel):
    id: int
    ingredient_id: int
    ingredient_name: str
    quantity: float
    unit_id: int
    unit_name: str
    unit_short_name: str


class RecipeCreate(BaseModel):
    name: str
    description: str | None = None
    meal_type: MealTypeEnum
    servings: int = 1
    ingredients: list[RecipeIngredientCreate]


class RecipeCreateResponse(BaseModel):
    id: int
    message: str


class RecipeRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    meal_type: MealTypeEnum
    servings: int
    created_at: datetime | None = None
    ingredients: list[RecipeIngredientRead]


class MealPlanItemCreate(BaseModel):
    date: date
    meal_type: MealTypeEnum
    recipe_id: int


class MealPlanItemRead(BaseModel):
    id: int
    date: date
    meal_type: MealTypeEnum
    recipe_id: int
    recipe_name: str


class MealPlanCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    items: list[MealPlanItemCreate]


class MealPlanSummaryRead(BaseModel):
    id: int
    name: str
    start_date: date | None = None
    end_date: date | None = None
    item_count: int


class MealPlanRead(BaseModel):
    id: int
    name: str
    start_date: date | None = None
    end_date: date | None = None
    items: list[MealPlanItemRead]
