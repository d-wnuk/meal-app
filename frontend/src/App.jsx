import { useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, request } from "./api";

const mealTypes = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

const tabs = [
  { id: "recipe-search", label: "Wyszukiwarka przepisów" },
  { id: "recipe-creation", label: "Tworzenie przepisów" },
  { id: "meal-plans", label: "Tworzenie planu" },
];

const emptyRecipeIngredientRow = () => ({
  id: crypto.randomUUID(),
  ingredient_id: "",
  quantity: "",
  unit_id: "",
});

const createInitialRecipeForm = () => ({
  name: "",
  description: "",
  meal_type: "dinner",
  servings: 2,
  ingredients: [emptyRecipeIngredientRow()],
});

const createInitialIngredientForm = () => ({
  name: "",
  category: "",
});

const createInitialUnitForm = () => ({
  name: "",
  short_name: "",
});

const emptyMealPlanItemRow = () => ({
  id: crypto.randomUUID(),
  date: "",
  meal_type: "dinner",
  recipe_id: "",
});

const createInitialMealPlanForm = () => ({
  name: "",
  start_date: "",
  end_date: "",
  items: [emptyMealPlanItemRow()],
});

function formatMealType(mealType) {
  return mealTypes.find((item) => item.value === mealType)?.label ?? mealType;
}

function formatDate(dateString) {
  if (!dateString) {
    return "No date";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
}

function formatDateTime(dateString) {
  if (!dateString) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function groupMealPlanItems(items) {
  const grouped = new Map();

  items.forEach((item) => {
    if (!grouped.has(item.date)) {
      grouped.set(item.date, []);
    }
    grouped.get(item.date).push(item);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedItems]) => ({
      date,
      items: [...groupedItems].sort((left, right) => left.meal_type.localeCompare(right.meal_type)),
    }));
}

function isBlank(value) {
  return String(value ?? "").trim() === "";
}

function sortRecipes(recipes, sortBy, sortDirection) {
  const sortedRecipes = [...recipes];

  sortedRecipes.sort((left, right) => {
    let comparison = 0;

    if (sortBy === "name") {
      comparison = left.name.localeCompare(right.name);
    } else if (sortBy === "meal_type") {
      comparison = formatMealType(left.meal_type).localeCompare(formatMealType(right.meal_type));
    } else if (sortBy === "servings") {
      comparison = left.servings - right.servings;
    } else {
      comparison = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    }

    return sortDirection === "asc" ? comparison : comparison * -1;
  });

  return sortedRecipes;
}

function recipeMatchesSearch(recipe, searchTerm) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const searchableParts = [
    recipe.name,
    recipe.description,
    formatMealType(recipe.meal_type),
    ...recipe.ingredients.map((ingredient) => ingredient.ingredient_name),
  ];

  return searchableParts.some((value) =>
    String(value ?? "").toLowerCase().includes(normalizedSearch),
  );
}

