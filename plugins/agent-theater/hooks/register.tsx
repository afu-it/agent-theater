import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Action, Scene } from '../types'
import {
  EMPTY_SCENE,
  INK,
  ROWS,
  SYSTEM,
  classify,
  clipWords,
  columnsFor,
  hex,
  paint,
  parseReply,
  screenLines,
  screenWidthFor,
  stepPrompt,
  summaryPrompt,
  targetOf,
} from './stage'

const sceneAtom = atom({ plugin: 'agent-theater', key: 'scene' } as const, null)
const isOnAtom = atom({ plugin: 'agent-theater', key: 'isOn' } as const, true)
const requestAtom = atom({ plugin: 'agent-theater', key: 'request' } as const, '')
const stepsAtom = atom({ plugin: 'agent-theater', key: 'steps' } as const, [])

const FRAME_MS = 125
const NARRATE_TICK_MS = 500
// At most one narration every NARRATE_GAP_TICKS * NARRATE_TICK_MS (4s).
const NARRATE_GAP_TICKS = 8
const OK_FLASH_FRAMES = 24
// The light bulb shows this many frames after thinking ends.
const IDEA_FRAMES = 16

// `/theater demo` plays every scene in turn, DEMO_FRAMES frames (3s) each.
const DEMO_FRAMES = 24
// The narration types out this many characters per frame (24 a second).
const TYPE_SPEED = 3
const DEMO: ReadonlyArray<Partial<Scene> & { action: Action }> = [
  { action: 'think', line: 'Kopi dulu. Faham masalah sebelum sentuh kod.' },
  { action: 'read', target: 'worker/index.ts', line: 'Baca worker/index.ts dulu, faham router sebelum ubah.' },
  { action: 'edit', target: 'src/App.tsx', line: 'Edit src/App.tsx: ubah sikit, jangan rewrite.' },
  { action: 'test', target: 'npm test', line: 'npm test. Biar suite yang cakap, bukan perasaan.' },
  { action: 'run', target: 'git status', line: 'git status: tengok apa yang betul-betul berubah.' },
  { action: 'error', target: 'npm test', detail: 'TypeError: x is undefined', line: 'TypeError lagi. Klasik: undefined masuk dari API.' },
  { action: 'read', target: 'resipi-nasi-lemak.md', line: 'Baca resipi nasi lemak? Ini dah lari dari tiket.', isOffTrack: true },
  { action: 'ok', line: 'Test hijau. Baru layak minum kopi.', isDone: true },
]

type Job =
  | { kind: 'step'; action: Action; tool: string; target: string; failure: string }
  | { kind: 'summary'; answer: string; isAborted: boolean }

// Animation and narration bookkeeping. A reload re-runs this module and resets
// these, which costs at most one skipped frame or narration; what the band
// draws lives in $.state.
const live = {
  frame: 0,
  flashUntil: 0,
  isWorking: false,
  bandId: undefined as string | undefined,
  scene: null as Scene | null,
  isOn: true,
  pending: null as Job | null,
  lastStepKey: '',
  isNarrating: false,
  ticksSinceNarration: NARRATE_GAP_TICKS,
  demo: null as number | null,
  demoFrames: 0,
  ideaUntil: 0,
  lineFrame: 0,
  changeFrame: 0,
  steps: 0,
  turnFrame: 0,
  doneSeconds: null as number | null,
  screenWidth: screenWidthFor(0),
}

const isFlashOn = () => live.frame >= live.flashUntil || Math.floor(live.frame / 2) % 2 === 0

const revealed = () => (live.frame - live.lineFrame) * TYPE_SPEED

const isTyping = (scene: Scene) => revealed() < scene.line.length

function status(): string {
  if (live.demo !== null) return `demo ${live.demo + 1}/${DEMO.length}`
  if (live.steps === 0 && live.doneSeconds === null) return ''
  const seconds = live.doneSeconds ?? Math.round(((live.frame - live.turnFrame) * FRAME_MS) / 1000)
  return `${live.steps} ${live.steps === 1 ? 'step' : 'steps'}, ${seconds}s`
}

