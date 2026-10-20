"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { parseRecipeHtml, type Meal, type Recipe, type RecipeLibraryResponse } from "../recipe-utils";
import ThemeToggle from "../theme-toggle";

const defaultTagColor = "#c5eee5";
const mealTypes: Meal[] = ["Breakfast", "Lunch", "Dinner", "Dessert", "Other"];

function mealTagName(tag: string | undefined): Meal | null {
  return mealTypes.find((meal) => meal.toLocaleLowerCase() === tag?.toLocaleLowerCase()) ?? null;
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [existingTagDrafts, setExistingTagDrafts] = useState<Record<string, string>>({});
  const [tagColorDrafts, setTagColorDrafts] = useState<Record<string, string>>({});
  const [savingRecipe, setSavingRecipe] = useState<string | null>(null);
  const [addingTagTo, setAddingTagTo] = useState<string | null>(null);
  const [detailsRecipe, setDetailsRecipe] = useState<Recipe | null>(null);
  const existingTags = Array.from(new Set(
    recipes.flatMap((recipe) => recipe.tags ?? []),
  )).sort((left, right) => left.localeCompare(right));
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLocaleLowerCase().includes(normalizedSearch),
  );

  useEffect(() => {
    if (!detailsRecipe) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailsRecipe(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailsRecipe]);

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
          const mealTag = file.tags?.find((tag) => mealTagName(tag) !== null);
          return {
            ...recipe,
            tags: (file.tags ?? []).filter((tag) => mealTagName(tag) === null),
            meal: file.meal ?? mealTagName(mealTag) ?? recipe.meal,
          };
        }));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Could not load recipes.", loadError);
        setLoadError("Could not load recipes from the recipes folder. Check the server and try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadRecipes();
    return () => controller.abort();
  }, []);

  function getTagColor(tag: string) {
    const matchingTag = Object.keys(tagColors).find(
      (savedTag) => savedTag.toLocaleLowerCase() === tag.toLocaleLowerCase(),
    );
    return matchingTag ? tagColors[matchingTag] : defaultTagColor;
  }

  async function saveTags(recipe: Recipe, tags: string[], newTagColor?: { tag: string; color: string }) {
    setSavingRecipe(recipe.id);
    setError("");
    try {
      const response = await fetch("/api/recipes/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipe.source,
          tags: tags.filter((tag) => mealTagName(tag) === null),
          ...(newTagColor ? { colorTag: newTagColor.tag, color: newTagColor.color } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || `Tag request failed (${response.status}).`);
      }
      const result = await response.json() as { tags: string[] };
      setRecipes((current) => current.map((item) => {
        if (item.id !== recipe.id) return item;
        const mealTag = result.tags.find((tag) => mealTagName(tag) !== null);
        return {
          ...item,
          tags: result.tags.filter((tag) => mealTagName(tag) === null),
          meal: mealTagName(mealTag) ?? item.meal,
        };
      }));
      if (newTagColor) {
        setTagColors((current) => {
          const matchingTag = Object.keys(current).find(
            (savedTag) => savedTag.toLocaleLowerCase() === newTagColor.tag.toLocaleLowerCase(),
          );
          return { ...current, [matchingTag ?? newTagColor.tag]: newTagColor.color };
        });
      }
      return true;
    } catch (saveError) {
      console.error("Could not save recipe tags.", saveError);
      setError("Could not save tags. Please try again.");
      return false;
    } finally {
      setSavingRecipe(null);
    }
  }

  async function saveMeal(recipe: Recipe, meal: Recipe["meal"]) {
    setSavingRecipe(recipe.id);
    setError("");
    try {
      const recipeTags = (recipe.tags ?? []).filter((tag) => mealTagName(tag) === null);
      const response = await fetch("/api/recipes/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: recipe.source, tags: recipeTags, meal }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || `Meal request failed (${response.status}).`);
      }
      setRecipes((current) => current.map((item) =>
        item.id === recipe.id ? { ...item, tags: recipeTags, meal } : item,
      ));
      return true;
    } catch (saveError) {
      console.error("Could not save recipe meal type.", saveError);
      setError("Could not save meal type. Please try again.");
      return false;
    } finally {
      setSavingRecipe(null);
    }
  }

  async function addTag(recipe: Recipe, event: React.FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const tag = (existingTagDrafts[recipe.id] || tagDrafts[recipe.id] || "").trim();
    if (!tag) return false;
    const meal = mealTagName(tag);
    if (meal) {
      const saved = await saveMeal(recipe, meal);
      if (saved) {
        setTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
        setExistingTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
      }
      return saved;
    }
    const tags = recipe.tags ?? [];
    if (tags.some((current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
      setExistingTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
      return true;
    }
    if (tags.length >= 30) {
      setError("Each recipe can have up to 30 tags.");
      return false;
    }
    const color = existingTagDrafts[recipe.id]
      ? undefined
      : tagColorDrafts[recipe.id] ?? defaultTagColor;
    if (await saveTags(recipe, [...tags, tag], color ? { tag, color } : undefined)) {
      setTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
      setExistingTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
      setTagColorDrafts((current) => ({ ...current, [recipe.id]: defaultTagColor }));
      return true;
    }
    return false;
  }

  function removeTag(recipe: Recipe, tagToRemove: string) {
    void saveTags(recipe, (recipe.tags ?? []).filter((tag) => tag !== tagToRemove));
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="top-actions">
          <Link className="library-status library-link" href="/" aria-label="Back to recipe picker">
            <span aria-hidden="true">←</span>
            Back to picker
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="recipe-library-page" aria-labelledby="recipe-library-title">
        <div className="recipe-library-heading">
          <h1 id="recipe-library-title">All recipes</h1>
          <p>
            {loading
              ? "Loading your recipes..."
              : normalizedSearch
                ? `${filteredRecipes.length} matching ${filteredRecipes.length === 1 ? "recipe" : "recipes"}`
                : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} in your library`}
          </p>
        </div>

        <label className="search-field recipe-library-search">
          <span className="search-icon" aria-hidden="true" />
          <span className="visually-hidden">Search recipes by title</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search recipes..."
          />
        </label>

        {loadError ? (
          <p className="recipe-library-message" role="alert">{loadError}</p>
        ) : loading ? (
          <p className="recipe-library-message" role="status">Loading recipes...</p>
        ) : recipes.length ? (
          filteredRecipes.length ? (
            <div className="recipe-library-list">
              {filteredRecipes.map((recipe) => (
              <article className={`recipe-result recipe-library-card${recipe.image ? " has-image" : ""}`} key={recipe.id}>
                {recipe.image && (
                  <Image
                    className="recipe-library-image"
                    src={`/api/recipes/image?path=${encodeURIComponent(recipe.image)}`}
                    alt={recipe.title}
                    width={240}
                    height={180}
                    unoptimized
                  />
                )}
                <div className="recipe-library-card-content">
                  <div className="recipe-library-title-row">
                    <button
                      className="recipe-library-title-button"
                      type="button"
                      onClick={() => setDetailsRecipe(recipe)}
                    >
                      {recipe.title}
                    </button>
                    {recipe.meal && (
                      <span className="meal-tag">
                        {recipe.meal}
                        <button
                          type="button"
                          aria-label={`Remove ${recipe.meal} meal type from ${recipe.title}`}
                          disabled={savingRecipe !== null}
                          onClick={() => void saveMeal(recipe, null)}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="recipe-tags">
                    <div className="recipe-tag-list" aria-label={`Tags for ${recipe.title}`}>
                      {(recipe.tags ?? []).map((tag) => (
                        <span className="recipe-tag" key={tag} style={{ backgroundColor: getTagColor(tag) }}>
                          <span>{tag}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${tag} tag from ${recipe.title}`}
                            disabled={savingRecipe !== null}
                            onClick={() => removeTag(recipe, tag)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {!recipe.tags?.length && <span className="recipe-tags-empty">No tags yet</span>}
                    </div>
                    {addingTagTo === recipe.id ? (
                      <form
                        className="recipe-tag-form"
                        onSubmit={async (event) => {
                          if (await addTag(recipe, event)) setAddingTagTo(null);
                        }}
                      >
                        <label className="visually-hidden" htmlFor={`existing-tag-${recipe.id}`}>
                          Choose an existing tag for {recipe.title}
                        </label>
                        {existingTags.some((tag) => !(recipe.tags ?? []).some(
                          (current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase(),
                        )) && (
                          <select
                            id={`existing-tag-${recipe.id}`}
                            value={existingTagDrafts[recipe.id] ?? ""}
                            onChange={(event) => {
                              setExistingTagDrafts((current) => ({
                                ...current,
                                [recipe.id]: event.target.value,
                              }));
                              setTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
                              setTagColorDrafts((current) => ({
                                ...current,
                                [recipe.id]: event.target.value ? getTagColor(event.target.value) : defaultTagColor,
                              }));
                            }}
                          >
                            <option value="">Choose an existing tag</option>
                            {existingTags
                              .filter((tag) => !(recipe.tags ?? []).some(
                                (current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase(),
                              ))
                              .map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                          </select>
                        )}
                        <label className="visually-hidden" htmlFor={`tag-${recipe.id}`}>Add a tag to {recipe.title}</label>
                        <input
                          id={`tag-${recipe.id}`}
                          value={tagDrafts[recipe.id] ?? ""}
                          maxLength={40}
                          placeholder="Add a tag"
                          autoFocus
                          onChange={(event) => {
                            const wasExistingTag = Boolean(existingTagDrafts[recipe.id]);
                            setTagDrafts((current) => ({
                              ...current,
                              [recipe.id]: event.target.value,
                            }));
                            setExistingTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
                            if (wasExistingTag || !tagColorDrafts[recipe.id]) {
                              setTagColorDrafts((current) => ({ ...current, [recipe.id]: defaultTagColor }));
                            }
                          }}
                        />
                        <label className="visually-hidden" htmlFor={`tag-color-${recipe.id}`}>
                          Choose tag color
                        </label>
                        <input
                          id={`tag-color-${recipe.id}`}
                          className="recipe-tag-color"
                          type="color"
                          value={tagColorDrafts[recipe.id] ?? defaultTagColor}
                          disabled={Boolean(existingTagDrafts[recipe.id])}
                          aria-label="Choose tag color"
                          onChange={(event) => setTagColorDrafts((current) => ({
                            ...current,
                            [recipe.id]: event.target.value,
                          }))}
                        />
                        <button
                          type="submit"
                          disabled={savingRecipe !== null || !(
                            (existingTagDrafts[recipe.id] ?? "").trim()
                            || (tagDrafts[recipe.id] ?? "").trim()
                          )}
                        >
                          {savingRecipe === recipe.id ? "Saving..." : "Add"}
                        </button>
                        <button
                          type="button"
                          className="recipe-tag-cancel"
                          disabled={savingRecipe !== null}
                          onClick={() => {
                            setAddingTagTo(null);
                            setExistingTagDrafts((current) => ({ ...current, [recipe.id]: "" }));
                            setTagColorDrafts((current) => ({ ...current, [recipe.id]: defaultTagColor }));
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        className="add-recipe-tag"
                        type="button"
                        aria-label={`Add a tag to ${recipe.title}`}
                        title="Add a tag"
                        disabled={savingRecipe !== null}
                        onClick={() => setAddingTagTo(recipe.id)}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </article>
              ))}
            </div>
          ) : (
            <div className="empty-library recipe-library-empty">
              <div className="empty-mark" aria-hidden="true">⌕</div>
              <div>
                <h2>No recipes found</h2>
                <p>Try another search term.</p>
              </div>
            </div>
          )
        ) : (
          <div className="empty-library recipe-library-empty">
            <div className="empty-mark" aria-hidden="true">↘</div>
            <div>
              <h2>Your recipe box is empty</h2>
              <p>Drop HTML recipe files into the recipes folder, then reload this page.</p>
            </div>
          </div>
        )}
        {error && !loading && <p className="recipe-library-message" role="alert">{error}</p>}
      </section>

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
            aria-labelledby="library-recipe-dialog-title"
          >
            <div className="recipe-dialog-header">
              <div>
                <span className="result-label">RECIPE DETAILS</span>
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
            <h2 id="library-recipe-dialog-title">{detailsRecipe.title}</h2>
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