function RecipeCards({ recipes }) {
  return (
    <div className="card-list">
      {recipes.map((recipe) => (
        <article className="data-card" key={recipe.id}>
          <div className="data-card-header">
            <div>
              <h4>{recipe.name}</h4>
              <p className="helper">
                {formatMealType(recipe.meal_type)} • {recipe.servings} servings
              </p>
            </div>
            <span className="pill subtle">{formatDateTime(recipe.created_at)}</span>
          </div>

          {recipe.description ? <p className="card-copy">{recipe.description}</p> : null}

          <div className="chip-list">
            {recipe.ingredients.map((ingredient) => (
              <span className="pill" key={ingredient.id}>
                {ingredient.quantity} {ingredient.unit_short_name} {ingredient.ingredient_name}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("recipe-search");
  const [ingredients, setIngredients] = useState([]);
  const [units, setUnits] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [selectedMealPlanId, setSelectedMealPlanId] = useState(null);
  const [selectedMealPlan, setSelectedMealPlan] = useState(null);
  const [recipeSortBy, setRecipeSortBy] = useState("created_at");
  const [recipeSortDirection, setRecipeSortDirection] = useState("desc");
  const [recipeSearchTerm, setRecipeSearchTerm] = useState("");
  const [creationTarget, setCreationTarget] = useState(null);

  const recipeFormRef = useRef(null);
  const unitFormRef = useRef(null);

  const [recipeForm, setRecipeForm] = useState(createInitialRecipeForm);
  const [ingredientForm, setIngredientForm] = useState(createInitialIngredientForm);
  const [unitForm, setUnitForm] = useState(createInitialUnitForm);
  const [mealPlanForm, setMealPlanForm] = useState(createInitialMealPlanForm);

  const [isLoadingIngredients, setIsLoadingIngredients] = useState(true);
  const [isLoadingUnits, setIsLoadingUnits] = useState(true);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [isLoadingMealPlans, setIsLoadingMealPlans] = useState(true);
  const [isLoadingMealPlanDetail, setIsLoadingMealPlanDetail] = useState(false);
  const [isCheckingApiHealth, setIsCheckingApiHealth] = useState(true);

  const [recipeLoadError, setRecipeLoadError] = useState("");
  const [ingredientLoadError, setIngredientLoadError] = useState("");
  const [unitLoadError, setUnitLoadError] = useState("");
  const [mealPlanLoadError, setMealPlanLoadError] = useState("");
  const [mealPlanDetailError, setMealPlanDetailError] = useState("");
  const [apiHealthStatus, setApiHealthStatus] = useState("unknown");
  const [apiHealthMessage, setApiHealthMessage] = useState("");

  const [recipeSubmitError, setRecipeSubmitError] = useState("");
  const [ingredientSubmitError, setIngredientSubmitError] = useState("");
  const [unitSubmitError, setUnitSubmitError] = useState("");
  const [mealPlanSubmitError, setMealPlanSubmitError] = useState("");

  const [recipeSuccessMessage, setRecipeSuccessMessage] = useState("");
  const [ingredientSuccessMessage, setIngredientSuccessMessage] = useState("");
  const [unitSuccessMessage, setUnitSuccessMessage] = useState("");
  const [mealPlanSuccessMessage, setMealPlanSuccessMessage] = useState("");

  const [isSubmittingRecipe, setIsSubmittingRecipe] = useState(false);
  const [isSubmittingIngredient, setIsSubmittingIngredient] = useState(false);
  const [isSubmittingUnit, setIsSubmittingUnit] = useState(false);
  const [isSubmittingMealPlan, setIsSubmittingMealPlan] = useState(false);

  const loadApiHealth = async () => {
    setIsCheckingApiHealth(true);

    try {
      const data = await request("/health");
      if (data?.status === "ok") {
        setApiHealthStatus("healthy");
        setApiHealthMessage("Backend connection is healthy.");
      } else {
        setApiHealthStatus("warning");
        setApiHealthMessage("Backend responded, but the health check returned an unexpected payload.");
      }
    } catch (error) {
      setApiHealthStatus("offline");
      setApiHealthMessage(
        error.message || "Backend is unreachable. Check the API container or local server.",
      );
    } finally {
      setIsCheckingApiHealth(false);
    }
  };

  const loadIngredients = async () => {
    setIsLoadingIngredients(true);
    setIngredientLoadError("");

    try {
      const data = await request("/ingredients");
      setIngredients(data);
    } catch (error) {
      setIngredientLoadError(error.message || "Could not load ingredients.");
    } finally {
      setIsLoadingIngredients(false);
    }
  };

  const loadUnits = async () => {
    setIsLoadingUnits(true);
    setUnitLoadError("");

    try {
      const data = await request("/units");
      setUnits(data);
    } catch (error) {
      setUnitLoadError(error.message || "Could not load units.");
    } finally {
      setIsLoadingUnits(false);
    }
  };

  const loadRecipes = async () => {
    setIsLoadingRecipes(true);
    setRecipeLoadError("");

    try {
      const data = await request("/recipes");
      setRecipes(data);
    } catch (error) {
      setRecipeLoadError(error.message || "Could not load recipes.");
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  const loadMealPlans = async () => {
    setIsLoadingMealPlans(true);
    setMealPlanLoadError("");

    try {
      const data = await request("/meal-plans");
      setMealPlans(data);
      setSelectedMealPlanId((current) => {
        if (data.length === 0) {
          return null;
        }

        return data.some((mealPlan) => mealPlan.id === current) ? current : data[0].id;
      });
    } catch (error) {
      setMealPlanLoadError(error.message || "Could not load meal plans.");
    } finally {
      setIsLoadingMealPlans(false);
    }
  };

  const loadMealPlanDetail = async (mealPlanId) => {
    if (!mealPlanId) {
      setSelectedMealPlan(null);
      setMealPlanDetailError("");
      return;
    }

    setIsLoadingMealPlanDetail(true);
    setMealPlanDetailError("");

    try {
      const data = await request(`/meal-plans/${mealPlanId}`);
      setSelectedMealPlan(data);
    } catch (error) {
      setSelectedMealPlan(null);
      setMealPlanDetailError(error.message || "Could not load meal plan details.");
    } finally {
      setIsLoadingMealPlanDetail(false);
    }
  };

  useEffect(() => {
    loadApiHealth();
    loadIngredients();
    loadUnits();
    loadRecipes();
    loadMealPlans();
  }, []);

  useEffect(() => {
    loadMealPlanDetail(selectedMealPlanId);
  }, [selectedMealPlanId]);

  useEffect(() => {
    if (activeTab !== "recipe-creation" || !creationTarget) {
      return;
    }

    const targetRef = creationTarget === "unit" ? unitFormRef : recipeFormRef;
    targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCreationTarget(null);
  }, [activeTab, creationTarget]);

  const updateRecipeField = (field, value) => {
    setRecipeForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateRecipeIngredientRow = (rowId, field, value) => {
    setRecipeForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const addRecipeIngredientRow = () => {
    setRecipeForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, emptyRecipeIngredientRow()],
    }));
  };

  const removeRecipeIngredientRow = (rowId) => {
    setRecipeForm((current) => ({
      ...current,
      ingredients:
        current.ingredients.length === 1
          ? [emptyRecipeIngredientRow()]
          : current.ingredients.filter((row) => row.id !== rowId),
    }));
  };

  const updateMealPlanField = (field, value) => {
    setMealPlanForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateMealPlanItemRow = (rowId, field, value) => {
    setMealPlanForm((current) => ({
      ...current,
      items: current.items.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    }));
  };

  const addMealPlanItemRow = () => {
    setMealPlanForm((current) => ({
      ...current,
      items: [...current.items, emptyMealPlanItemRow()],
    }));
  };

  const removeMealPlanItemRow = (rowId) => {
    setMealPlanForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [emptyMealPlanItemRow()]
          : current.items.filter((row) => row.id !== rowId),
    }));
  };

  const handleRecipeSubmit = async (event) => {
    event.preventDefault();
    setRecipeSubmitError("");
    setRecipeSuccessMessage("");

    const hasEmptyIngredient = recipeForm.ingredients.some(
      (row) => isBlank(row.ingredient_id) || isBlank(row.quantity) || isBlank(row.unit_id),
    );

    if (!recipeForm.name.trim()) {
      setRecipeSubmitError("Recipe name is required.");
      return;
    }

    if (Number(recipeForm.servings) < 1) {
      setRecipeSubmitError("Servings must be at least 1.");
      return;
    }

    if (hasEmptyIngredient) {
      setRecipeSubmitError("Each ingredient row needs an ingredient, quantity, and unit.");
      return;
    }

    const payload = {
      name: recipeForm.name.trim(),
      description: recipeForm.description.trim() || null,
      meal_type: recipeForm.meal_type,
      servings: Number(recipeForm.servings),
      ingredients: recipeForm.ingredients.map((row) => ({
        ingredient_id: Number(row.ingredient_id),
        quantity: Number(row.quantity),
        unit_id: Number(row.unit_id),
      })),
    };

    setIsSubmittingRecipe(true);

    try {
      const data = await request("/recipes", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setRecipeSuccessMessage(`Recipe saved successfully with ID ${data.id}.`);
      setRecipeForm(createInitialRecipeForm());
      await loadRecipes();
    } catch (error) {
      setRecipeSubmitError(error.message || "Something went wrong while saving the recipe.");
    } finally {
      setIsSubmittingRecipe(false);
    }
  };

  const handleIngredientSubmit = async (event) => {
    event.preventDefault();
    setIngredientSubmitError("");
    setIngredientSuccessMessage("");

    if (!ingredientForm.name.trim()) {
      setIngredientSubmitError("Ingredient name is required.");
      return;
    }

    setIsSubmittingIngredient(true);

    try {
      const data = await request("/ingredients", {
        method: "POST",
        body: JSON.stringify({
          name: ingredientForm.name.trim(),
          category: ingredientForm.category.trim() || null,
        }),
      });

      setIngredientSuccessMessage(`Ingredient "${data.name}" added.`);
      setIngredientForm(createInitialIngredientForm());
      await loadIngredients();
    } catch (error) {
      setIngredientSubmitError(error.message || "Could not save the ingredient.");
    } finally {
      setIsSubmittingIngredient(false);
    }
  };

  const handleUnitSubmit = async (event) => {
    event.preventDefault();
    setUnitSubmitError("");
    setUnitSuccessMessage("");

    if (!unitForm.name.trim() || !unitForm.short_name.trim()) {
      setUnitSubmitError("Unit name and short name are required.");
      return;
    }

    setIsSubmittingUnit(true);

    try {
      const data = await request("/units", {
        method: "POST",
        body: JSON.stringify({
          name: unitForm.name.trim(),
          short_name: unitForm.short_name.trim(),
        }),
      });

      setUnitSuccessMessage(`Unit "${data.name}" added.`);
      setUnitForm(createInitialUnitForm());
      await loadUnits();
    } catch (error) {
      setUnitSubmitError(error.message || "Could not save the unit.");
    } finally {
      setIsSubmittingUnit(false);
    }
  };

  const handleMealPlanSubmit = async (event) => {
    event.preventDefault();
    setMealPlanSubmitError("");
    setMealPlanSuccessMessage("");

    const hasEmptyItem = mealPlanForm.items.some((item) => isBlank(item.date) || isBlank(item.recipe_id));

    if (!mealPlanForm.name.trim()) {
      setMealPlanSubmitError("Meal plan name is required.");
      return;
    }

    if (!mealPlanForm.start_date || !mealPlanForm.end_date) {
      setMealPlanSubmitError("Meal plan start and end dates are required.");
      return;
    }

    if (mealPlanForm.start_date > mealPlanForm.end_date) {
      setMealPlanSubmitError("Start date must be on or before end date.");
      return;
    }

    if (hasEmptyItem) {
      setMealPlanSubmitError("Each meal slot needs a date and recipe.");
      return;
    }

    const payload = {
      name: mealPlanForm.name.trim(),
      start_date: mealPlanForm.start_date,
      end_date: mealPlanForm.end_date,
      items: mealPlanForm.items.map((item) => ({
        date: item.date,
        meal_type: item.meal_type,
        recipe_id: Number(item.recipe_id),
      })),
    };

    setIsSubmittingMealPlan(true);

    try {
      const data = await request("/meal-plans", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setMealPlanSuccessMessage(`Meal plan "${data.name}" created.`);
      setMealPlanForm(createInitialMealPlanForm());
      setSelectedMealPlanId(data.id);
      setSelectedMealPlan(data);
      await loadMealPlans();
    } catch (error) {
      setMealPlanSubmitError(error.message || "Could not create the meal plan.");
    } finally {
      setIsSubmittingMealPlan(false);
    }
  };

  const groupedMealPlanItems = useMemo(
    () => groupMealPlanItems(selectedMealPlan?.items ?? []),
    [selectedMealPlan],
  );

  const sortedRecipes = useMemo(
    () => sortRecipes(recipes, recipeSortBy, recipeSortDirection),
    [recipeSortBy, recipeSortDirection, recipes],
  );

  const filteredRecipes = useMemo(
    () => recipes.filter((recipe) => recipeMatchesSearch(recipe, recipeSearchTerm)),
    [recipeSearchTerm, recipes],
  );

  const recipesTabCanSubmit =
    !isLoadingIngredients &&
    !isLoadingUnits &&
    !isSubmittingRecipe &&
    ingredients.length > 0 &&
    units.length > 0;

  const mealPlansTabCanSubmit = !isLoadingRecipes && !isSubmittingMealPlan && recipes.length > 0;

  const openCreationSection = (target) => {
    setCreationTarget(target);
    setActiveTab("recipe-creation");
  };

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="app-layout">
        <section className="hero-card">
          <p className="eyebrow">Kitchen Studio</p>
          <h1>Nowy układ pracy z przepisami, jednostkami i planem posiłków.</h1>
          <p className="hero-copy">
            Główna strona została uproszczona do trzech głównych zakładek, żeby łatwiej było
            przełączać się między wyszukiwaniem, tworzeniem przepisów i planowaniem.
          </p>

          <div className="hero-pills">
            <span>3 główne zakładki</span>
            <span>{recipes.length} przepisów</span>
            <span>{units.length} jednostek</span>
          </div>

          <div className="hero-meta">
            <span>API target</span>
            <code>{API_BASE_URL}</code>
          </div>
        </section>

        <section className="workspace-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Workspace</p>
              <h2>Meal app control center</h2>
            </div>
            <p className="section-note">Switch between the main areas without leaving the page.</p>
          </div>

          <div className="tab-row" role="tablist" aria-label="Meal app sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className={`health-banner ${
              apiHealthStatus === "healthy"
                ? "success"
                : apiHealthStatus === "offline"
                  ? "error"
                  : "warning"
            }`}
          >
            <div className="health-banner-copy">
              <strong>
                {isCheckingApiHealth
                  ? "Checking backend connection..."
                  : apiHealthStatus === "healthy"
                    ? "Backend connected"
                    : apiHealthStatus === "offline"
                      ? "Backend unavailable"
                      : "Backend status needs attention"}
              </strong>
              <span>{apiHealthMessage || "Running API health check."}</span>
            </div>
            <button type="button" className="ghost-button" onClick={loadApiHealth}>
              Retry health check
            </button>
          </div>

          {activeTab === "recipe-search" ? (
            <div className="tab-panel">
              <div className="panel-grid">
                <section className="panel-card">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Szybkie akcje</p>
                      <h3>Wyszukiwarka przepisów</h3>
                    </div>
                    <p className="section-note">Tutaj zostawiłem skróty do najczęściej używanych akcji.</p>
                  </div>

                  <div className="action-list">
                    <button type="button" className="secondary-button action-button" onClick={() => openCreationSection("recipe")}>
                      Dodaj przepis
                    </button>
                    <button type="button" className="ghost-button action-button" onClick={() => openCreationSection("unit")}>
                      Dodaj jednostkę
                    </button>
                  </div>

                  <div className="stack-section">
                    <div className="section-heading">
                      <div>
                        <p className="section-kicker">Podsumowanie</p>
                        <h3>Stan biblioteki</h3>
                      </div>
                    </div>

                    <div className="chip-list">
                      <span className="pill">Przepisy: {recipes.length}</span>
                      <span className="pill">Składniki: {ingredients.length}</span>
                      <span className="pill">Jednostki: {units.length}</span>
                    </div>
                  </div>
                </section>

                <section className="panel-card">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Biblioteka</p>
                      <h3>Zapisane przepisy</h3>
                    </div>
                    <p className="section-note">Lista przepisów została pod ręką w zakładce wyszukiwarki.</p>
                  </div>

                  <div className="search-row">
                    <label className="field">
                      <span>Szukaj przepisu</span>
                      <input
                        type="search"
                        value={recipeSearchTerm}
                        onChange={(event) => setRecipeSearchTerm(event.target.value)}
                        placeholder="np. pasta, dinner, pomidor"
                      />
                    </label>
                  </div>

                  {recipeLoadError ? <div className="banner error">{recipeLoadError}</div> : null}
                  {isLoadingRecipes ? <p className="helper">Loading recipes...</p> : null}
                  {!isLoadingRecipes && recipes.length === 0 ? (
                    <p className="helper">No recipes yet. The first saved recipe will appear here.</p>
                  ) : null}
                  {!isLoadingRecipes && recipes.length > 0 && filteredRecipes.length === 0 ? (
                    <p className="helper">Nie znaleziono przepisów pasujących do wyszukiwania.</p>
                  ) : null}
                  {!isLoadingRecipes && filteredRecipes.length > 0 ? (
                    <RecipeCards recipes={filteredRecipes} />
                  ) : null}
                </section>
              </div>
            </div>
          ) : null}

          {activeTab === "recipe-creation" ? (
            <div className="tab-panel">
              <div className="panel-grid">
                <section className="panel-card" ref={recipeFormRef}>
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Nowy przepis</p>
                      <h3>Tworzenie przepisów</h3>
                    </div>
                    <p className="section-note">Dodaj przepis razem z listą składników i jednostkami.</p>
                  </div>

                  {ingredientLoadError ? <div className="banner error">{ingredientLoadError}</div> : null}
                  {unitLoadError ? <div className="banner error">{unitLoadError}</div> : null}
                  {recipeSubmitError ? <div className="banner error">{recipeSubmitError}</div> : null}
                  {recipeSuccessMessage ? <div className="banner success">{recipeSuccessMessage}</div> : null}

                  <form onSubmit={handleRecipeSubmit}>
                    <div className="form-grid">
                      <label className="field field-wide">
                        <span>Recipe name</span>
                        <input
                          type="text"
                          value={recipeForm.name}
                          onChange={(event) => updateRecipeField("name", event.target.value)}
                          placeholder="Creamy tomato pasta"
                        />
                      </label>

                      <label className="field">
                        <span>Meal type</span>
                        <select
                          value={recipeForm.meal_type}
                          onChange={(event) => updateRecipeField("meal_type", event.target.value)}
                        >
                          {mealTypes.map((mealType) => (
                            <option key={mealType.value} value={mealType.value}>
                              {mealType.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Servings</span>
                        <input
                          type="number"
                          min="1"
                          value={recipeForm.servings}
                          onChange={(event) => updateRecipeField("servings", event.target.value)}
                        />
                      </label>

                      <label className="field field-wide">
                        <span>Description</span>
                        <textarea
                          rows="4"
                          value={recipeForm.description}
                          onChange={(event) => updateRecipeField("description", event.target.value)}
                          placeholder="Short notes, flavor profile, or cooking instructions."
                        />
                      </label>
                    </div>

                    <div className="stack-section">
                      <div className="section-heading">
                        <div>
                          <p className="section-kicker">Ingredients</p>
                          <h3>What goes into it?</h3>
                        </div>
                        <button type="button" className="secondary-button" onClick={addRecipeIngredientRow}>
                          Add ingredient
                        </button>
                      </div>

                      {isLoadingIngredients || isLoadingUnits ? (
                        <p className="helper">Loading ingredient and unit options...</p>
                      ) : null}
                      {!isLoadingIngredients && ingredients.length === 0 ? (
                        <p className="helper">No ingredients found yet. Add some below first.</p>
                      ) : null}
                      {!isLoadingUnits && units.length === 0 ? (
                        <p className="helper">No units found yet. Add some below first.</p>
                      ) : null}

                      <div className="row-list">
                        {recipeForm.ingredients.map((row, index) => (
                          <div className="editable-row" key={row.id}>
                            <div className="row-title">Ingredient {index + 1}</div>

                            <label className="field">
                              <span>Ingredient</span>
                              <select
                                value={row.ingredient_id}
                                onChange={(event) => updateRecipeIngredientRow(row.id, "ingredient_id", event.target.value)}
                              >
                                <option value="">Select ingredient</option>
                                {ingredients.map((ingredient) => (
                                  <option key={ingredient.id} value={ingredient.id}>
                                    {ingredient.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="field">
                              <span>Quantity</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.quantity}
                                onChange={(event) => updateRecipeIngredientRow(row.id, "quantity", event.target.value)}
                                placeholder="2"
                              />
                            </label>

                            <label className="field">
                              <span>Unit</span>
                              <select
                                value={row.unit_id}
                                onChange={(event) => updateRecipeIngredientRow(row.id, "unit_id", event.target.value)}
                              >
                                <option value="">Select unit</option>
                                {units.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {unit.name} ({unit.short_name})
                                  </option>
                                ))}
                              </select>
                            </label>

                            <button type="button" className="ghost-button" onClick={() => removeRecipeIngredientRow(row.id)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={!recipesTabCanSubmit}>
                        {isSubmittingRecipe ? "Saving recipe..." : "Save recipe"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="panel-card">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Sortowanie</p>
                      <h3>Filtry dla listy przepisów</h3>
                    </div>
                    <p className="section-note">Możesz teraz zmieniać sposób porządkowania zapisanych przepisów.</p>
                  </div>

                  <div className="filter-row">
                    <label className="field">
                      <span>Sortuj po</span>
                      <select value={recipeSortBy} onChange={(event) => setRecipeSortBy(event.target.value)}>
                        <option value="created_at">Dacie dodania</option>
                        <option value="name">Nazwie</option>
                        <option value="meal_type">Typie posiłku</option>
                        <option value="servings">Liczbie porcji</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Kierunek</span>
                      <select value={recipeSortDirection} onChange={(event) => setRecipeSortDirection(event.target.value)}>
                        <option value="desc">Malejąco</option>
                        <option value="asc">Rosnąco</option>
                      </select>
                    </label>
                  </div>

                  {recipeLoadError ? <div className="banner error">{recipeLoadError}</div> : null}
                  {isLoadingRecipes ? <p className="helper">Loading recipes...</p> : null}
                  {!isLoadingRecipes && sortedRecipes.length === 0 ? (
                    <p className="helper">No recipes yet. The first saved recipe will appear here.</p>
                  ) : null}
                  {!isLoadingRecipes && sortedRecipes.length > 0 ? <RecipeCards recipes={sortedRecipes} /> : null}
                </section>
              </div>

              <div className="panel-grid compact tab-subgrid">
                <section className="panel-card">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Pantry setup</p>
                      <h3>Add an ingredient</h3>
                    </div>
                    <p className="section-note">Saved ingredients become available in recipe forms.</p>
                  </div>

                  {ingredientSubmitError ? <div className="banner error">{ingredientSubmitError}</div> : null}
                  {ingredientSuccessMessage ? <div className="banner success">{ingredientSuccessMessage}</div> : null}

                  <form onSubmit={handleIngredientSubmit}>
                    <div className="form-grid single-column">
                      <label className="field">
                        <span>Name</span>
                        <input
                          type="text"
                          value={ingredientForm.name}
                          onChange={(event) => setIngredientForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Tomatoes"
                        />
                      </label>

                      <label className="field">
                        <span>Category</span>
                        <input
                          type="text"
                          value={ingredientForm.category}
                          onChange={(event) => setIngredientForm((current) => ({ ...current, category: event.target.value }))}
                          placeholder="Vegetables"
                        />
                      </label>
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={isSubmittingIngredient}>
                        {isSubmittingIngredient ? "Saving ingredient..." : "Save ingredient"}
                      </button>
                    </div>
                  </form>

                  <div className="stack-section">
                    <div className="section-heading">
                      <div>
                        <p className="section-kicker">Current list</p>
                        <h3>Ingredients</h3>
                      </div>
                      <p className="section-note">Alphabetical order from the backend.</p>
                    </div>

                    {ingredientLoadError ? <div className="banner error">{ingredientLoadError}</div> : null}
                    {isLoadingIngredients ? <p className="helper">Loading ingredients...</p> : null}
                    {!isLoadingIngredients && ingredients.length === 0 ? (
                      <p className="helper">No ingredients have been added yet.</p>
                    ) : null}

                    <div className="card-list">
                      {ingredients.map((ingredient) => (
                        <article className="data-card compact" key={ingredient.id}>
                          <div className="data-card-header">
                            <h4>{ingredient.name}</h4>
                            {ingredient.category ? <span className="pill subtle">{ingredient.category}</span> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="panel-card" ref={unitFormRef}>
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Kitchen notation</p>
                      <h3>Add a unit</h3>
                    </div>
                    <p className="section-note">Units are shared across all recipe ingredient rows.</p>
                  </div>

                  {unitSubmitError ? <div className="banner error">{unitSubmitError}</div> : null}
                  {unitSuccessMessage ? <div className="banner success">{unitSuccessMessage}</div> : null}

                  <form onSubmit={handleUnitSubmit}>
                    <div className="form-grid single-column">
                      <label className="field">
                        <span>Name</span>
                        <input
                          type="text"
                          value={unitForm.name}
                          onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Tablespoon"
                        />
                      </label>

                      <label className="field">
                        <span>Short name</span>
                        <input
                          type="text"
                          value={unitForm.short_name}
                          onChange={(event) => setUnitForm((current) => ({ ...current, short_name: event.target.value }))}
                          placeholder="tbsp"
                        />
                      </label>
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={isSubmittingUnit}>
                        {isSubmittingUnit ? "Saving unit..." : "Save unit"}
                      </button>
                    </div>
                  </form>

                  <div className="stack-section">
                    <div className="section-heading">
                      <div>
                        <p className="section-kicker">Current list</p>
                        <h3>Units</h3>
                      </div>
                      <p className="section-note">Displayed with their full and short forms.</p>
                    </div>

                    {unitLoadError ? <div className="banner error">{unitLoadError}</div> : null}
                    {isLoadingUnits ? <p className="helper">Loading units...</p> : null}
                    {!isLoadingUnits && units.length === 0 ? (
                      <p className="helper">No units have been added yet.</p>
                    ) : null}

                    <div className="card-list">
                      {units.map((unit) => (
                        <article className="data-card compact" key={unit.id}>
                          <div className="data-card-header">
                            <h4>{unit.name}</h4>
                            <span className="pill subtle">{unit.short_name}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {activeTab === "meal-plans" ? (
            <div className="tab-panel">
              <div className="panel-grid">
                <section className="panel-card">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Weekly setup</p>
                      <h3>Create a meal plan</h3>
                    </div>
                    <p className="section-note">Assign recipes to dates and meal slots.</p>
                  </div>

                  {mealPlanSubmitError ? <div className="banner error">{mealPlanSubmitError}</div> : null}
                  {mealPlanSuccessMessage ? <div className="banner success">{mealPlanSuccessMessage}</div> : null}
                  {recipeLoadError ? <div className="banner error">{recipeLoadError}</div> : null}

                  <form onSubmit={handleMealPlanSubmit}>
                    <div className="form-grid">
                      <label className="field field-wide">
                        <span>Name</span>
                        <input
                          type="text"
                          value={mealPlanForm.name}
                          onChange={(event) => updateMealPlanField("name", event.target.value)}
                          placeholder="Weeknight dinners"
                        />
                      </label>

                      <label className="field">
                        <span>Start date</span>
                        <input
                          type="date"
                          value={mealPlanForm.start_date}
                          onChange={(event) => updateMealPlanField("start_date", event.target.value)}
                        />
                      </label>

                      <label className="field">
                        <span>End date</span>
                        <input
                          type="date"
                          value={mealPlanForm.end_date}
                          onChange={(event) => updateMealPlanField("end_date", event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="stack-section">
                      <div className="section-heading">
                        <div>
                          <p className="section-kicker">Scheduled meals</p>
                          <h3>Plan the slots</h3>
                        </div>
                        <button type="button" className="secondary-button" onClick={addMealPlanItemRow}>
                          Add slot
                        </button>
                      </div>

                      {isLoadingRecipes ? <p className="helper">Loading recipe options...</p> : null}
                      {!isLoadingRecipes && recipes.length === 0 ? (
                        <p className="helper">Create at least one recipe before scheduling a meal plan.</p>
                      ) : null}

                      <div className="row-list">
                        {mealPlanForm.items.map((item, index) => (
                          <div className="editable-row meal-plan-row" key={item.id}>
                            <div className="row-title">Meal slot {index + 1}</div>

                            <label className="field">
                              <span>Date</span>
                              <input
                                type="date"
                                value={item.date}
                                min={mealPlanForm.start_date || undefined}
                                max={mealPlanForm.end_date || undefined}
                                onChange={(event) => updateMealPlanItemRow(item.id, "date", event.target.value)}
                              />
                            </label>

                            <label className="field">
                              <span>Meal type</span>
                              <select
                                value={item.meal_type}
                                onChange={(event) => updateMealPlanItemRow(item.id, "meal_type", event.target.value)}
                              >
                                {mealTypes.map((mealType) => (
                                  <option key={mealType.value} value={mealType.value}>
                                    {mealType.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="field">
                              <span>Recipe</span>
                              <select
                                value={item.recipe_id}
                                onChange={(event) => updateMealPlanItemRow(item.id, "recipe_id", event.target.value)}
                              >
                                <option value="">Select recipe</option>
                                {recipes.map((recipe) => (
                                  <option key={recipe.id} value={recipe.id}>
                                    {recipe.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <button type="button" className="ghost-button" onClick={() => removeMealPlanItemRow(item.id)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={!mealPlansTabCanSubmit}>
                        {isSubmittingMealPlan ? "Creating meal plan..." : "Create meal plan"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="panel-card">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Calendar</p>
                      <h3>Saved meal plans</h3>
                    </div>
                    <p className="section-note">Select a plan to inspect its scheduled meals.</p>
                  </div>

                  {mealPlanLoadError ? <div className="banner error">{mealPlanLoadError}</div> : null}
                  {mealPlanDetailError ? <div className="banner error">{mealPlanDetailError}</div> : null}

                  <div className="split-content">
                    <div className="selection-list">
                      {isLoadingMealPlans ? <p className="helper">Loading meal plans...</p> : null}
                      {!isLoadingMealPlans && mealPlans.length === 0 ? (
                        <p className="helper">No meal plans yet. Your first saved plan will show up here.</p>
                      ) : null}

                      {mealPlans.map((mealPlan) => (
                        <button
                          key={mealPlan.id}
                          type="button"
                          className={`selection-card ${selectedMealPlanId === mealPlan.id ? "active" : ""}`}
                          onClick={() => setSelectedMealPlanId(mealPlan.id)}
                        >
                          <strong>{mealPlan.name}</strong>
                          <span>
                            {formatDate(mealPlan.start_date)} to {formatDate(mealPlan.end_date)}
                          </span>
                          <span>{mealPlan.item_count} scheduled meals</span>
                        </button>
                      ))}
                    </div>

                    <div className="detail-panel">
                      {isLoadingMealPlanDetail ? <p className="helper">Loading selected meal plan...</p> : null}
                      {!isLoadingMealPlanDetail && !selectedMealPlan ? (
                        <p className="helper">Select a meal plan to view its details.</p>
                      ) : null}

                      {selectedMealPlan ? (
                        <div className="detail-stack">
                          <div className="detail-header">
                            <div>
                              <h4>{selectedMealPlan.name}</h4>
                              <p className="helper">
                                {formatDate(selectedMealPlan.start_date)} to {formatDate(selectedMealPlan.end_date)}
                              </p>
                            </div>
                          </div>

                          {groupedMealPlanItems.length === 0 ? (
                            <p className="helper">This meal plan does not contain any scheduled meals yet.</p>
                          ) : (
                            groupedMealPlanItems.map((group) => (
                              <section className="day-card" key={group.date}>
                                <div className="day-card-header">
                                  <h5>{formatDate(group.date)}</h5>
                                </div>
                                <div className="card-list">
                                  {group.items.map((item) => (
                                    <article className="data-card compact" key={item.id}>
                                      <div className="data-card-header">
                                        <h4>{item.recipe_name}</h4>
                                        <span className="pill subtle">{formatMealType(item.meal_type)}</span>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              </section>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default App;