const paintNow = (scene: Scene) =>
  paint(scene, live.frame, {
    isFlashOn: isFlashOn(),
    isIdea: live.frame < live.ideaUntil,
    screenWidth: live.screenWidth,
    revealed: revealed(),
    status: status(),
    sinceChange: live.frame - live.changeFrame,
    isCelebrating: live.frame < live.flashUntil,
  })

async function setScene($: EngineInterface, patch: Partial<Scene>): Promise<void> {
  // Done thinking: the thought bubble turns into a light bulb for a moment.
  if (live.scene?.action === 'think' && patch.action !== undefined && patch.action !== 'think') {
    live.ideaUntil = live.frame + IDEA_FRAMES
  }
  if (patch.action !== undefined && patch.action !== live.scene?.action) live.changeFrame = live.frame
  // New narration types itself out from here.
  if (patch.line !== undefined && patch.line !== live.scene?.line) live.lineFrame = live.frame
  const next = { ...(live.scene ?? EMPTY_SCENE), ...patch }
  live.scene = next
  await update($, sceneAtom, () => next)
}

async function showDemo($: EngineInterface, index: number): Promise<void> {
  const step = DEMO[index]
  if (!step) return
  if (step.action === 'ok') live.flashUntil = live.frame + OK_FLASH_FRAMES
  await setScene($, { target: '', detail: '', isOffTrack: false, isDone: false, ...step })
}

function queueStep(job: Extract<Job, { kind: 'step' }>): void {
  const key = `${job.action}:${job.target}`
  if (key === live.lastStepKey && !job.failure) return
  live.lastStepKey = key
  // A pending summary outranks any step that arrives after it.
  if (live.pending?.kind !== 'summary') live.pending = job
}

