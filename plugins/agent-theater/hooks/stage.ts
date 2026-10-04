import type { Action, Scene } from '../types'

// One Raster, ROWS cells tall. The left PIXEL_COLUMNS cells are pixel art
// (two pixels per cell, stacked with half blocks); after a gap comes the
// monitor, drawn with real characters: a command, an animation, narration.
export const ROWS = 6
const PIXEL_COLUMNS = 18
const PIXEL_ROWS = ROWS * 2
const GAP = 1
const MIN_SCREEN = 26
const MAX_SCREEN = 72

export const columnsFor = (screenWidth: number) => PIXEL_COLUMNS + GAP + screenWidth + 2

export const screenWidthFor = (bodyColumns: number) =>
  Math.max(MIN_SCREEN, Math.min(MAX_SCREEN, bodyColumns - PIXEL_COLUMNS - GAP - 2))

const TERMINAL_DEFAULT = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584

const PALETTE: Record<string, number> = {
  O: 0xd97757, // Claude
  U: 0x6a9bcc, // confetti
  K: 0x2b1a12, // eyes, thinking dots
  W: 0xf2efe6, // thought bubble, the turning page, mug
  p: 0xcfc8b8, // the book's resting pages
  w: 0x6b7280, // steam, speed lines
  D: 0x8b5a2b, // desk
  r: 0xa23b2a, // book cover
  k: 0x9ca3af, // keyboard, bulb base
  Y: 0xffd75e, // lit keys, the bulb, sparks
  S: 0x5fa8ff, // a drop of sweat
  F: 0xe5533d, // Claude, flushed with frustration
  A: 0xf85149, // the anger mark
}

export const INK = {
  frame: 0x6b7280,
  offTrack: 0xe3b341,
  screen: 0x0d1117,
  sweep: 0x1f2937,
  alarm: 0xb62324,
  text: 0xc9d1d9,
  white: 0xffffff,
  prompt: 0x3fb950,
  code: 0x58a6ff,
  comment: 0x8b949e,
  error: 0xf85149,
  cursor: 0xffd75e,
}

type Canvas = number[][]

const blank = (): Canvas =>
  Array.from({ length: PIXEL_ROWS }, () => new Array<number>(PIXEL_COLUMNS).fill(0))

// The art is drawn on a 10-pixel-high stage; the pixel area is taller to
// match the monitor, so everything sits LIFT pixels lower, on the desk.
const LIFT = PIXEL_ROWS - 10

function stamp(canvas: Canvas, x: number, y: number, rows: readonly string[]): void {
  rows.forEach((row, dy) => {
    ;[...row].forEach((glyph, dx) => {
      const color = PALETTE[glyph]
      const line = canvas[y + dy + LIFT]
      if (color === undefined || line === undefined) return
      if (x + dx >= 0 && x + dx < PIXEL_COLUMNS) line[x + dx] = color
    })
  })
}

// Claude stands at (GUY_X, GUY_Y), behind the desk on the bottom row.
const GUY_X = 8
const GUY_Y = 4

function guy(
  canvas: Canvas,
  x: number,
  { isBlinking = false, isAngry = false, look = 0, tint = 'O' } = {},
): void {
  // `look` slides both pupils right, for eyes that scan a line of text.
  const eyes = [...'.OOOOOO.']
  eyes[2 + look] = 'K'
  eyes[5 + look] = 'K'
  const face = isAngry
    ? ['.OKOOKO.', '.OOKKOO.'] // brows slanting down to a V: a scowl
    : ['.OOOOOO.', isBlinking ? '.OOOOOO.' : eyes.join('')]
  const rows = [...face, 'OOOOOOOO', '.OOOOOO.', 'O.O..O.O']
  stamp(canvas, x, GUY_Y, rows.map(row => row.replaceAll('O', tint)))
}

function desk(canvas: Canvas, frame: number, { isTyping = false, hasProps = true } = {}): void {
  stamp(canvas, 0, PIXEL_ROWS - 1 - LIFT, ['D'.repeat(PIXEL_COLUMNS)])
  if (!hasProps) return
  stamp(canvas, 16, 8, [isTyping ? (frame % 2 === 0 ? 'Yk' : 'kY') : 'kk'])
  stamp(canvas, 1, 7, ['WW', 'WW'])
  stamp(canvas, 1, 5, frame % 2 === 0 ? ['.w', 'w.'] : ['w.', '.w'])
}

