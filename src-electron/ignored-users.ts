import * as fs from "fs";
import * as path from "path";

export function ignoredUsersPath(appDataDir: string): string {
  return path.join(appDataDir, "ignored-users.json");
}

export function readIgnoredUsers(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export function writeIgnoredUsers(filePath: string, users: string[]): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
}
