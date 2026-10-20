import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A recipe filename and tags are required." }, { status: 400 });
  }

  const { name, tags, colorTag, color, meal } = body as {
    name?: unknown;
    tags?: unknown;
    colorTag?: unknown;
    color?: unknown;
    meal?: unknown;
  };
  const validMeal = meal === undefined || meal === null
    || meal === "Breakfast" || meal === "Lunch" || meal === "Dinner";
  if (
    typeof name !== "string"
    || path.basename(name) !== name
    || !/\.html?$/i.test(name)
    || !Array.isArray(tags)
    || tags.length > 30
    || tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0 || tag.trim().length > 40)
    || !validMeal
    || ((colorTag === undefined) !== (color === undefined))
    || (
      colorTag !== undefined
      && (
        typeof colorTag !== "string"
        || colorTag.trim().length === 0
        || colorTag.trim().length > 40
        || typeof color !== "string"
        || !/^#[\da-f]{6}$/i.test(color)
      )
    )
  ) {
    return NextResponse.json({ error: "Invalid recipe filename or tags." }, { status: 400 });
  }

  const recipesDirectory = path.join(process.cwd(), "recipes");
  try {
    const recipeFiles = await readdir(recipesDirectory, { withFileTypes: true });
    if (!recipeFiles.some((file) => file.isFile() && file.name === name)) {
      return NextResponse.json({ error: "Recipe file was not found." }, { status: 404 });
    }

    const tagsPath = path.join(recipesDirectory, "tags.json");
    let tagsFile: Record<string, unknown> = {};
    try {
      tagsFile = JSON.parse(await readFile(tagsPath, "utf8")) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const normalizedTags = Array.from(
      new Map((tags as string[]).map((tag) => [tag.trim().toLocaleLowerCase(), tag.trim()])).values(),
    );
    tagsFile[name] = normalizedTags;
    if (meal !== undefined) {
      const storedMeals = tagsFile._mealByFile;
      const meals = storedMeals && typeof storedMeals === "object" && !Array.isArray(storedMeals)
        ? storedMeals as Record<string, string>
        : {};
      if (meal === null) {
        delete meals[name];
      } else {
        meals[name] = meal;
      }
      tagsFile._mealByFile = meals;
    }
    if (typeof colorTag === "string" && typeof color === "string") {
      const storedColors = tagsFile._tagColors;
      const colors = storedColors && typeof storedColors === "object" && !Array.isArray(storedColors)
        ? storedColors as Record<string, string>
        : {};
      const normalizedTag = colorTag.trim();
      const existingTag = Object.keys(colors).find(
        (tag) => tag.toLocaleLowerCase() === normalizedTag.toLocaleLowerCase(),
      ) ?? normalizedTag;
      colors[existingTag] = color;
      tagsFile._tagColors = colors;
    }
    await writeFile(tagsPath, `${JSON.stringify(tagsFile, null, 2)}\n`, "utf8");

    return NextResponse.json({ name, tags: normalizedTags, meal });
  } catch (error) {
    console.error("Could not save recipe tags.", error);
    return NextResponse.json({ error: "Could not save recipe tags." }, { status: 500 });
  }
}
