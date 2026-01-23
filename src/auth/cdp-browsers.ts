/**
 * CDP Browser Registry - supported browsers and their paths per OS
 */

export type BrowserId = "chrome" | "edge" | "brave";

export interface BrowserDescriptor {
  id: BrowserId;
  displayName: string;
  platformPaths: {
    darwin: string[];
    win32: string[];
    linux: string[];
  };
  // Executable names to search in PATH
  pathNames: string[];
}

export const BROWSER_REGISTRY: Record<BrowserId, BrowserDescriptor> = {
  chrome: {
    id: "chrome",
    displayName: "Google Chrome",
    platformPaths: {
      darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
      win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ],
      linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
    },
    pathNames: ["google-chrome", "google-chrome-stable", "chrome"],
  },
  edge: {
    id: "edge",
    displayName: "Microsoft Edge",
    platformPaths: {
      darwin: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
      win32: [
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ],
      linux: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"],
    },
    pathNames: ["microsoft-edge", "microsoft-edge-stable", "msedge"],
  },
  brave: {
    id: "brave",
    displayName: "Brave Browser",
    platformPaths: {
      darwin: ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
      win32: [
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      ],
      linux: ["/usr/bin/brave-browser", "/usr/bin/brave"],
    },
    pathNames: ["brave-browser", "brave"],
  },
};

export const DEFAULT_BROWSER_PREFERENCE: BrowserId[] = ["chrome", "edge", "brave"];
