import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const imageTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(request: Request) {
  const imagePath = new URL(request.url).searchParams.get("path");
  if (!imagePath || path.isAbsolute(imagePath) || imagePath.split(/[\\/]/).includes("..")) {
    return new NextResponse("Invalid recipe image path.", { status: 400 });
  }

  const recipesDirectory = path.resolve(process.cwd(), "recipes");
  const imagesDirectory = path.join(recipesDirectory, "Images");
  const resolvedImagePath = path.resolve(recipesDirectory, imagePath);
  const relativeImagePath = path.relative(imagesDirectory, resolvedImagePath);
  if (
    !relativeImagePath
    || relativeImagePath.startsWith("..")
    || path.isAbsolute(relativeImagePath)
    || !imageTypes[path.extname(resolvedImagePath).toLowerCase()]
  ) {
    return new NextResponse("Invalid recipe image path.", { status: 400 });
  }

  try {
    const [realImagesDirectory, realImagePath] = await Promise.all([
      realpath(imagesDirectory),
      realpath(resolvedImagePath),
    ]);
    const realRelativePath = path.relative(realImagesDirectory, realImagePath);
    if (!realRelativePath || realRelativePath.startsWith("..") || path.isAbsolute(realRelativePath)) {
      return new NextResponse("Recipe image not found.", { status: 404 });
    }

    const imageStat = await stat(realImagePath);
    if (!imageStat.isFile()) return new NextResponse("Recipe image not found.", { status: 404 });

    const image = await readFile(realImagePath);
    return new NextResponse(image, {
      headers: {
        "Content-Type": imageTypes[path.extname(realImagePath).toLowerCase()],
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Could not read recipe image.", error);
      return new NextResponse("Could not load recipe image.", { status: 500 });
    }
    return new NextResponse("Recipe image not found.", { status: 404 });
  }
}
