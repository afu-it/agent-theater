import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { CHIP } from "../../plugins/agent-theater/hooks/stage";
import type { PaintOptions } from "../../plugins/agent-theater/hooks/stage";
import { Theater } from "./Theater";
import { BEATS, type Beat, DURATION, MUSIC_OFFSET, OFF_TRACK, PROMPT, T } from "./timeline";
import { color, geist, mono } from "./tokens";

export type Layout = "wide" | "tall";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// Sizes per layout: the wide film for GitHub, the tall one for Threads.
const SIZE = {
  wide: { window: 1560, cell: 23, screen: 40, log: 26, caption: 88, sub: 32, chip: 24, captionTop: 52, windowTop: 330 },
  tall: { window: 1020, cell: 21, screen: 25, log: 26, caption: 108, sub: 40, chip: 30, captionTop: 250, windowTop: 790 },
};

type Phase =
  | { kind: "hook" }
  | { kind: "title"; local: number }
  | { kind: "beat"; index: number; beat: Beat; local: number }
  | { kind: "offTrack"; local: number }
  | { kind: "cta"; local: number };

function phaseAt(t: number): Phase {
  if (t < T.title) return { kind: "hook" };
  if (t < T.scenes) return { kind: "title", local: t - T.title };
  if (t < T.offTrack) {
    const index = Math.min(BEATS.length - 1, Math.floor((t - T.scenes) / T.sceneLength));
    return { kind: "beat", index, beat: BEATS[index]!, local: t - T.scenes - index * T.sceneLength };
  }
  if (t < T.cta) return { kind: "offTrack", local: t - T.offTrack };
  return { kind: "cta", local: t - T.cta };
}

const CTA_STEPS = [
  { at: 0.3, command: "/plugin marketplace add afu-it/agent-theater", result: "✓ Added marketplace agent-theater" },
  { at: 2.5, command: "/plugin install agent-theater@agent-theater", result: "✓ Installed agent-theater" },
  { at: 4.7, command: "/theater demo", result: "" },
];
const TYPE_RATE = 34; // characters a second

export function Film({ layout }: { layout: Layout }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const s = SIZE[layout];
  const phase = phaseAt(t);

  // What the theater shows, and the log above it.
  let scene: Beat["scene"] = { action: "idle" };
  let local = 0;
  let logs: string[] = [];
  let options: PaintOptions = { screenWidth: s.screen };
  if (phase.kind === "title") {
    scene = { action: "idle", line: "Watch me work." };
    local = phase.local;
  } else if (phase.kind === "beat") {
    scene = phase.beat.scene;
    local = phase.local;
    logs = BEATS.slice(0, phase.index + 1).map((b) => b.log);
  } else if (phase.kind === "offTrack") {
    scene = OFF_TRACK.scene;
    local = phase.local;
    logs = [...BEATS.map((b) => b.log), OFF_TRACK.log];
  } else if (phase.kind === "cta") {
    scene = { ...BEATS[BEATS.length - 1]!.scene, line: "Your turn." };
    local = phase.local + 10;
  }
  const tick = Math.floor(local / 0.125);
  const steps = phase.kind === "beat" ? phase.index + 1 : phase.kind === "offTrack" ? 8 : phase.kind === "cta" ? 8 : 0;
  options = {
    ...options,
    revealed: tick * 3,
    sinceChange: tick,
    isIdea: phase.kind === "beat" && phase.index === 1 && local < 2,
    isFlashOn: scene.action !== "ok" || tick >= 24 || Math.floor(tick / 2) % 2 === 0,
    isCelebrating: scene.action === "ok" && tick < 24,
    status: steps ? `${steps} steps, ${Math.round(steps * 3.4)}s` : "",
  };

  // Entrances.
  const windowIn = spring({ frame, fps, config: { damping: 18, mass: 0.8 } });
  const theaterIn = spring({ frame: frame - T.title * fps, fps, config: { damping: 14, mass: 0.7 } });
  const sceneStart =
    phase.kind === "beat" ? T.scenes + phase.index * T.sceneLength : phase.kind === "offTrack" ? T.offTrack : phase.kind === "title" ? T.title : -10;
  const punch = 1 + 0.035 * Math.exp(-((t - sceneStart) * 9)) * (t >= sceneStart ? 1 : 0);
  const end = interpolate(t, [DURATION - 0.6, DURATION], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: color.page, fontFamily: geist, opacity: end }}>
      <Glow layout={layout} action={phase.kind === "hook" ? null : scene.action} />
      <Caption layout={layout} phase={phase} t={t} fps={fps} />
      <div
        style={{
          position: "absolute",
          left: (width - s.window) / 2,
          top: s.windowTop,
          width: s.window,
          transform: `translateY(${(1 - windowIn) * 80}px)`,
          opacity: windowIn,
        }}
      >
        <TerminalWindow layout={layout} phase={phase} logs={logs} t={t}>
          {phase.kind !== "hook" && (
            <div style={{ display: "flex", justifyContent: "center", transform: `scale(${theaterIn * punch})`, transformOrigin: "center bottom", opacity: theaterIn }}>
              <Theater scene={scene} tick={tick} options={options} cell={s.cell} />
            </div>
          )}
        </TerminalWindow>
      </div>
      {layout === "tall" && <Footer t={t} fps={fps} />}
      {phase.kind === "beat" && phase.beat.scene.action === "ok" && <Confetti layout={layout} local={local} width={width} height={height} />}
      <Sound />
    </AbsoluteFill>
  );
}