// A cloud 9 pixels wide over his head, three thinking dots filling in.
function thoughtBubble(canvas: Canvas, frame: number): void {
  stamp(canvas, 9, 0, ['.WWWWWWW.', 'WWWWWWWWW', '.WWWWWWW.'])
  stamp(canvas, 9, 3, ['W'])
  ;[11, 13, 15].slice(0, frame % 4).forEach(x => stamp(canvas, x, 1, ['K']))
}

function bulb(canvas: Canvas, frame: number): void {
  stamp(canvas, 11, 0, ['.YYY.', 'YYYYY', '.YYY.', '..k..'])
  if (frame % 2 === 0) stamp(canvas, 9, 0, ['Y.......Y', '.........', 'Y.......Y'])
}

export type PaintOptions = {
  isFlashOn?: boolean
  isIdea?: boolean
  screenWidth?: number
  // How many characters of the narration have been typed out so far.
  revealed?: number
  // Ticks since the scene changed; the monitor sweeps a refresh line.
  sinceChange?: number
  // True while the turn's end is celebrated: confetti falls.
  isCelebrating?: boolean
  // Shown at the right of the bottom edge: steps and time.
  status?: string
}

// Frames tick every 125ms. Most motion steps on every second tick (4 fps);
// the runners and the cursor keep their own tempo.
const beat = (tick: number) => Math.floor(tick / 2)

// A page turning right to left: lies on the right, lifts, stands over the
// spine, falls to the left, lands; one step a beat.
const PAGE_TURN: ReadonlyArray<readonly [number, number, readonly string[]]> = [
  [13, 6, ['WW', 'WW']],
  [13, 6, ['WW', 'WW']],
  [12, 5, ['WW', 'WW']],
  [12, 4, ['W', 'W', 'W']],
  [10, 5, ['WW', 'WW']],
  [9, 6, ['WW', 'WW']],
]

// A cog over his head while a command runs: two poses a beat apart spin it.
const GEAR = [
  ['..k..', '.kkk.', 'kkKkk', '.kkk.', '..k..'],
  ['k...k', '.kkk.', '.kKk.', '.kkk.', 'k...k'],
]

const CONFETTI = ['Y', 'U', 'S', 'W', 'Y', 'U']

function confetti(canvas: Canvas, tick: number): void {
  CONFETTI.forEach((glyph, i) => {
    const x = (i * 7 + 3 + (tick >> 2) * (i % 2 === 0 ? 1 : -1) + 18 * 4) % PIXEL_COLUMNS
    const y = ((tick + i * 3) % (PIXEL_ROWS - 1)) - LIFT
    stamp(canvas, x, y, [glyph])
  })
}

