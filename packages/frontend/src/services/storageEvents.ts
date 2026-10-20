import { canonical, type Dashboard } from '@nav/shared'

export interface StorageNotice {
  key: string
  source: string
  kind: 'document' | 'status'
  generation: number
  revision: number
}

// Server acknowledgements update revision and the compatibility camera mirror.
// Neither changes the editable content represented by a history entry.
export function sameDashboardContent(a: Dashboard, b: Dashboard) {
  const content = ({ revision: _revision, viewport: _viewport, ...rest }: Dashboard) => rest
  return canonical(content(a)) === canonical(content(b))
}
