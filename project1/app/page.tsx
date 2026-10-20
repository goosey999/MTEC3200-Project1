"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { parseRecipeHtml, type Recipe, type RecipeLibraryResponse } from "./recipe-utils";
import ThemeToggle from "./theme-toggle";

type Meal = "Breakfast" | "Lunch" | "Dinner" | "Dessert" | "Other";
type MealFilter = "Any meal" | Meal;

const mealFilters: MealFilter[] = ["Any meal", "Breakfast", "Lunch", "Dinner", "Dessert", "Other"];
const defaultTagColor = "#c5eee5";
const ingredientDescriptors = new Set([
  "tablespoon", "tablespoons", "tbsp", "teaspoon", "teaspoons", "tsp", "cup", "cups",
  "ounce", "ounces", "oz", "pound", "pounds", "lb", "lbs", "gram", "grams", "kg",
  "kilogram", "kilograms", "milliliter", "milliliters", "ml", "liter", "liters", "pint",
  "pints", "quart", "quarts", "gallon", "gallons", "clove", "cloves", "can", "cans",
  "package", "packages", "pkg", "slice", "slices", "stick", "sticks", "sprig", "sprigs",
  "bunch", "bunches",
  "head", "heads", "piece", "pieces", "part", "parts", "weight", "percent",
  "all", "purpose", "table", "sea", "kosher", "flaky", "iodized", "fine", "coarse",
  "fresh", "freshly", "dried", "unsalted", "salted", "organic", "large", "medium",
  "small", "chopped", "minced", "diced", "sliced", "grated", "shredded", "packed",
  "drained", "rinsed", "boneless", "skinless", "cooked", "raw", "ripe", "ground",
  "white", "brown", "granulated", "confectioners", "powdered", "extra", "virgin",
  "low", "sodium", "reduced", "fat", "optional", "bread", "cake", "pastry", "self",
  "rising", "whole", "wheat", "peeled", "roughly", "coarsely", "finely", "thinly",
  "thickly", "halved", "quartered", "crumbled", "crushed", "beaten", "melted",
  "softened", "divided", "separated", "trimmed", "seeded", "cored", "pitted",
  "packed", "loosely", "then", "plus", "more", "needed", "serving", "garnish",
  "topping", "taste", "about", "approximately", "room", "temperature", "lengthwise",
  "crosswise", "of", "approximately", "remaining",
]);

function mealTagName(tag: string | undefined): Meal | null {
  return mealFilters.find(
    (meal): meal is Meal => meal !== "Any meal" && meal.toLocaleLowerCase() === tag?.toLocaleLowerCase(),
  ) ?? null;
}

function isMealTag(tag: string): boolean {
  return mealTagName(tag) !== null;
}