function drawPixels(
  canvas: Canvas,
  action: Action,
  tick: number,
  { isFlashOn = true, isIdea = false, isCelebrating = false }: PaintOptions,
): void {
  const frame = beat(tick)
  const isBlinking = frame % 8 === 7
  switch (action) {
    case 'think':
      desk(canvas, frame)
      guy(canvas, GUY_X, { isBlinking })
      thoughtBubble(canvas, frame)
      break
    case 'read':
      desk(canvas, frame)
      guy(canvas, GUY_X, { look: frame % 4 === 3 ? 0 : 1 })
      stamp(canvas, 9, 6, ['pprrpp', 'pprrpp', 'rrrrrr'])
      {
        const step = frame % PAGE_TURN.length
        const [x, y, page] = PAGE_TURN[step]!
        if (step === 2 || step === 3) stamp(canvas, 11, 6, ['WW', 'WW'])
        stamp(canvas, x, y, page)
      }
      break
    case 'edit':
      desk(canvas, frame, { isTyping: true })
      guy(canvas, GUY_X)
      stamp(canvas, 16, frame % 2 === 0 ? 6 : 7, ['O'])
      break
    case 'test':
      desk(canvas, frame)
      guy(canvas, GUY_X)
      // Even frames wind up, odd frames thump the monitor.
      if (frame % 2 === 0) stamp(canvas, 16, 4, ['.O', 'O.'])
      else stamp(canvas, 16, 5, ['OO', '.Y', '.Y'])
      break
    case 'run':
      // Types the command, hits Enter, and the cog spins while it runs.
      desk(canvas, frame, { isTyping: frame % 3 === 0 })
      stamp(canvas, 13, 0, GEAR[frame % 2]!)
      guy(canvas, GUY_X, { isBlinking })
      stamp(canvas, 16, frame % 3 === 0 ? 7 : 6, ['O'])
      break
    case 'error': {
      // Frustrated: scowling, shaking, red in the face, arms flailing,
      // steam puffing off his head and an anger mark flashing.
      desk(canvas, frame)
      const x = GUY_X + (tick % 2)
      const tint = frame % 2 === 0 ? 'F' : 'O'
      guy(canvas, x, { isAngry: true, tint })
      if (frame % 2 === 0) stamp(canvas, x - 2, GUY_Y - 1, [`${tint}.........${tint}`, `.${tint}.......${tint}.`])
      else stamp(canvas, x - 2, GUY_Y + 2, [`.${tint}.......${tint}.`, `${tint}.........${tint}`])
      const puff = frame % 3
      stamp(canvas, x, GUY_Y - 1 - puff, ['w......w'])
      if (frame % 2 === 1) stamp(canvas, x + 5, 0, ['A.A', '.A.', 'A.A'])
      break
    }
    case 'ok':
      desk(canvas, frame)
      guy(canvas, GUY_X)
      if (isFlashOn) stamp(canvas, 6, 3, ['O.........O', '.O.......O.'])
      if (isCelebrating) confetti(canvas, tick)
      break
    case 'idle':
      desk(canvas, frame)
      guy(canvas, GUY_X, { isBlinking })
      break
  }
  if (isIdea) bulb(canvas, frame)
}

// What the monitor says: three lines, each with its color.
export type ScreenLine = { text: string; color: number }

const SNIPPETS = [
  'export function main() {',
  '  const rows = await db',
  '  if (!rows) return null',
  '  return json(rows)',
  '}',
]
const TYPED = 'fix: handle empty rows'

const ascii = (value: string) => value.replace(/[^\x20-\x7e]/g, '?')

// Word-wraps the narration into two lines of `width` characters, the first
// led by `// ` and the second indented to match, then types it out.
function narrationLines(said: string, width: number, revealed: number): [string, string] {
  const room = Math.max(8, width - 3)
  const words = said.split(' ')
  const lines: [string, string] = ['', '']
  let row = 0
  for (const word of words) {
    const next = lines[row] ? `${lines[row]} ${word}` : word
    if (next.length <= room || !lines[row]) lines[row] = next.slice(0, room)
    else if (row === 0) {
      row = 1
      lines[1] = word.slice(0, room)
    } else {
      lines[1] = `${lines[1]}`.slice(0, room - 1) + '…'
      break
    }
  }
  const first = lines[0].slice(0, revealed)
  const second = lines[1].slice(0, Math.max(0, revealed - lines[0].length - 1))
  const isTyping = revealed < lines[0].length + 1 + lines[1].length
  const caret = isTyping ? '▌' : ''
  const onSecond = revealed > lines[0].length
  return [`// ${first}${onSecond ? '' : caret}`, lines[1] || onSecond ? `   ${second}${onSecond ? caret : ''}` : '']
}

