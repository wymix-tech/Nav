import { canonical, type CanvasScene } from './scene.js'
export function canvasSceneDifferences(local: CanvasScene, remote: CanvasScene): string[] {
  const out: string[] = []
  const diff = (label: string, a: unknown, b: unknown) => {
    if (canonical(a) !== canonical(b))
      out.push(`canvasScene:${label}：本地 ${canonical(a)}；远端 ${canonical(b)}`)
  }
  for (const id of new Set([...Object.keys(local.widgetMeta), ...Object.keys(remote.widgetMeta)]))
    diff(`widgetMeta.${id}`, local.widgetMeta[id], remote.widgetMeta[id])
  for (const field of ['groups', 'regions'] as const)
    for (const id of new Set([...local[field].map((x) => x.id), ...remote[field].map((x) => x.id)]))
      diff(
        `${field}.${id}`,
        local[field].find((x) => x.id === id),
        remote[field].find((x) => x.id === id),
      )
  diff('layers', local.layers, remote.layers)
  return out
}
