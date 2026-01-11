import { Page } from "patchright";

/**
 * Comprehensive stealth scripts to avoid bot detection
 */
export async function applyStealth(page: Page): Promise<void> {
  // Inject stealth before any page navigation - using string to avoid TS errors
  // Patchright handles most stealth automatically. 
  // We keep this function structure in case we need to add specific evasions later
  // that Patchright doesn't cover.

  // Example: Add basic language/timezone overrides if needed, but for now rely on browser context settings.

  console.log("Applying additional stealth settings (minimal)...");

  await page.addInitScript(`
    // We strictly rely on Patchright for stealth now.
    // Manual overrides here were causing 'Detected' errors because they were implemented naively.
  `);
}

/**
 * Get a realistic user agent string
 */
export function getRealisticUserAgent(): string {
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
}
