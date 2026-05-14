import { useEffect, useMemo, useRef, useState } from "react";

import { request } from "./api";

const mealTypes = [
  { value: "breakfast", label: "Sniadanie" },
  { value: "lunch", label: "Drugie sniadanie" },
  { value: "dinner", label: "Obiad" },
  { value: "snack", label: "Przekaska" },
  { value: "dessert", label: "Deser" },
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
    return "Brak daty";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
}

function formatDateTime(dateString) {
  if (!dateString) {
    return "Nieznane";
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
                {formatMealType(recipe.meal_type)} • {recipe.servings} porcje
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

  const [recipeLoadError, setRecipeLoadError] = useState("");
  const [ingredientLoadError, setIngredientLoadError] = useState("");
  const [unitLoadError, setUnitLoadError] = useState("");
  const [mealPlanLoadError, setMealPlanLoadError] = useState("");
  const [mealPlanDetailError, setMealPlanDetailError] = useState("");

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

  const loadIngredients = async () => {
    setIsLoadingIngredients(true);
    setIngredientLoadError("");

    try {
      const data = await request("/ingredients");
      setIngredients(data);
    } catch (error) {
      setIngredientLoadError(error.message || "Nie udalo sie zaladowac skladnikow.");
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
      setUnitLoadError(error.message || "Nie udalo sie zaladowac jednostek.");
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
      setRecipeLoadError(error.message || "Nie udalo sie zaladowac przepisow.");
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
      setMealPlanLoadError(error.message || "Nie udalo sie zaladowac planow posilkow.");
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
      setMealPlanDetailError(error.message || "Nie udalo sie zaladowac szczegolow planu posilkow.");
    } finally {
      setIsLoadingMealPlanDetail(false);
    }
  };

  useEffect(() => {
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
      setRecipeSubmitError("Nazwa przepisu jest wymagana.");
      return;
    }

    if (Number(recipeForm.servings) < 1) {
      setRecipeSubmitError("Liczba porcji musi byc co najmniej 1.");
      return;
    }

    if (hasEmptyIngredient) {
      setRecipeSubmitError("Kazdy wiersz skladnika musi miec skladnik, ilosc i jednostke.");
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

      setRecipeSuccessMessage(`Przepis zapisano pomyslnie. ID: ${data.id}.`);
      setRecipeForm(createInitialRecipeForm());
      await loadRecipes();
    } catch (error) {
      setRecipeSubmitError(error.message || "Wystapil blad podczas zapisywania przepisu.");
    } finally {
      setIsSubmittingRecipe(false);
    }
  };

  const handleIngredientSubmit = async (event) => {
    event.preventDefault();
    setIngredientSubmitError("");
    setIngredientSuccessMessage("");

    if (!ingredientForm.name.trim()) {
      setIngredientSubmitError("Nazwa skladnika jest wymagana.");
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

      setIngredientSuccessMessage(`Dodano skladnik: "${data.name}".`);
      setIngredientForm(createInitialIngredientForm());
      await loadIngredients();
    } catch (error) {
      setIngredientSubmitError(error.message || "Nie udalo sie zapisac skladnika.");
    } finally {
      setIsSubmittingIngredient(false);
    }
  };

  const handleUnitSubmit = async (event) => {
    event.preventDefault();
    setUnitSubmitError("");
    setUnitSuccessMessage("");

    if (!unitForm.name.trim() || !unitForm.short_name.trim()) {
      setUnitSubmitError("Nazwa jednostki i skrot sa wymagane.");
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

      setUnitSuccessMessage(`Dodano jednostke: "${data.name}".`);
      setUnitForm(createInitialUnitForm());
      await loadUnits();
    } catch (error) {
      setUnitSubmitError(error.message || "Nie udalo sie zapisac jednostki.");
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
      setMealPlanSubmitError("Nazwa planu posilkow jest wymagana.");
      return;
    }

    if (!mealPlanForm.start_date || !mealPlanForm.end_date) {
      setMealPlanSubmitError("Data poczatkowa i koncowa planu sa wymagane.");
      return;
    }

    if (mealPlanForm.start_date > mealPlanForm.end_date) {
      setMealPlanSubmitError("Data poczatkowa musi byc wczesniejsza lub rowna koncowej.");
      return;
    }

    if (hasEmptyItem) {
      setMealPlanSubmitError("Kazdy slot posilku musi miec date i przepis.");
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

      setMealPlanSuccessMessage(`Utworzono plan posilkow: "${data.name}".`);
      setMealPlanForm(createInitialMealPlanForm());
      setSelectedMealPlanId(data.id);
      setSelectedMealPlan(data);
      await loadMealPlans();
    } catch (error) {
      setMealPlanSubmitError(error.message || "Nie udalo sie utworzyc planu posilkow.");
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
      <main className="app-layout simple-layout">
        <section className="workspace-card">
          <div className="tab-row" role="tablist" aria-label="Sekcje aplikacji">
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

          {activeTab === "recipe-search" ? (
            <div className="tab-panel">
              <section className="panel-card">
                <div className="section-heading">
                  <h3>Wyszukiwarka przepisów</h3>
                  <div className="action-list">
                    <button
                      type="button"
                      className="secondary-button action-button"
                      onClick={() => openCreationSection("recipe")}
                    >
                      Dodaj przepis
                    </button>
                    <button
                      type="button"
                      className="ghost-button action-button"
                      onClick={() => openCreationSection("unit")}
                    >
                      Dodaj jednostkę
                    </button>
                  </div>
                </div>

                <div className="search-row">
                  <label className="field">
                    <span>Szukaj przepisu</span>
                    <input
                      type="search"
                      value={recipeSearchTerm}
                      onChange={(event) => setRecipeSearchTerm(event.target.value)}
                      placeholder="np. pasta, obiad, pomidor"
                    />
                  </label>
                </div>

                {recipeLoadError ? <div className="banner error">{recipeLoadError}</div> : null}
                {isLoadingRecipes ? <p className="helper">Ladowanie przepisow...</p> : null}
                {!isLoadingRecipes && recipes.length === 0 ? <p className="helper">Brak przepisow.</p> : null}
                {!isLoadingRecipes && recipes.length > 0 && filteredRecipes.length === 0 ? (
                  <p className="helper">Nie znaleziono przepisow pasujacych do wyszukiwania.</p>
                ) : null}
                {!isLoadingRecipes && filteredRecipes.length > 0 ? <RecipeCards recipes={filteredRecipes} /> : null}
              </section>
            </div>
          ) : null}

          {activeTab === "recipe-creation" ? (
            <div className="tab-panel">
              <div className="panel-grid">
                <section className="panel-card" ref={recipeFormRef}>
                  <div className="section-heading">
                    <h3>Tworzenie przepisu</h3>
                    <button type="button" className="secondary-button" onClick={addRecipeIngredientRow}>
                      Dodaj skladnik
                    </button>
                  </div>

                  {ingredientLoadError ? <div className="banner error">{ingredientLoadError}</div> : null}
                  {unitLoadError ? <div className="banner error">{unitLoadError}</div> : null}
                  {recipeSubmitError ? <div className="banner error">{recipeSubmitError}</div> : null}
                  {recipeSuccessMessage ? <div className="banner success">{recipeSuccessMessage}</div> : null}

                  <form onSubmit={handleRecipeSubmit}>
                    <div className="form-grid">
                      <label className="field field-wide">
                        <span>Nazwa przepisu</span>
                        <input
                          type="text"
                          value={recipeForm.name}
                          onChange={(event) => updateRecipeField("name", event.target.value)}
                          placeholder="Makaron pomidorowy"
                        />
                      </label>

                      <label className="field">
                        <span>Typ posilku</span>
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
                        <span>Liczba porcji</span>
                        <input
                          type="number"
                          min="1"
                          value={recipeForm.servings}
                          onChange={(event) => updateRecipeField("servings", event.target.value)}
                        />
                      </label>

                      <label className="field field-wide">
                        <span>Opis</span>
                        <textarea
                          rows="4"
                          value={recipeForm.description}
                          onChange={(event) => updateRecipeField("description", event.target.value)}
                          placeholder="Krotkie notatki lub instrukcje."
                        />
                      </label>
                    </div>

                    {isLoadingIngredients || isLoadingUnits ? (
                      <p className="helper stack-section">Ladowanie skladnikow i jednostek...</p>
                    ) : null}
                    {!isLoadingIngredients && ingredients.length === 0 ? (
                      <p className="helper stack-section">Brak skladnikow. Dodaj je ponizej.</p>
                    ) : null}
                    {!isLoadingUnits && units.length === 0 ? (
                      <p className="helper stack-section">Brak jednostek. Dodaj je ponizej.</p>
                    ) : null}

                    <div className="row-list stack-section">
                      {recipeForm.ingredients.map((row, index) => (
                        <div className="editable-row" key={row.id}>
                          <div className="row-title">Skladnik {index + 1}</div>

                          <label className="field">
                            <span>Skladnik</span>
                            <select
                              value={row.ingredient_id}
                              onChange={(event) => updateRecipeIngredientRow(row.id, "ingredient_id", event.target.value)}
                            >
                              <option value="">Wybierz skladnik</option>
                              {ingredients.map((ingredient) => (
                                <option key={ingredient.id} value={ingredient.id}>
                                  {ingredient.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field">
                            <span>Ilosc</span>
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
                            <span>Jednostka</span>
                            <select
                              value={row.unit_id}
                              onChange={(event) => updateRecipeIngredientRow(row.id, "unit_id", event.target.value)}
                            >
                              <option value="">Wybierz jednostke</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name} ({unit.short_name})
                                </option>
                              ))}
                            </select>
                          </label>

                          <button type="button" className="ghost-button" onClick={() => removeRecipeIngredientRow(row.id)}>
                            Usun
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={!recipesTabCanSubmit}>
                        {isSubmittingRecipe ? "Zapisywanie przepisu..." : "Zapisz przepis"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="panel-card">
                  <div className="section-heading">
                    <h3>Lista przepisow</h3>
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
                  {isLoadingRecipes ? <p className="helper">Ladowanie przepisow...</p> : null}
                  {!isLoadingRecipes && sortedRecipes.length === 0 ? <p className="helper">Brak przepisow.</p> : null}
                  {!isLoadingRecipes && sortedRecipes.length > 0 ? <RecipeCards recipes={sortedRecipes} /> : null}
                </section>
              </div>

              <div className="panel-grid compact tab-subgrid">
                <section className="panel-card">
                  <div className="section-heading">
                    <h3>Skladniki</h3>
                  </div>

                  {ingredientSubmitError ? <div className="banner error">{ingredientSubmitError}</div> : null}
                  {ingredientSuccessMessage ? <div className="banner success">{ingredientSuccessMessage}</div> : null}

                  <form onSubmit={handleIngredientSubmit}>
                    <div className="form-grid single-column">
                      <label className="field">
                        <span>Nazwa</span>
                        <input
                          type="text"
                          value={ingredientForm.name}
                          onChange={(event) => setIngredientForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Pomidory"
                        />
                      </label>

                      <label className="field">
                        <span>Kategoria</span>
                        <input
                          type="text"
                          value={ingredientForm.category}
                          onChange={(event) => setIngredientForm((current) => ({ ...current, category: event.target.value }))}
                          placeholder="Warzywa"
                        />
                      </label>
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={isSubmittingIngredient}>
                        {isSubmittingIngredient ? "Zapisywanie skladnika..." : "Zapisz skladnik"}
                      </button>
                    </div>
                  </form>

                  {ingredientLoadError ? <div className="banner error">{ingredientLoadError}</div> : null}
                  {isLoadingIngredients ? <p className="helper">Ladowanie skladnikow...</p> : null}
                  {!isLoadingIngredients && ingredients.length === 0 ? <p className="helper">Nie dodano jeszcze skladnikow.</p> : null}

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
                </section>

                <section className="panel-card" ref={unitFormRef}>
                  <div className="section-heading">
                    <h3>Jednostki</h3>
                  </div>

                  {unitSubmitError ? <div className="banner error">{unitSubmitError}</div> : null}
                  {unitSuccessMessage ? <div className="banner success">{unitSuccessMessage}</div> : null}

                  <form onSubmit={handleUnitSubmit}>
                    <div className="form-grid single-column">
                      <label className="field">
                        <span>Nazwa</span>
                        <input
                          type="text"
                          value={unitForm.name}
                          onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Lyzka"
                        />
                      </label>

                      <label className="field">
                        <span>Skrot</span>
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
                        {isSubmittingUnit ? "Zapisywanie jednostki..." : "Zapisz jednostke"}
                      </button>
                    </div>
                  </form>

                  {unitLoadError ? <div className="banner error">{unitLoadError}</div> : null}
                  {isLoadingUnits ? <p className="helper">Ladowanie jednostek...</p> : null}
                  {!isLoadingUnits && units.length === 0 ? <p className="helper">Nie dodano jeszcze jednostek.</p> : null}

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
                </section>
              </div>
            </div>
          ) : null}

          {activeTab === "meal-plans" ? (
            <div className="tab-panel">
              <div className="panel-grid">
                <section className="panel-card">
                  <div className="section-heading">
                    <h3>Tworzenie planu</h3>
                    <button type="button" className="secondary-button" onClick={addMealPlanItemRow}>
                      Dodaj posilek
                    </button>
                  </div>

                  {mealPlanSubmitError ? <div className="banner error">{mealPlanSubmitError}</div> : null}
                  {mealPlanSuccessMessage ? <div className="banner success">{mealPlanSuccessMessage}</div> : null}
                  {recipeLoadError ? <div className="banner error">{recipeLoadError}</div> : null}

                  <form onSubmit={handleMealPlanSubmit}>
                    <div className="form-grid">
                      <label className="field field-wide">
                        <span>Nazwa</span>
                        <input
                          type="text"
                          value={mealPlanForm.name}
                          onChange={(event) => updateMealPlanField("name", event.target.value)}
                          placeholder="Obiady na dni robocze"
                        />
                      </label>

                      <label className="field">
                        <span>Data poczatkowa</span>
                        <input
                          type="date"
                          value={mealPlanForm.start_date}
                          onChange={(event) => updateMealPlanField("start_date", event.target.value)}
                        />
                      </label>

                      <label className="field">
                        <span>Data koncowa</span>
                        <input
                          type="date"
                          value={mealPlanForm.end_date}
                          onChange={(event) => updateMealPlanField("end_date", event.target.value)}
                        />
                      </label>
                    </div>

                    {isLoadingRecipes ? <p className="helper stack-section">Ladowanie listy przepisow...</p> : null}
                    {!isLoadingRecipes && recipes.length === 0 ? (
                      <p className="helper stack-section">Utworz co najmniej jeden przepis przed planowaniem posilkow.</p>
                    ) : null}

                    <div className="row-list stack-section">
                      {mealPlanForm.items.map((item, index) => (
                        <div className="editable-row meal-plan-row" key={item.id}>
                          <div className="row-title">Posilek {index + 1}</div>

                          <label className="field">
                            <span>Data</span>
                            <input
                              type="date"
                              value={item.date}
                              min={mealPlanForm.start_date || undefined}
                              max={mealPlanForm.end_date || undefined}
                              onChange={(event) => updateMealPlanItemRow(item.id, "date", event.target.value)}
                            />
                          </label>

                          <label className="field">
                            <span>Typ posilku</span>
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
                            <span>Przepis</span>
                            <select
                              value={item.recipe_id}
                              onChange={(event) => updateMealPlanItemRow(item.id, "recipe_id", event.target.value)}
                            >
                              <option value="">Wybierz przepis</option>
                              {recipes.map((recipe) => (
                                <option key={recipe.id} value={recipe.id}>
                                  {recipe.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <button type="button" className="ghost-button" onClick={() => removeMealPlanItemRow(item.id)}>
                            Usun
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="actions">
                      <button className="primary-button" type="submit" disabled={!mealPlansTabCanSubmit}>
                        {isSubmittingMealPlan ? "Tworzenie planu posilkow..." : "Utworz plan posilkow"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="panel-card">
                  <div className="section-heading">
                    <h3>Zapisane plany</h3>
                  </div>

                  {mealPlanLoadError ? <div className="banner error">{mealPlanLoadError}</div> : null}
                  {mealPlanDetailError ? <div className="banner error">{mealPlanDetailError}</div> : null}

                  <div className="split-content">
                    <div className="selection-list">
                      {isLoadingMealPlans ? <p className="helper">Ladowanie planow posilkow...</p> : null}
                      {!isLoadingMealPlans && mealPlans.length === 0 ? <p className="helper">Brak planow posilkow.</p> : null}

                      {mealPlans.map((mealPlan) => (
                        <button
                          key={mealPlan.id}
                          type="button"
                          className={`selection-card ${selectedMealPlanId === mealPlan.id ? "active" : ""}`}
                          onClick={() => setSelectedMealPlanId(mealPlan.id)}
                        >
                          <strong>{mealPlan.name}</strong>
                          <span>
                            {formatDate(mealPlan.start_date)} do {formatDate(mealPlan.end_date)}
                          </span>
                          <span>{mealPlan.item_count} zaplanowanych posilkow</span>
                        </button>
                      ))}
                    </div>

                    <div className="detail-panel">
                      {isLoadingMealPlanDetail ? <p className="helper">Ladowanie wybranego planu posilkow...</p> : null}
                      {!isLoadingMealPlanDetail && !selectedMealPlan ? (
                        <p className="helper">Wybierz plan posilkow, aby zobaczyc szczegoly.</p>
                      ) : null}

                      {selectedMealPlan ? (
                        <div className="detail-stack">
                          <div className="detail-header">
                            <div>
                              <h4>{selectedMealPlan.name}</h4>
                              <p className="helper">
                                {formatDate(selectedMealPlan.start_date)} do {formatDate(selectedMealPlan.end_date)}
                              </p>
                            </div>
                          </div>

                          {groupedMealPlanItems.length === 0 ? (
                            <p className="helper">Ten plan posilkow nie zawiera jeszcze zaplanowanych posilkow.</p>
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
