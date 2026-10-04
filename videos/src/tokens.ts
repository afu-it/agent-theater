import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: geist } = loadGeist("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
export const { fontFamily: mono } = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

// Colors from the mod itself (hooks/stage.ts INK, PALETTE) on a GitHub-dark page.
export const color = {
  page: "#0b0e14",
  window: "#0d1117",
  chrome: "#161b22",
  line: "#30363d",
  text: "#e6edf3",
  muted: "#8b949e",
  claude: "#d97757",
  yellow: "#e3b341",
  green: "#3fb950",
  red: "#f85149",
  blue: "#58a6ff",
};
