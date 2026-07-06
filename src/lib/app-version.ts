import packageJson from "../../package.json";

/** Angezeigte App-Version (aus package.json). */
export const APP_VERSION = packageJson.version;

export function formatAppVersionLabel(version: string = APP_VERSION): string {
  return `Version ${version}`;
}