function Glow({ layout, action }: { layout: Layout; action: Beat["scene"]["action"] | null }) {
  const tint = action ? hex(CHIP[action].color) : color.claude;
  const y = layout === "wide" ? "62%" : "52%";
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 45% at 50% ${y}, ${tint}22, transparent 70%)`,
        transition: "none",
      }}
    />
  );
}

function Caption({ layout, phase, t, fps }: { layout: Layout; phase: Phase; t: number; fps: number }) {
  const s = SIZE[layout];
  let chip: { label: string; color: string } | null = null;
  let title = "";
  let sub = "";
  let start = 0;
  let titleColor = color.text;
  let titleFont = geist;
  if (phase.kind === "hook") {
    const second = t >= 1.92;
    title = second ? "But what is it doing?" : "Your agent is busy.";
    start = second ? 1.92 : 0.15;
  } else if (phase.kind === "title") {
    title = "agent-theater";
    sub = "A pixel theater for Claude Code, narrated live by Haiku.";
    start = T.title;
    titleColor = color.claude;
    titleFont = mono;
  } else if (phase.kind === "beat") {
    const c = CHIP[phase.beat.scene.action];
    chip = { label: c.label, color: hex(c.color) };
    title = phase.beat.caption;
    start = T.scenes + phase.index * T.sceneLength;
  } else if (phase.kind === "offTrack") {
    chip = { label: "OFF TRACK", color: color.yellow };
    title = "Drifts off task?";
    sub = "The monitor turns yellow and tells you.";
    start = T.offTrack;
  } else {
    title = "Install in one minute";
    sub = "github.com/afu-it/agent-theater";
    start = T.cta;
  }
  const local = (t - start) * fps;
  const enter = spring({ frame: local, fps, config: { damping: 16, mass: 0.6 } });
  const subEnter = spring({ frame: local - 5, fps, config: { damping: 16, mass: 0.6 } });
  return (
    <div
      style={{
        position: "absolute",
        top: s.captionTop,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: layout === "wide" ? 14 : 22,
        padding: "0 60px",
        textAlign: "center",
      }}
    >
      <div style={{ height: s.chip * 1.9, display: "flex", alignItems: "center" }}>
        {chip && (
          <div
            style={{
              fontFamily: mono,
              fontSize: s.chip,
              fontWeight: 700,
              letterSpacing: 3,
              color: chip.color,
              border: `2px solid ${chip.color}66`,
              background: `${chip.color}18`,
              borderRadius: 999,
              padding: "6px 20px",
              opacity: enter,
              transform: `translateY(${(1 - enter) * 16}px)`,
            }}
          >
            {chip.label}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: titleFont,
          fontSize: s.caption,
          fontWeight: 800,
          letterSpacing: titleFont === mono ? -2 : -3,
          lineHeight: 1.02,
          color: titleColor,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: s.sub,
          fontWeight: 500,
          color: phase.kind === "cta" ? color.claude : color.muted,
          fontFamily: phase.kind === "cta" ? mono : geist,
          opacity: sub ? subEnter : 0,
          transform: `translateY(${(1 - subEnter) * 20}px)`,
          maxWidth: layout === "wide" ? 1400 : 900,
          minHeight: s.sub * 1.3,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function TerminalWindow({ layout, phase, logs, t, children }: { layout: Layout; phase: Phase; logs: string[]; t: number; children: React.ReactNode }) {
  const s = SIZE[layout];
  const lines: { text: string; color: string }[] = [{ text: `> ${PROMPT}`, color: color.muted }];
  if (phase.kind === "hook") lines.push({ text: `✻ Working… (${Math.floor(t * 4) + 12}s)`, color: color.claude });
  for (const log of logs) lines.push({ text: log, color: log.startsWith("  ⎿") ? color.red : log.startsWith("✻") ? color.claude : color.text });

  // The prompt box: empty with a cursor, or a command typing out in the CTA.
  let typed = "";
  if (phase.kind === "cta") {
    for (const step of CTA_STEPS) {
      const elapsed = phase.local - step.at;
      if (elapsed < 0) break;
      const shown = Math.floor(elapsed * TYPE_RATE);
      if (shown < step.command.length + 10) typed = step.command.slice(0, shown);
      else {
        lines.push({ text: `> ${step.command}`, color: color.muted });
        if (step.result) lines.push({ text: `  ${step.result}`, color: color.green });
        typed = "";
      }
    }
  }
  const visible = lines.slice(layout === "wide" ? -5 : -6);
  const cursorOn = Math.floor(t * 2) % 2 === 0;

  return (
    <div
      style={{
        background: color.window,
        border: `1.5px solid ${color.line}`,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 40px 120px -30px #000000cc, 0 0 0 1px #ffffff08 inset",
      }}
    >
      <div style={{ height: 52, background: color.chrome, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: `1px solid ${color.line}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 15, height: 15, borderRadius: 99, background: c }} />
        ))}
        <div style={{ flex: 1, textAlign: "center", fontFamily: mono, fontSize: 20, color: color.muted, marginRight: 70 }}>claude · ~/my-app</div>
      </div>
      <div style={{ padding: layout === "wide" ? "26px 34px 24px" : "24px 26px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: mono, fontSize: s.log, lineHeight: 1.5, minHeight: s.log * 1.5 * (layout === "wide" ? 5 : 6) }}>
          {visible.map((line, i) => (
            <div key={i} style={{ color: line.color, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
              {line.text.startsWith("●") ? (
                <>
                  <span style={{ color: color.green }}>●</span>
                  {line.text.slice(1)}
                </>
              ) : (
                line.text
              )}
            </div>
          ))}
        </div>
        {children}
        <div
          style={{
            border: `1.5px solid ${color.line}`,
            borderRadius: 12,
            padding: "14px 18px",
            fontFamily: mono,
            fontSize: s.log,
            color: color.text,
            whiteSpace: "pre",
            overflow: "hidden",
          }}
        >
          <span style={{ color: color.muted }}>{"> "}</span>
          {typed}
          <span style={{ background: cursorOn ? color.text : "transparent", color: color.window }}>{" "}</span>
        </div>
      </div>
    </div>
  );
}

// The tall film has room under the window: where to get it, always on screen.
function Footer({ t, fps }: { t: number; fps: number }) {
  const enter = spring({ frame: (t - T.title) * fps, fps, config: { damping: 18 } });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 150,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 34, color: color.claude, fontWeight: 700 }}>agent-theater</div>
      <div style={{ fontFamily: geist, fontSize: 28, color: color.muted }}>A free Claude Code mod · github.com/afu-it/agent-theater</div>
    </div>
  );
}

