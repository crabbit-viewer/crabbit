import * as fs from "fs";
import * as path from "path";

export function favoritesPath(appDataDir: string): string {
  return path.join(appDataDir, "favorites.json");
}

export function readFavorites(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export function writeFavorites(filePath: string, favorites: string[]): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(favorites, null, 2));
}
