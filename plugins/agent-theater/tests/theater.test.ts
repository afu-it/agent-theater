import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { EMPTY_SCENE, ROWS, classify, clipWords, columnsFor, paint, parseReply, screenLines } from '../hooks/stage'

const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

// What a real session answers beneath the plugin.
function engine(on: On): void {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  // The band the engine draws when the theater passes.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine band') as RenderElement
  })
}

const BAND = {
  plugin: 'agent-theater',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('each action maps to its scene', async () => {
  expect(classify('Read', {})).toBe('read')
  expect(classify('Grep', {})).toBe('read')
  expect(classify('Edit', {})).toBe('edit')
  expect(classify('Bash', { command: 'npx vitest run test/a.spec.ts' })).toBe('test')
  expect(classify('Bash', { command: 'npm test' })).toBe('test')
  expect(classify('Bash', { command: 'git status' })).toBe('run')
})

test('the stage is one raster: pixel art, then a monitor with text', async () => {
  // Every cell is 3 u32 = 12 bytes, base64 of that.
  const length = Math.ceil((columnsFor(26) * ROWS * 12) / 3) * 4
  for (const action of ['idle', 'think', 'read', 'edit', 'test', 'run', 'error', 'ok'] as const) {
    expect(paint({ ...EMPTY_SCENE, action }, 0).length).toBe(length)
  }
  const edit = { ...EMPTY_SCENE, action: 'edit' as const, target: 'src/App.tsx' }
  // Frames tick every 125ms; the typing hand moves every second tick.
  expect(paint(edit, 0)).not.toBe(paint(edit, 2))
  // The target shows once, in the title bar; the screen shows the work.
  expect(screenLines(edit, 0).some(line => line.text.includes('src/App.tsx'))).toBe(false)
  expect(screenLines({ ...edit, line: 'ubah sikit' }, 0)[1].text).toBe('// ubah sikit')
  // Narration wraps onto a second line instead of being cut.
  const long = screenLines({ ...edit, line: 'one two three four five six seven eight nine' }, 0, true, Infinity, 26)
  expect(long[1].text).toBe('// one two three four')
  // Past two lines it ends in an ellipsis.
  expect(long[2].text).toBe('   five six seven eight\u2026')
  const failed = { ...EMPTY_SCENE, action: 'error' as const, detail: 'TypeError: boom' }
  expect(screenLines(failed, 0)[0].text).toBe('\u2717 TypeError: boom')
})

test('Haiku replies are read as JSON, then plain text, and clipped', async () => {
  expect(parseReply('{"line": "Hammering register.tsx", "fits": false}')).toEqual({
    line: 'Hammering register.tsx',
    fits: false,
  })
  expect(parseReply('Reading a book')).toEqual({ line: 'Reading a book', fits: true })
  expect(clipWords('one — two three four', 3)).toBe('one, two three')
})

test('a failed step flashes the monitor and off-track narration turns yellow', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on)
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: '{"line": "Here, in c.ts, a wild bug emerges.", "fits": false}',
      usage: USAGE,
    },
  }))
  on('tool.call', () => ({ result: {}, text: 'TypeError: boom', isError: true as const }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'fix the band', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/a/b/c.ts' })
  await clock.advance(5000)
  await clock.advance(0)

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Raster' })).toBeDefined()
  await terminal.unmount()
  // The desktop draws the monitor as text, so the narration line can be read.
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const narration = await desktop.find({ type: 'Text', text: /wild bug/ })
  expect(narration?.props.color).toBe('#e3b341')
  expect(await desktop.find({ type: 'Text', text: /TypeError: boom/ })).toBeDefined()
  await desktop.unmount()
})

test('/theater off hides the band', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  engine(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'read it', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/a/b/c.ts' })

  const shown = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await shown.find({ type: 'Raster' })).toBeDefined()
  await shown.unmount()

  const ran = await $.command.run({
    command: 'theater',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(ran.text).toBe('Agent theater is off.')
  // With the theater off the band passes to what sits beneath it.
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await hidden.find({ type: 'Raster' })).toBeUndefined()
  expect(await hidden.find({ type: 'Text', text: /engine band/ })).toBeDefined()
  await hidden.unmount()
})

test('/theater demo walks through every scene', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on)
  on('ui.blit', () => ({ value: {} }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({
    command: 'theater',
    args: 'demo',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(ran.text).toBe('Agent theater demo: 8 scenes, 3s each.')

  const first = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await first.find({ type: 'Text', text: /Kopi dulu/ })).toBeDefined()
  await first.unmount()

  // 3s per scene: after 6.1s the third scene (edit) is up.
  await clock.advance(6100)
  const third = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await third.find({ type: 'Text', text: /Edit src\/App/ })).toBeDefined()
  await third.unmount()
})