// A burst over the whole frame when the turn is done.
function Confetti({ layout, local, width, height }: { layout: Layout; local: number; width: number; height: number }) {
  const colors = [color.claude, color.yellow, color.green, color.blue, "#bc8cff", "#ffffff"];
  const originY = layout === "wide" ? height * 0.62 : height * 0.55;
  const pieces = Array.from({ length: 70 }, (_, i) => {
    const angle = ((i * 137.5) % 360) * (Math.PI / 180);
    const speed = 700 + ((i * 53) % 600);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 900;
    const x = width / 2 + vx * local;
    const y = originY + vy * local + 1400 * local * local;
    const size = 10 + (i % 4) * 4;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: size,
          height: size * 0.6,
          background: colors[i % colors.length],
          transform: `rotate(${local * (300 + i * 20)}deg)`,
          opacity: interpolate(local, [0, 1.8, 2.6], [1, 1, 0], { extrapolateRight: "clamp" }),
        }}
      />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{pieces}</AbsoluteFill>;
}

function Sound() {
  const { fps } = useVideoConfig();
  const at = (seconds: number) => Math.round(seconds * fps);
  const effects: { file: string; at: number; volume?: number }[] = [
    { file: "whoosh", at: T.title - 0.1, volume: 0.7 },
    ...BEATS.map((b, i) => ({ file: b.sfx, at: T.scenes + i * T.sceneLength + (b.sfxAt ?? 0.05) })),
    { file: "idea", at: T.scenes + T.sceneLength + 0.05, volume: 0.7 },
    { file: OFF_TRACK.sfx, at: T.offTrack + 0.1, volume: 0.5 },
    ...CTA_STEPS.map((step) => ({ file: "typing", at: T.cta + step.at, volume: 0.45 })),
  ];
  return (
    <>
      <Audio
        src={staticFile("bgm/chiptune.wav")}
        trimBefore={at(MUSIC_OFFSET)}
        volume={(f) =>
          0.42 * interpolate(f / fps, [0, 0.4, DURATION - 1.6, DURATION], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        }
      />
      {effects.map((e, i) => (
        <Sequence key={i} from={at(e.at)} durationInFrames={at(2.5)}>
          <Audio src={staticFile(`sfx/${e.file}.mp3`)} volume={(e.volume ?? 0.8) * 0.6} />
        </Sequence>
      ))}
    </>
  );
}