function ingredientName(value: string): string {
  const name = value
    .replace(/^\s*\d+(?:\.\d+)?\s*%\s*weight\s+of\s+.+?\s+of\s+/i, "")
    .replace(/^\s*[-–—•]\s*/, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[\])}([{]/g, " ")
    .replace(/\b(?:to taste|as needed|for serving|for garnish|for dusting|for coating|garnish with|serve with)\b/gi, " ")
    .replace(/[0-9¼½¾⅓⅔⅛⅜⅝⅞⅟⁄%]+/gu, " ")
    .replace(/[^\p{L}'’\s]/gu, " ");

  return name
    .split(/\s+/)
    .filter((word) => word && !ingredientDescriptors.has(word.toLocaleLowerCase().replace(/[.,;:!?()[\]{}]/g, "")))
    .join(" ");
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [mealFilter, setMealFilter] = useState<MealFilter>("Any meal");
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mealFiltersOpen, setMealFiltersOpen] = useState(true);
  const [tagFiltersOpen, setTagFiltersOpen] = useState(true);
  const [ingredientFiltersOpen, setIngredientFiltersOpen] = useState(true);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [pickedRecipe, setPickedRecipe] = useState<Recipe | null>(null);
  const [detailsRecipe, setDetailsRecipe] = useState<Recipe | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecipes() {
      try {
        const response = await fetch("/api/recipes", { signal: controller.signal });
        if (!response.ok) throw new Error(`Recipe request failed (${response.status}).`);
        const data = await response.json() as RecipeLibraryResponse;
        setTagColors(data.tagColors ?? {});
        setRecipes(data.files.map((file) => {
          const recipe = parseRecipeHtml(file.html, file.name);
          const mealTag = file.tags?.find((tag) => isMealTag(tag));
          return {
            ...recipe,
            tags: (file.tags ?? []).filter((tag) => !isMealTag(tag)),
            meal: file.meal ?? mealTagName(mealTag) ?? recipe.meal,
          };
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("Could not load recipes from the recipes folder. Check the server and try again.");
        console.error("Could not load recipes.", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadRecipes();
    return () => controller.abort();
  }, []);

  function getTagColor(tag: string): string {
    const matchingTag = Object.keys(tagColors).find(
      (savedTag) => savedTag.toLocaleLowerCase() === tag.toLocaleLowerCase(),
    );
    return matchingTag ? tagColors[matchingTag] : defaultTagColor;
  }

  const ingredientOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        const label = ingredientName(ingredient);
        const key = label.toLocaleLowerCase();
        if (label && !options.has(key)) options.set(key, label);
      }
    }
    return Array.from(options.entries()).sort((left, right) => left[1].localeCompare(right[1]));
  }, [recipes]);

  const visibleIngredients = ingredientOptions.filter(([, label]) =>
    label.toLocaleLowerCase().includes(ingredientSearch.toLocaleLowerCase()),
  );
  const tagOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const recipe of recipes) {
      for (const tag of recipe.tags ?? []) {
        const key = tag.toLocaleLowerCase();
        if (!options.has(key)) options.set(key, tag);
      }
    }
    return Array.from(options.entries()).sort((left, right) => left[1].localeCompare(right[1]));
  }, [recipes]);

  const matchingRecipes = recipes.filter((recipe) => {
    const mealMatches = mealFilter === "Any meal" || recipe.meal === mealFilter;
    const ingredientMatches = selectedIngredients.every((selected) =>
      recipe.ingredients.some((ingredient) => ingredientName(ingredient).toLocaleLowerCase() === selected),
    );
    const tagMatches = selectedTags.every((selected) =>
      (recipe.tags ?? []).some((tag) => tag.toLocaleLowerCase() === selected),
    );
    return mealMatches && ingredientMatches && tagMatches;
  });

  function pickRecipe() {
    if (!matchingRecipes.length) return;
    const choices = matchingRecipes.filter((recipe) => recipe.id !== pickedRecipe?.id);
    const pool = choices.length ? choices : matchingRecipes;
    setPickedRecipe(pool[Math.floor(Math.random() * pool.length)]);
  }

  function toggleIngredient(ingredient: string) {
    setSelectedIngredients((selected) => selected.includes(ingredient)
      ? selected.filter((item) => item !== ingredient)
      : [...selected, ingredient]);
    setPickedRecipe(null);
  }

  function toggleTag(tag: string) {
    setSelectedTags((selected) => selected.includes(tag)
      ? selected.filter((item) => item !== tag)
      : [...selected, tag]);
    setPickedRecipe(null);
  }

  useEffect(() => {
    if (!detailsRecipe) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailsRecipe(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailsRecipe]);

  useEffect(() => {
    if (!filtersOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setFiltersOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button
          className="filters-open"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls={filtersOpen ? "recipe-filters" : undefined}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
            <path d="M4 6h16M7 12h10m-7 6h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {filtersOpen ? "Hide filters" : "Show filters"}
        </button>
        <div className="top-actions">
          <Link className="library-status library-link" href="/recipes" aria-label="Browse all recipes">
            <span className="status-dot" />
            {loading
              ? "Loading recipes..."
              : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} in your library`}
            <span aria-hidden="true">→</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className={`workspace${filtersOpen ? " has-filters" : ""}`} id="home">
        {filtersOpen && (
            <aside className="filters" id="recipe-filters" aria-label="Recipe filters">
              <div className="section-heading">
                <h2>What sounds good?</h2>
                <button
                  className="filters-close"
                  type="button"
                  aria-label="Close filters"
                  onClick={() => setFiltersOpen(false)}
                >
                  ×
                </button>
              </div>

              <fieldset className="filter-group meal-group">
                <legend className="visually-hidden">Meal</legend>
                <button
                  className="filter-toggle"
                  type="button"
                  aria-expanded={mealFiltersOpen}
                  aria-controls="meal-filter-options"
                  onClick={() => setMealFiltersOpen((open) => !open)}
                >
                  <span>Meal</span>
                  <span className={`filter-toggle-arrow${mealFiltersOpen ? " is-open" : ""}`} aria-hidden="true" />
                </button>
                {mealFiltersOpen && (
                  <div className="meal-options" id="meal-filter-options">
                    {mealFilters.map((meal) => (
                      <button
                        className={`meal-option${mealFilter === meal ? " is-selected" : ""}`}
                        key={meal}
                        type="button"
                        aria-pressed={mealFilter === meal}
                        onClick={() => {
                          setMealFilter(meal);
                          setPickedRecipe(null);
                        }}
                      >
                        {meal}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>

              {tagOptions.length > 0 && (
                <fieldset className="filter-group tag-group">
                  <legend className="visually-hidden">Tags</legend>
                  <div className="ingredient-heading">
                    <button
                      className="filter-toggle"
                      type="button"
                      aria-expanded={tagFiltersOpen}
                      aria-controls="tag-filter-options"
                      onClick={() => setTagFiltersOpen((open) => !open)}
                    >
                      <span>Tags</span>
                      <span className={`filter-toggle-arrow${tagFiltersOpen ? " is-open" : ""}`} aria-hidden="true" />
                    </button>
                    {selectedTags.length > 0 && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setSelectedTags([]);
                          setPickedRecipe(null);
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {tagFiltersOpen && (
                    <div id="tag-filter-options">
                      <div className="ingredient-list">
                        {tagOptions.map(([value, label]) => (
                          <label className="ingredient-option" key={value}>
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(value)}
                              onChange={() => toggleTag(value)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="filter-hint">Recipes must have every selected tag.</p>
                    </div>
                  )}
                </fieldset>
              )}

              <fieldset className="filter-group ingredients-group">
                <legend className="visually-hidden">Ingredients</legend>
                <div className="ingredient-heading">
                  <button
                    className="filter-toggle"
                    type="button"
                    aria-expanded={ingredientFiltersOpen}
                    aria-controls="ingredient-filter-options"
                    onClick={() => setIngredientFiltersOpen((open) => !open)}
                  >
                    <span>Ingredients</span>
                    <span className={`filter-toggle-arrow${ingredientFiltersOpen ? " is-open" : ""}`} aria-hidden="true" />
                  </button>
                  {selectedIngredients.length > 0 && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setSelectedIngredients([]);
                        setPickedRecipe(null);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {ingredientFiltersOpen && (
                  <div id="ingredient-filter-options">
                    {recipes.length > 0 ? (
                      <>
                        <label className="search-field">
                          <span className="search-icon" aria-hidden="true" />
                          <span className="visually-hidden">Search ingredients</span>
                          <input
                            value={ingredientSearch}
                            onChange={(event) => setIngredientSearch(event.target.value)}
                            placeholder="Find an ingredient"
                          />
                        </label>
                        <div className="ingredient-list">
                          {visibleIngredients.length ? visibleIngredients.map(([value, label]) => (
                            <label className="ingredient-option" key={value}>
                              <input
                                type="checkbox"
                                checked={selectedIngredients.includes(value)}
                                onChange={() => toggleIngredient(value)}
                              />
                              <span>{label}</span>
                            </label>
                          )) : <p className="filter-hint">No ingredients match that search.</p>}
                        </div>
                        <p className="filter-hint">Recipes must include every selected ingredient.</p>
                      </>
                    ) : (
                      <p className="filter-hint">
                        {loading ? "Loading ingredients..." : "Add HTML recipes to the recipes folder to see ingredients here."}
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
            </aside>
        )}

        <section className="picker" aria-labelledby="picker-title">
          <div className="picker-intro">
            <h1 id="picker-title">What are we<br className="desktop-break" /> having today?</h1>
          </div>

          <button
            className="pick-button"
            type="button"
            onClick={pickRecipe}
            disabled={loading || !matchingRecipes.length}
          >
            <span className="dice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="9" cy="9" r="1.3" fill="currentColor" />
                <circle cx="15" cy="15" r="1.3" fill="currentColor" />
                <circle cx="15" cy="9" r="1.3" fill="currentColor" />
                <circle cx="9" cy="15" r="1.3" fill="currentColor" />
              </svg>
            </span>
            <span className="pick-button-label">Pick a random recipe</span>
          </button>

          <p className="match-count" aria-live="polite">
            {recipes.length
              ? `${matchingRecipes.length} ${matchingRecipes.length === 1 ? "recipe" : "recipes"} match your filters`
              : "Your next favorite is already in your recipe box"}
          </p>

          {pickedRecipe ? (
            <article className={`recipe-result picked-recipe-result${pickedRecipe.image ? " has-image" : ""}`} aria-live="polite">
              {pickedRecipe.image && (
                <Image
                  className="picked-recipe-image"
                  src={`/api/recipes/image?path=${encodeURIComponent(pickedRecipe.image)}`}
                  alt={pickedRecipe.title}
                  width={160}
                  height={160}
                  unoptimized
                />
              )}
              <div className="picked-recipe-content">
                <button
                  className="picked-recipe-title"
                  type="button"
                  onClick={() => setDetailsRecipe(pickedRecipe)}
                >
                  {pickedRecipe.title}
                </button>
                <div className="recipe-tags">
                  <div className="recipe-tag-list" aria-label={`Tags for ${pickedRecipe.title}`}>
                    {pickedRecipe.meal && <span className="meal-tag">{pickedRecipe.meal}</span>}
                    {(pickedRecipe.tags ?? []).map((tag) => (
                      <span className="recipe-tag" key={tag} style={{ backgroundColor: getTagColor(tag) }}>
                        {tag}
                      </span>
                    ))}
                    {!pickedRecipe.meal && !pickedRecipe.tags?.length && (
                      <span className="recipe-tags-empty">No tags yet</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ) : loading ? (
            <div className="empty-library no-matches">
              <div className="empty-mark" aria-hidden="true">…</div>
              <div>
                <h2>Loading your recipes</h2>
                <p>Your recipe box will be ready in a moment.</p>
              </div>
            </div>
          ) : recipes.length === 0 ? (
            <div className="empty-library">
              <div className="empty-mark" aria-hidden="true">↘</div>
              <div>
                <h2>Start with your recipe box</h2>
                <p>Drop Paprika HTML recipe files in the project&apos;s recipes folder and reload this page.</p>
              </div>
            </div>
          ) : (
            <div className="empty-library no-matches">
              <div className="empty-mark" aria-hidden="true">↗</div>
              <div>
                <h2>No recipes found</h2>
                <p>Try a different meal or remove an ingredient filter.</p>
              </div>
            </div>
          )}

          {status && <p className="status-message" role="status">{status}</p>}
        </section>
      </div>

      {detailsRecipe && (
        <div
          className="recipe-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetailsRecipe(null);
          }}
        >
          <section
            className="recipe-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-dialog-title"
          >
            <div className="recipe-dialog-header">
              <div>
                {detailsRecipe.meal && <span className="meal-tag">{detailsRecipe.meal}</span>}
              </div>
              <button
                className="recipe-dialog-close"
                type="button"
                aria-label="Close recipe"
                onClick={() => setDetailsRecipe(null)}
              >
                ×
              </button>
            </div>
            <h2 id="recipe-dialog-title">{detailsRecipe.title}</h2>
            <p className="recipe-source">From {detailsRecipe.source}</p>
            {detailsRecipe.ingredients.length > 0 && (
              <div className="result-section">
                <h3>Ingredients</h3>
                <ul>
                  {detailsRecipe.ingredients.map((ingredient, index) => (
                    <li key={`${detailsRecipe.id}-ingredient-${index}`}>{ingredient}</li>
                  ))}
                </ul>
              </div>
            )}
            {detailsRecipe.instructions.length > 0 && (
              <div className="result-section directions">
                <h3>Instructions</h3>
                <ol>
                  {detailsRecipe.instructions.map((instruction, index) => (
                    <li key={`${detailsRecipe.id}-instruction-${index}`}>{instruction}</li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </div>
      )}

    </main>
  );
}
