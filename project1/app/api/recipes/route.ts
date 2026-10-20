import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const recipesDirectory = path.join(process.cwd(), "recipes");

  try {
    const [entries, tagsJson] = await Promise.all([
      readdir(recipesDirectory, { withFileTypes: true }),
      readFile(path.join(recipesDirectory, "tags.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "{}";
        throw error;
      }),
    ]);
    const tagsByFile = JSON.parse(tagsJson) as Record<string, unknown>;
    const storedMeals = tagsByFile._mealByFile;
    const meals = storedMeals && typeof storedMeals === "object" && !Array.isArray(storedMeals)
      ? Object.fromEntries(
        Object.entries(storedMeals)
          .filter((entry): entry is [string, "Breakfast" | "Lunch" | "Dinner"] =>
            typeof entry[1] === "string"
            && ["Breakfast", "Lunch", "Dinner"].includes(entry[1]),
          ),
      )
      : {};
    const storedTagColors = tagsByFile._tagColors;
    const tagColors = storedTagColors && typeof storedTagColors === "object" && !Array.isArray(storedTagColors)
      ? Object.fromEntries(
        Object.entries(storedTagColors)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^#[\da-f]{6}$/i.test(entry[1])),
      )
      : {};
    const recipeEntries = entries
      .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    const files = await Promise.all(recipeEntries.map(async (entry) => {
      const tags = tagsByFile[entry.name];
      return {
        name: entry.name,
        html: await readFile(path.join(recipesDirectory, entry.name), "utf8"),
        tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [],
        meal: meals[entry.name],
      };
    }));

    return NextResponse.json({ files, tagColors, meals });
  } catch (error) {
    console.error("Could not read the recipes folder.", error);
    return NextResponse.json(
      { error: "Could not read the recipes folder." },
      { status: 500 },
    );
  }
}
