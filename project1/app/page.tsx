"use client";

import { useEffect, useMemo, useState } from "react";
import { parseRecipeHtml, type Recipe, type RecipeFile } from "./recipe-utils";
import ThemeToggle from "./theme-toggle";

type Meal = "Breakfast" | "Lunch" | "Dinner";
type MealFilter = "Any meal" | Meal;

const mealFilters: MealFilter[] = ["Any meal", "Breakfast", "Lunch", "Dinner"];

function mealTagName(tag: string | undefined): Meal | null {
  return mealFilters.find(
    (meal): meal is Meal => meal !== "Any meal" && meal.toLocaleLowerCase() === tag?.toLocaleLowerCase(),
  ) ?? null;
}

function isMealTag(tag: string): boolean {
  return mealTagName(tag) !== null;
}

function ingredientName(value: string): string {
  const units = String.raw`tablespoons?|tbsp|teaspoons?|tsp|cups?|ounces?|oz|pounds?|lbs?|grams?|kg|kilograms?|milliliters?|ml|liters?|pints?|quarts?|gallons?|cloves?|cans?|packages?|pkg|slices?|sticks?|bunches?|heads?|pieces?|large|medium|small`;
  const amount = String.raw`(?:\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])`;
  let name = value.replace(/^\s*[-–—•]\s*/, "");

  while (true) {
    const withoutParentheticalMeasurement = name.replace(
      new RegExp(String.raw`^\(\s*${amount}\s+${units}\s*\)\s*`, "i"),
      "",
    );
    if (withoutParentheticalMeasurement !== name) {
      name = withoutParentheticalMeasurement;
      continue;
    }

    const withoutAmount = name.replace(new RegExp(String.raw`^\s*${amount}\s*`, "u"), "");
    if (withoutAmount !== name) {
      name = withoutAmount;
      continue;
    }

    const withoutUnit = name.replace(new RegExp(String.raw`^\s*(?:${units})\b\.?\s*`, "i"), "");
    if (withoutUnit !== name) {
      name = withoutUnit;
      continue;
    }

    break;
  }

  return name.replace(/^\s*[-–—•,:]\s*/, "").trim();
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealFilter, setMealFilter] = useState<MealFilter>("Any meal");
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [pickedRecipe, setPickedRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecipes() {
      try {
        const response = await fetch("/api/recipes", { signal: controller.signal });
        if (!response.ok) throw new Error(`Recipe request failed (${response.status}).`);
        const data = await response.json() as { files: RecipeFile[] };
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

  return (
    <main className="app-shell">
      <header className="top-bar">
        <a className="wordmark" href="#home" aria-label="Supper Club home">
          <span className="wordmark-mark" aria-hidden="true">S</span>
          <span>Supper Club</span>
        </a>
        <div className="top-actions">
          <a className="library-status library-link" href="/recipes" aria-label="Browse all recipes">
            <span className="status-dot" />
            {loading
              ? "Loading recipes..."
              : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} in your library`}
            <span aria-hidden="true">→</span>
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="workspace" id="home">
        <aside className="filters" aria-label="Recipe filters">
          <div className="section-heading">
            <span className="eyebrow">MAKE IT YOURS</span>
            <h2>What sounds good?</h2>
          </div>

          <fieldset className="filter-group meal-group">
            <legend>Meal</legend>
            <div className="meal-options">
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
          </fieldset>

          {tagOptions.length > 0 && (
            <fieldset className="filter-group tag-group">
              <div className="ingredient-heading">
                <legend>Tags</legend>
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
            </fieldset>
          )}

          <fieldset className="filter-group ingredients-group">
            <div className="ingredient-heading">
              <legend>Ingredients</legend>
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
          </fieldset>
        </aside>

        <section className="picker" aria-labelledby="picker-title">
          <div className="picker-intro">
            <span className="eyebrow">A LITTLE LESS DECIDING</span>
            <h1 id="picker-title">What are we<br className="desktop-break" /> having today?</h1>
            <p>Let your recipe box make the call.</p>
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
            <span>Pick a random recipe</span>
            <span className="button-arrow" aria-hidden="true">↗</span>
          </button>

          <p className="match-count" aria-live="polite">
            {recipes.length
              ? `${matchingRecipes.length} ${matchingRecipes.length === 1 ? "recipe" : "recipes"} match your filters`
              : "Your next favorite is already in your recipe box"}
          </p>

          {pickedRecipe ? (
            <article className="recipe-result" aria-live="polite">
              <div className="result-topline">
                <span className="result-label">YOUR NEXT MEAL</span>
                {pickedRecipe.meal && <span className="meal-tag">{pickedRecipe.meal}</span>}
              </div>
              <h2>{pickedRecipe.title}</h2>
              <p className="recipe-source">From {pickedRecipe.source}</p>
              {pickedRecipe.ingredients.length > 0 && (
                <div className="result-section">
                  <h3>Ingredients</h3>
                  <ul>{pickedRecipe.ingredients.slice(0, 8).map((ingredient) => <li key={ingredient}>{ingredient}</li>)}</ul>
                  {pickedRecipe.ingredients.length > 8 && <p className="more-items">+ {pickedRecipe.ingredients.length - 8} more</p>}
                </div>
              )}
              {pickedRecipe.instructions.length > 0 && (
                <div className="result-section directions">
                  <h3>First up</h3>
                  <p>{pickedRecipe.instructions[0]}</p>
                </div>
              )}
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

    </main>
  );
}
