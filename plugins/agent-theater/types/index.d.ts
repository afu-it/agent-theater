export type Action = 'idle' | 'think' | 'read' | 'edit' | 'test' | 'run' | 'error' | 'ok'

export type Scene = {
  action: Action
  target: string
  // The first line of a failure, shown on the monitor.
  detail: string
  line: string
  isOffTrack: boolean
  isDone: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-theater': {
      scene: Scene | null
      isOn: boolean
      request: string
      steps: string[]
    }
  }
}
