export type Meal = "Breakfast" | "Lunch" | "Dinner";

export type Recipe = {
  id: string;
  title: string;
  ingredients: string[];
  instructions: string[];
  meal: Meal | null;
  source: string;
  tags?: string[];
  image?: string;
};

export type RecipeFile = {
  name: string;
  html: string;
  tags?: string[];
  meal?: Meal | null;
};

export type RecipeLibraryResponse = {
  files: RecipeFile[];
  tagColors: Record<string, string>;
  meals: Record<string, Meal>;
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function textList(value: unknown): string[] {
  if (typeof value === "string") return [cleanText(value)].filter(Boolean);
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string") return [cleanText(item)].filter(Boolean);
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return textList(record.text ?? record.name ?? record.itemListElement);
    }
    return [];
  });
}

function findStructuredRecipe(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const recipe = findStructuredRecipe(item);
      if (recipe) return recipe;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  if (types.includes("Recipe")) return record;
  return findStructuredRecipe(record["@graph"]);
}

function firstImageSource(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const source = firstImageSource(item);
      if (source) return source;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const image = value as Record<string, unknown>;
  return firstImageSource(image.url ?? image.contentUrl);
}

function sectionItems(document: Document, headingPattern: RegExp): string[] {
  const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, strong, b, dt"))
    .find((element) => headingPattern.test(cleanText(element.textContent)));
  if (!heading) return [];

  let section = heading.parentElement;
  while (section && !section.querySelector("li, p")) {
    section = section.nextElementSibling as HTMLElement | null;
  }
  return section
    ? Array.from(section.querySelectorAll("li, p"))
      .map((element) => cleanText(element.textContent))
      .filter(Boolean)
    : [];
}

export function parseRecipeHtml(html: string, fileName: string): Recipe {
  const document = new DOMParser().parseFromString(html, "text/html");
  let structured: Record<string, unknown> | null = null;

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      structured = findStructuredRecipe(JSON.parse(script.textContent ?? ""));
      if (structured) break;
    } catch {
      continue;
    }
  }

  const title = cleanText(structured?.name)
    || cleanText(document.querySelector("h1")?.textContent)
    || cleanText(document.title).replace(/\s*[|–-].*$/, "")
    || fileName.replace(/\.html?$/i, "").replace(/[_-]+/g, " ");
  const ingredientNodes = Array.from(document.querySelectorAll('[itemprop="recipeIngredient"], .ingredient'));
  const ingredients = textList(structured?.recipeIngredient).length
    ? textList(structured?.recipeIngredient)
    : ingredientNodes.map((node) => cleanText(node.textContent)).filter(Boolean);
  if (!ingredients.length) ingredients.push(...sectionItems(document, /ingredients?/i));

  const instructions = textList(structured?.recipeInstructions);
  if (!instructions.length) instructions.push(...sectionItems(document, /directions?|instructions?|method/i));

  const localImage = [
    firstImageSource(structured?.image),
    document.querySelector('img[itemprop="image"], .photo')?.getAttribute("src") ?? null,
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
  ]
    .map((source) => source?.trim().replace(/^\.\//, "") ?? "")
    .find((image) => image.startsWith("Images/") && !image.split(/[\\/]/).includes(".."));

  const categoryText = [
    ...textList(structured?.recipeCategory),
    ...textList(structured?.keywords),
    cleanText(document.querySelector('meta[property="article:section"]')?.getAttribute("content")),
    title,
    fileName,
  ].join(" ");
  const meal: Meal | null = /\b(breakfast|brunch)\b/i.test(categoryText)
    ? "Breakfast"
    : /\blunch\b/i.test(categoryText)
      ? "Lunch"
      : /\b(dinner|supper)\b/i.test(categoryText)
        ? "Dinner"
        : null;

  return {
    id: `${fileName}:${title}`,
    title,
    ingredients: Array.from(new Set(ingredients)),
    instructions,
    meal,
    source: fileName,
    image: localImage,
  };
}
