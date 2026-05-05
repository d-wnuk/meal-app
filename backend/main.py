from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, selectinload

from database import Base, engine, get_db
import models
import schemas

Base.metadata.create_all(bind=engine)

DEFAULT_USER_EMAIL = "local-user@meal-app.local"

app = FastAPI(title="Meal App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None

    trimmed = value.strip()
    return trimmed or None


def ensure_default_user(db: Session) -> models.User:
    user = db.query(models.User).filter(models.User.email == DEFAULT_USER_EMAIL).first()
    if user:
        return user

    user = models.User(email=DEFAULT_USER_EMAIL)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def serialize_recipe_ingredient(item: models.RecipeIngredient) -> schemas.RecipeIngredientRead:
    return schemas.RecipeIngredientRead(
        id=item.id,
        ingredient_id=item.ingredient_id,
        ingredient_name=item.ingredient.name,
        quantity=float(item.quantity),
        unit_id=item.unit_id,
        unit_name=item.unit.name,
        unit_short_name=item.unit.short_name,
    )


def serialize_recipe(recipe: models.Recipe) -> schemas.RecipeRead:
    return schemas.RecipeRead(
        id=recipe.id,
        name=recipe.name,
        description=recipe.description,
        meal_type=recipe.meal_type,
        servings=recipe.servings,
        created_at=recipe.created_at,
        ingredients=[serialize_recipe_ingredient(item) for item in recipe.ingredients],
    )


def serialize_meal_plan_item(item: models.MealPlanItem) -> schemas.MealPlanItemRead:
    return schemas.MealPlanItemRead(
        id=item.id,
        date=item.date,
        meal_type=item.meal_type,
        recipe_id=item.recipe_id,
        recipe_name=item.recipe.name,
    )


def serialize_meal_plan(meal_plan: models.MealPlan) -> schemas.MealPlanRead:
    items = sorted(
        meal_plan.items,
        key=lambda item: (item.date, item.meal_type.value, item.id),
    )
    return schemas.MealPlanRead(
        id=meal_plan.id,
        name=meal_plan.name,
        start_date=meal_plan.start_date,
        end_date=meal_plan.end_date,
        items=[serialize_meal_plan_item(item) for item in items],
    )


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/ingredients", response_model=list[schemas.IngredientRead])
def list_ingredients(db: Session = Depends(get_db)):
    return db.query(models.Ingredient).order_by(models.Ingredient.name.asc()).all()


@app.post(
    "/ingredients",
    response_model=schemas.IngredientRead,
    status_code=status.HTTP_201_CREATED,
)
def create_ingredient(ingredient: schemas.IngredientCreate, db: Session = Depends(get_db)):
    name = normalize_text(ingredient.name)
    category = normalize_text(ingredient.category)

    if not name:
        raise HTTPException(status_code=400, detail="Ingredient name is required.")

    existing_ingredient = db.query(models.Ingredient).filter(models.Ingredient.name == name).first()
    if existing_ingredient:
        raise HTTPException(status_code=400, detail="Ingredient with this name already exists.")

    db_ingredient = models.Ingredient(name=name, category=category)
    db.add(db_ingredient)
    db.commit()
    db.refresh(db_ingredient)
    return db_ingredient


@app.get("/units", response_model=list[schemas.UnitRead])
def list_units(db: Session = Depends(get_db)):
    return db.query(models.Unit).order_by(models.Unit.name.asc()).all()


@app.post("/units", response_model=schemas.UnitRead, status_code=status.HTTP_201_CREATED)
def create_unit(unit: schemas.UnitCreate, db: Session = Depends(get_db)):
    name = normalize_text(unit.name)
    short_name = normalize_text(unit.short_name)

    if not name:
        raise HTTPException(status_code=400, detail="Unit name is required.")
    if not short_name:
        raise HTTPException(status_code=400, detail="Unit short name is required.")

    existing_unit = (
        db.query(models.Unit)
        .filter((models.Unit.name == name) | (models.Unit.short_name == short_name))
        .first()
    )
    if existing_unit:
        raise HTTPException(
            status_code=400,
            detail="Unit with this name or short name already exists.",
        )

    db_unit = models.Unit(name=name, short_name=short_name)
    db.add(db_unit)
    db.commit()
    db.refresh(db_unit)
    return db_unit


@app.get("/recipes", response_model=list[schemas.RecipeRead])
def list_recipes(db: Session = Depends(get_db)):
    recipes = (
        db.query(models.Recipe)
        .options(
            selectinload(models.Recipe.ingredients).selectinload(models.RecipeIngredient.ingredient),
            selectinload(models.Recipe.ingredients).selectinload(models.RecipeIngredient.unit),
        )
        .order_by(models.Recipe.created_at.desc(), models.Recipe.id.desc())
        .all()
    )
    return [serialize_recipe(recipe) for recipe in recipes]


@app.post("/recipes", response_model=schemas.RecipeCreateResponse)
def create_recipe(recipe: schemas.RecipeCreate, db: Session = Depends(get_db)):
    name = normalize_text(recipe.name)
    description = normalize_text(recipe.description)

    if not name:
        raise HTTPException(status_code=400, detail="Recipe name is required.")
    if recipe.servings < 1:
        raise HTTPException(status_code=400, detail="Servings must be at least 1.")
    if not recipe.ingredients:
        raise HTTPException(status_code=400, detail="Recipe must include at least one ingredient.")
    if any(item.quantity <= 0 for item in recipe.ingredients):
        raise HTTPException(status_code=400, detail="Ingredient quantity must be greater than 0.")

    ingredient_ids = {item.ingredient_id for item in recipe.ingredients}
    unit_ids = {item.unit_id for item in recipe.ingredients}

    existing_ingredients = (
        db.query(models.Ingredient).filter(models.Ingredient.id.in_(ingredient_ids)).all()
    )
    existing_units = db.query(models.Unit).filter(models.Unit.id.in_(unit_ids)).all()

    if len(existing_ingredients) != len(ingredient_ids):
        raise HTTPException(status_code=400, detail="One or more ingredients do not exist.")
    if len(existing_units) != len(unit_ids):
        raise HTTPException(status_code=400, detail="One or more units do not exist.")

    db_recipe = models.Recipe(
        name=name,
        description=description,
        meal_type=recipe.meal_type,
        servings=recipe.servings,
    )
    db.add(db_recipe)
    db.commit()
    db.refresh(db_recipe)

    for ingredient in recipe.ingredients:
        db.add(
            models.RecipeIngredient(
                recipe_id=db_recipe.id,
                ingredient_id=ingredient.ingredient_id,
                quantity=ingredient.quantity,
                unit_id=ingredient.unit_id,
            )
        )

    db.commit()

    return {"id": db_recipe.id, "message": "Recipe created"}


@app.get("/meal-plans", response_model=list[schemas.MealPlanSummaryRead])
def list_meal_plans(db: Session = Depends(get_db)):
    user = ensure_default_user(db)
    meal_plans = (
        db.query(models.MealPlan)
        .options(selectinload(models.MealPlan.items))
        .filter(models.MealPlan.user_id == user.id)
        .order_by(models.MealPlan.start_date.desc(), models.MealPlan.id.desc())
        .all()
    )
    return [
        schemas.MealPlanSummaryRead(
            id=meal_plan.id,
            name=meal_plan.name,
            start_date=meal_plan.start_date,
            end_date=meal_plan.end_date,
            item_count=len(meal_plan.items),
        )
        for meal_plan in meal_plans
    ]


@app.get("/meal-plans/{meal_plan_id}", response_model=schemas.MealPlanRead)
def get_meal_plan(meal_plan_id: int, db: Session = Depends(get_db)):
    user = ensure_default_user(db)
    meal_plan = (
        db.query(models.MealPlan)
        .options(selectinload(models.MealPlan.items).selectinload(models.MealPlanItem.recipe))
        .filter(models.MealPlan.id == meal_plan_id, models.MealPlan.user_id == user.id)
        .first()
    )

    if not meal_plan:
        raise HTTPException(status_code=404, detail="Meal plan not found.")

    return serialize_meal_plan(meal_plan)


@app.post("/meal-plans", response_model=schemas.MealPlanRead, status_code=status.HTTP_201_CREATED)
def create_meal_plan(meal_plan: schemas.MealPlanCreate, db: Session = Depends(get_db)):
    name = normalize_text(meal_plan.name)

    if not name:
        raise HTTPException(status_code=400, detail="Meal plan name is required.")
    if meal_plan.start_date > meal_plan.end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")

    recipe_ids = {item.recipe_id for item in meal_plan.items}
    recipes = db.query(models.Recipe).filter(models.Recipe.id.in_(recipe_ids)).all() if recipe_ids else []
    recipes_by_id = {recipe.id: recipe for recipe in recipes}

    if len(recipes_by_id) != len(recipe_ids):
        raise HTTPException(status_code=400, detail="One or more selected recipes do not exist.")

    for item in meal_plan.items:
        if item.date < meal_plan.start_date or item.date > meal_plan.end_date:
            raise HTTPException(
                status_code=400,
                detail="Meal plan items must be scheduled within the plan date range.",
            )

    user = ensure_default_user(db)
    db_meal_plan = models.MealPlan(
        user_id=user.id,
        name=name,
        start_date=meal_plan.start_date,
        end_date=meal_plan.end_date,
    )
    db.add(db_meal_plan)
    db.commit()
    db.refresh(db_meal_plan)

    for item in meal_plan.items:
        db.add(
            models.MealPlanItem(
                meal_plan_id=db_meal_plan.id,
                recipe_id=item.recipe_id,
                date=item.date,
                meal_type=item.meal_type,
            )
        )

    db.commit()

    created_meal_plan = (
        db.query(models.MealPlan)
        .options(selectinload(models.MealPlan.items).selectinload(models.MealPlanItem.recipe))
        .filter(models.MealPlan.id == db_meal_plan.id)
        .first()
    )
    return serialize_meal_plan(created_meal_plan)
