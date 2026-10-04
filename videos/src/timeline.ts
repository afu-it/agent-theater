import type { Scene } from "../../plugins/agent-theater/types";

// The music: "upbeat energetic chiptune, playful sandbox building theme",
// measured at 125 BPM by scripts/beats.py. One bar = 4 beats = 1.92s.
export const BEAT = 0.48;
export const BAR = BEAT * 4;
// The film starts at the music's bar 1, so the drums (bar 3) land on the title.
export const MUSIC_OFFSET = 3.8384;

export const FPS = 30;

// Seconds on the film's own clock.
export const T = {
  hook: 0,
  title: 2 * BAR, // 3.84, the drums come in
  scenes: 4 * BAR, // 7.68
  sceneLength: 1.5 * BAR, // 2.88 each
  offTrack: 4 * BAR + 7 * 1.5 * BAR, // 27.84
  cta: 4 * BAR + 7 * 1.5 * BAR + 2 * BAR, // 31.68
  end: 21 * BAR, // 40.32
};

export const DURATION = T.end;

export type Beat = {
  scene: Partial<Scene> & Pick<Scene, "action">;
  caption: string;
  // The transcript line Claude Code would print for this step.
  log: string;
  sfx: string;
  sfxAt?: number;
};

export const BEATS: Beat[] = [
  { scene: { action: "think", line: "Coffee first." }, caption: "Thinks it through", log: "✻ Thinking…", sfx: "whoosh" },
  {
    scene: { action: "read", target: "src/auth/login.ts", line: "Read, then touch." },
    caption: "Reads your code",
    log: "● Read(src/auth/login.ts)",
    sfx: "page",
    sfxAt: 0.9,
  },
  {
    scene: { action: "edit", target: "src/auth/login.ts", line: "Small fix only." },
    caption: "Makes the edit",
    log: "● Update(src/auth/login.ts)",
    sfx: "typing",
  },
  { scene: { action: "test", target: "npm test", line: "Let the suite talk." }, caption: "Runs your tests", log: "● Bash(npm test)", sfx: "thump", sfxAt: 0.25 },
  {
    scene: { action: "error", target: "npm test", detail: "TypeError: user is undefined", line: "Classic: null user." },
    caption: "Hits an error",
    log: "  ⎿ TypeError: user is undefined",
    sfx: "error",
  },
  { scene: { action: "run", target: "git diff --stat", line: "See what changed." }, caption: "Runs commands", log: "● Bash(git diff --stat)", sfx: "enter" },
  { scene: { action: "ok", line: "Green. Coffee time.", isDone: true }, caption: "Gets it done", log: "● The login test passes now.", sfx: "success" },
];

export const OFF_TRACK: Beat = {
  scene: { action: "read", target: "recipe.md", line: "Off the ticket.", isOffTrack: true },
  caption: "Drifts off task?",
  log: "● Read(recipes/nasi-lemak.md)",
  sfx: "error",
};

export const PROMPT = "fix the failing login test";