async function narrate($: EngineInterface, job: Job): Promise<void> {
  const request = await read($, requestAtom)
  const steps = await read($, stepsAtom)
  const prompt =
    job.kind === 'step'
      ? stepPrompt({ request, steps, tool: job.tool, target: job.target, action: job.action, failure: job.failure })
      : summaryPrompt({ request, steps, answer: job.answer, isAborted: job.isAborted })
  const reply = await $.model.complete({
    model: 'haiku',
    system: SYSTEM,
    prompt,
    maxTokens: 160,
    effort: 'low',
    timeoutMs: 10_000,
  })
  if (!reply.isAnswered || !live.isOn) return
  const parsed = parseReply(reply.text)
  if (!parsed) return
  // A step narration that lands after the turn ended must not cover the summary.
  if (job.kind === 'step' && live.scene?.isDone) return
  await setScene($, {
    line: clipWords(parsed.line, job.kind === 'step' ? 12 : 16),
    isOffTrack: job.kind === 'step' && !parsed.fits,
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'theater',
      description: 'Turn the agent theater on or off',
      argumentHint: '[on|off|demo]',
      immediate: true,
    })
    const stored = await $.store.get('isOn')
    if (typeof stored === 'boolean') await update($, isOnAtom, () => stored)
    live.scene = await read($, sceneAtom)
    live.isOn = await read($, isOnAtom)

    $.clock.every(FRAME_MS, () => {
      const scene = live.scene
      if (!live.isOn || !scene || live.bandId === undefined) return
      if (live.demo !== null) {
        live.demoFrames += 1
        if (live.demoFrames >= DEMO_FRAMES) {
          live.demoFrames = 0
          live.demo = live.demo + 1 < DEMO.length ? live.demo + 1 : null
          if (live.demo !== null) void showDemo($, live.demo)
        }
      }
      const isFlashing = (scene.action === 'ok' && live.frame <= live.flashUntil) || live.frame <= live.ideaUntil
      if (!live.isWorking && !isFlashing && !isTyping(scene) && live.demo === null) return
      live.frame += 1
      void $.ui.blit({ requestId: live.bandId, key: 'stage', cells: paintNow(scene) })
    })

    $.clock.every(NARRATE_TICK_MS, () => {
      live.ticksSinceNarration += 1
      if (!live.pending || live.isNarrating || !live.isOn) return
      if (live.pending.kind === 'step' && live.ticksSinceNarration < NARRATE_GAP_TICKS) return
      const job = live.pending
      live.pending = null
      live.isNarrating = true
      live.ticksSinceNarration = 0
      void narrate($, job).finally(() => {
        live.isNarrating = false
      })
    })

    return next(e)
  })

  on('command.run', { command: 'theater' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'demo') {
      live.isOn = true
      live.pending = null
      live.demo = 0
      live.demoFrames = 0
      await update($, isOnAtom, () => true)
      await showDemo($, 0)
      return { text: `Agent theater demo: ${DEMO.length} scenes, 3s each.` }
    }
    const isOn = arg === 'on' ? true : arg === 'off' ? false : !(await read($, isOnAtom))
    live.isOn = isOn
    await update($, isOnAtom, () => isOn)
    await $.store.set('isOn', isOn)
    return { text: isOn ? 'Agent theater is on.' : 'Agent theater is off.' }
  })

  on('turn.start', async ($, e, next) => {
    if (live.isOn) {
      live.isWorking = true
      live.pending = null
      live.lastStepKey = ''
      live.steps = 0
      live.turnFrame = live.frame
      live.doneSeconds = null
      if (e.text.trim()) await update($, requestAtom, () => e.text.slice(0, 800))
      await update($, stepsAtom, () => [])
      await setScene($, { action: 'think', target: '', detail: '', line: '...', isOffTrack: false, isDone: false })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // Subagents run their own loops; the theater follows the main one.
    if (e.agentId !== undefined || !live.isOn) return next(e)

    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)
    const action = classify(tool, input)
    const target = targetOf(input)
    live.steps += 1
    await setScene($, { action, target, detail: '', isDone: false })

    const ran = await next(e)

    const hasFailed = ran.deny !== undefined || ran.isError === true
    const failure = hasFailed ? (ran.deny ?? ran.text ?? '').slice(0, 600) : ''
    if (hasFailed) await setScene($, { action: 'error', detail: failure.split('\n')[0] ?? '' })
    await update($, stepsAtom, steps =>
      [...steps, `${tool} ${target}${hasFailed ? ' (failed)' : ''}`].slice(-30),
    )
    queueStep({ kind: 'step', action: hasFailed ? 'error' : action, tool, target, failure })

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && live.isOn) {
      live.isWorking = false
      live.doneSeconds = Math.round(e.durationMs / 1000)
      live.flashUntil = live.frame + OK_FLASH_FRAMES
      live.pending = { kind: 'summary', answer: e.answer.slice(0, 1500), isAborted: e.isAborted }
      await setScene($, { action: 'ok', target: '', detail: '', isOffTrack: false, isDone: true })
    }
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const isOn = await read($, isOnAtom)
    const scene = await read($, sceneAtom)
    if (!isOn || scene === null || e.props.hasSurvey) return next(e)

    live.bandId = e.requestId
    live.screenWidth = screenWidthFor(e.props.bodyColumns)

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      return <Raster key="stage" columns={columnsFor(live.screenWidth)} rows={ROWS} cells={paintNow(scene)} />
    }

    // Surfaces without a Raster get the monitor's text alone.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="monitor" flexDirection="column" borderStyle="round" borderColor={hex(scene.isOffTrack ? INK.offTrack : INK.frame)} paddingX={1}>
        {screenLines(scene, live.frame, isFlashOn()).map(line => (
          <Text color={hex(line.color)}>{line.text || ' '}</Text>
        ))}
      </Box>
    )
  })
}
