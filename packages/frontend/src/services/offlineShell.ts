export function registerOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const announce = () => {
          if (reg.waiting)
            window.dispatchEvent(
              new CustomEvent('nav-update-available', {
                detail: () => {
                  reg.waiting?.postMessage('ACTIVATE')
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => location.reload(),
                    { once: true },
                  )
                  if (!navigator.serviceWorker.controller) location.reload()
                },
              }),
            )
        }
        announce()
        reg.addEventListener('updatefound', () =>
          reg.installing?.addEventListener('statechange', announce),
        )
      })
      .catch(() => {})
  })
}
