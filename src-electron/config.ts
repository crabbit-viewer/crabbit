import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ConfigData {
  save_path?: string;
  sort?: string;
  time_range?: string;
}

export function configPath(appDataDir: string): string {
  return path.join(appDataDir, "config.json");
}

export function readConfig(filePath: string): ConfigData {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function writeConfig(filePath: string, config: ConfigData): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

export function resolveSavePath(config: ConfigData, appDataDir: string): string {
  if (config.save_path) return config.save_path;

  // Try platform pictures directory
  const home = os.homedir();
  const platform = process.platform;
  if (platform === "linux") {
    // Check XDG
    const xdgPictures = process.env.XDG_PICTURES_DIR;
    if (xdgPictures) return path.join(xdgPictures, "Crabbit");
    return path.join(home, "Pictures", "Crabbit");
  } else if (platform === "darwin") {
    return path.join(home, "Pictures", "Crabbit");
  } else if (platform === "win32") {
    return path.join(home, "Pictures", "Crabbit");
  }

  return path.join(appDataDir, "saved");
}