// What the monitor says: one line of work, then two lines of narration.
// The file or command sits once, in the bezel's title bar.
export function screenLines(
  scene: Scene,
  tick: number,
  isFlashOn = true,
  revealed = Number.POSITIVE_INFINITY,
  width = MIN_SCREEN,
): [ScreenLine, ScreenLine, ScreenLine] {
  const frame = beat(tick)
  const cursor = Math.floor(tick / 4) % 2 === 0 ? '_' : ' '
  const spinner = '|/-\\'[tick % 4]
  const said = ascii(scene.line)
  const [first, second] = said ? narrationLines(said, width - 1, revealed) : ['', '']
  const color = scene.isOffTrack ? INK.offTrack : INK.comment
  const narration = (text: string): ScreenLine => ({ text, color })
  const work = (): ScreenLine => {
    switch (scene.action) {
      case 'think':
        return { text: `thinking${'.'.repeat(frame % 4)}`, color: INK.text }
      case 'read':
        return { text: SNIPPETS[frame % SNIPPETS.length]!, color: INK.code }
      case 'edit':
        return { text: `+ ${TYPED.slice(0, frame % (TYPED.length + 1))}${cursor}`, color: INK.prompt }
      case 'test': {
        const done = frame % 11
        return { text: `[${'#'.repeat(done)}${'.'.repeat(10 - done)}] ${done * 10}% ${spinner}`, color: INK.prompt }
      }
      case 'run':
        return { text: `running ${spinner}`, color: INK.cursor }
      case 'error':
        return { text: `${frame % 2 === 0 ? '✗' : ' '} ${ascii(scene.detail) || 'exit 1'}`, color: INK.error }
      case 'ok':
        return { text: isFlashOn ? '✓ OKAY' : '', color: INK.prompt }
      case 'idle':
        return { text: `$ ${cursor}`, color: INK.prompt }
    }
  }
  return [work(), narration(first), narration(second)]
}

type Cell = [number, number, number]

function pixelCells(canvas: Canvas, row: number): Cell[] {
  return Array.from({ length: PIXEL_COLUMNS }, (_, x): Cell => {
    const top = canvas[row * 2]?.[x] ?? 0
    const bottom = canvas[row * 2 + 1]?.[x] ?? 0
    if (top === 0 && bottom === 0) return [0x20, TERMINAL_DEFAULT, TERMINAL_DEFAULT]
    if (bottom === 0) return [UPPER_HALF, top, TERMINAL_DEFAULT]
    if (top === 0) return [LOWER_HALF, bottom, TERMINAL_DEFAULT]
    return [UPPER_HALF, top, bottom]
  })
}

function textCells(text: string, color: number, background: number): Cell[] {
  return [...text].map((glyph): Cell => [glyph.codePointAt(0) ?? 0x20, color, background])
}

// Each scene's label and accent, shown as a chip in the monitor's top edge.
export const CHIP: Record<Action, { label: string; color: number }> = {
  idle: { label: 'IDLE', color: INK.comment },
  think: { label: 'THINK', color: 0xbc8cff },
  read: { label: 'READ', color: INK.code },
  edit: { label: 'EDIT', color: INK.prompt },
  test: { label: 'TEST', color: INK.cursor },
  run: { label: 'RUN', color: 0x39c5cf },
  error: { label: 'ERROR', color: INK.error },
  ok: { label: 'DONE', color: INK.prompt },
}

type Run = { text: string; color: number }

const BEZEL = 0x374151
const BEZEL_THUMP = 0x6b7280
const STAND = 0x4b5563
const DESK = 0x8b5a2b

// A row of the bezel: text runs on the bezel's own grey, left and right.
function bezelRow(left: readonly Run[], right: readonly Run[], bezel: number, width: number): Cell[] {
  const fit = (runs: readonly Run[], room: number) => {
    const cells: Cell[] = []
    for (const run of runs) cells.push(...textCells(run.text.slice(0, room - cells.length), run.color, bezel))
    return cells
  }
  const head = fit(left, width)
  const tail = fit(right, Math.max(0, width - head.length))
  const fill = textCells(' '.repeat(Math.max(0, width - head.length - tail.length)), INK.text, bezel)
  return [...head, ...fill, ...tail]
}

// The desk runs along the bottom half of the last row; the stand's base sits on it.
function deskRow(width: number, base?: { from: number; to: number }): Cell[] {
  return Array.from({ length: width }, (_, x): Cell =>
    base && x >= base.from && x < base.to ? [UPPER_HALF, STAND, DESK] : [LOWER_HALF, DESK, TERMINAL_DEFAULT],
  )
}

function monitorCells(scene: Scene, tick: number, options: PaintOptions, screenWidth: number, row: number): Cell[] {
  const { isFlashOn = true, revealed, status = '', sinceChange = Number.POSITIVE_INFINITY } = options
  const width = screenWidth + 2
  // A thump from the test scene flashes the bezel lighter.
  const bezel = scene.action === 'test' && beat(tick) % 2 === 1 ? BEZEL_THUMP : BEZEL
  const chip = CHIP[scene.action]

  if (row === 0) {
    const title: Run[] = [{ text: ` ${chip.label} `, color: chip.color }]
    const target = ascii(scene.target)
    if (target) title.push({ text: ` ${target}`, color: INK.text })
    const flag: Run[] = scene.isOffTrack ? [{ text: 'off track ', color: INK.offTrack }] : []
    return bezelRow(title, flag, bezel, width)
  }
  if (row === ROWS - 2) {
    const led = scene.action === 'error' ? INK.error : INK.prompt
    return [
      ...bezelRow([], status ? [{ text: `${status} `, color: 0x9ca3af }] : [], bezel, width - 2),
      [LOWER_HALF, led, bezel],
      [0x20, INK.text, bezel],
    ]
  }
  if (row === ROWS - 1) {
    const middle = Math.floor(width / 2)
    return deskRow(width, { from: middle - 4, to: middle + 4 })
  }

  const content = screenLines(scene, tick, isFlashOn, revealed, screenWidth)[row - 1]!
  // The error screen pulses red twice a second.
  const isAlarm = scene.action === 'error' && Math.floor(tick / 4) % 2 === 0
  // A new scene sweeps a lighter refresh line down the screen, one row a tick.
  const isSweep = sinceChange === row - 1
  const background = isAlarm ? INK.alarm : isSweep ? INK.sweep : INK.screen
  const shown = ` ${content.text}`.slice(0, screenWidth).padEnd(screenWidth, ' ')
  return [
    [0x20, INK.text, bezel],
    ...textCells(shown, isAlarm ? INK.white : content.color, background),
    [0x20, INK.text, bezel],
  ]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: readonly number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// RasterProps.cells: row-major little-endian u32 triplets [codePoint, fg, bg].
function encode(rows: readonly Cell[][]): string {
  const bytes: number[] = []
  for (const cell of rows.flat()) {
    for (const word of cell) bytes.push(word & 255, (word >>> 8) & 255, (word >>> 16) & 255, (word >>> 24) & 255)
  }
  return toBase64(bytes)
}

// The pixel grid of one frame: PIXEL_COLUMNS x (ROWS * 2) colors, 0 for empty.
export function pixels(action: Action, frame: number, options: PaintOptions = {}): number[][] {
  const canvas = blank()
  drawPixels(canvas, action, frame, options)
  return canvas
}

export function cellRows(scene: Scene, frame: number, options: PaintOptions = {}): Cell[][] {
  const { screenWidth = MIN_SCREEN } = options
  const canvas = pixels(scene.action, frame, options)
  const gap: Cell = [0x20, TERMINAL_DEFAULT, TERMINAL_DEFAULT]
  return Array.from({ length: ROWS }, (_, row) => [
    ...pixelCells(canvas, row),
    ...(row === ROWS - 1 ? deskRow(GAP) : Array.from({ length: GAP }, () => gap)),
    ...monitorCells(scene, frame, options, screenWidth, row),
  ])
}

export const paint = (scene: Scene, frame: number, options: PaintOptions = {}): string =>
  encode(cellRows(scene, frame, options))

export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

const TEST_COMMAND =
  /\b(vitest|jest|pytest|mocha|playwright test|(npm|pnpm|yarn|bun)( run)? (test|check|lint)|go test|cargo test|tsc|oxlint|eslint)\b/
const READ_TOOL = /^(Read|Grep|Glob|WebFetch|WebSearch|LSP|ToolSearch)$|(read|search|get|list|query|explore|fetch)/i
const EDIT_TOOL = /^(Edit|Write|MultiEdit|NotebookEdit)$/

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function classify(tool: string, input: Record<string, unknown>): Action {
  if (EDIT_TOOL.test(tool)) return 'edit'
  if (tool === 'Bash') return TEST_COMMAND.test(text(input.command)) ? 'test' : 'run'
  if (READ_TOOL.test(tool)) return 'read'
  return 'run'
}

const shortPath = (path: string): string => path.split('/').filter(Boolean).slice(-2).join('/')

export function targetOf(input: Record<string, unknown>): string {
  const path = text(input.file_path) || text(input.notebook_path) || text(input.path)
  if (path) return shortPath(path)
  const command = text(input.command).split('\n')[0]?.trim() ?? ''
  if (command) return command.slice(0, 60)
  return (text(input.pattern) || text(input.url) || text(input.query) || text(input.description)).slice(0, 60)
}

export const SCENE_WORDS: Record<Action, string> = {
  idle: 'sitting at his desk',
  think: 'thinking, a thought bubble over his head',
  read: 'pretending to read a book',
  edit: 'typing on the keyboard',
  test: 'thumping the side of the monitor while tests run',
  run: 'hitting Enter while a cog spins over his head',
  error: 'fuming, red in the face, arms flailing, while the monitor flashes red',
  ok: 'cheering, OKAY on the monitor',
}

export function clipWords(line: string, max: number): string {
  const words = line
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(0, max).join(' ')
}

export type Reply = { line: string; fits: boolean }

export function parseReply(raw: string): Reply | null {
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (json) {
    try {
      const value = JSON.parse(json) as { line?: unknown; fits?: unknown }
      if (typeof value.line === 'string' && value.line.trim()) {
        return { line: value.line.trim(), fits: value.fits !== false }
      }
    } catch {
      // fall through to the plain-text reading
    }
  }
  const first = raw.split('\n').map(l => l.trim()).find(Boolean)
  return first ? { line: first, fits: true } : null
}

export const SYSTEM =
  'You narrate a tiny pixel theater in a coding tool: the little orange Claude mascot sits at a desk and acts out what the coding agent is doing. ' +
  'You speak as him, a seasoned senior engineer thinking out loud to a junior: terse, technical, precise, a little dry humour. ' +
  'You always answer with one line of JSON and nothing else.'

const RULES =
  'Write in the same language as the user request. Plain words, no emoji, no em dashes. ' +
  'Reply exactly as {"line": "...", "fits": true} or {"line": "...", "fits": false}.'

export function stepPrompt(args: {
  request: string
  steps: readonly string[]
  tool: string
  target: string
  action: Action
  failure: string
}): string {
  const failure = args.failure
    ? `\nThe step failed with:\n"""${args.failure}"""\nNarrate it like a veteran who has seen this exact bug before: name the likely cause in a few words.`
    : '\nIf the step looks like it found a bug, sound like a veteran naming the likely cause.'
  return [
    `User request:\n"""${args.request || '(none yet)'}"""`,
    `Earlier steps this turn: ${args.steps.slice(-8).join('; ') || 'none'}`,
    `Step now: ${args.tool} on ${args.target || 'nothing in particular'}. The guy is ${SCENE_WORDS[args.action]}.${failure}`,
    'Write "line": one narration line of 12 words or fewer. Stay in the senior engineer voice, but say plainly what the agent is doing and to which file or command.',
    'Write "fits": does this step plausibly serve the user request? Looking around, reading and checking for the task count as fitting. false only when the step wanders off the request.',
    RULES,
  ].join('\n\n')
}

export function summaryPrompt(args: {
  request: string
  steps: readonly string[]
  answer: string
  isAborted: boolean
}): string {
  return [
    `User request:\n"""${args.request || '(none)'}"""`,
    `Steps this turn: ${args.steps.join('; ') || 'none'}`,
    `The agent's reply (start):\n"""${args.answer || '(empty)'}"""`,
    args.isAborted ? 'The user stopped this turn early.' : '',
    'Write "line": a one-line summary of this turn, 15 words or fewer, saying what got done. Set "fits" to true.',
    RULES,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const EMPTY_SCENE: Scene = {
  action: 'idle',
  target: '',
  detail: '',
  line: '',
  isOffTrack: false,
  isDone: false,
}
