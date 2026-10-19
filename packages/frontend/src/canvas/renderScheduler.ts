export function createRenderScheduler() {
  let frame = 0
  let queue: { id: string; heavy: boolean; run: () => void }[] = []
  let overBudget = 0
  function drain() {
    frame = 0
    const start = performance.now()
    let light = 0
    while (queue.length && light < 2 && performance.now() - start < 4) {
      const task = queue.shift()!,
        begin = performance.now()
      task.run()
      if (performance.now() - begin > 4) overBudget++
      if (task.heavy) break
      light++
    }
    if (queue.length) frame = requestAnimationFrame(drain)
  }
  return {
    replace(tasks: typeof queue) {
      queue = tasks
      if (queue.length && !frame) frame = requestAnimationFrame(drain)
    },
    dispose() {
      cancelAnimationFrame(frame)
      frame = 0
      queue = []
    },
    diagnostics() {
      return { queued: queue.length, overBudget }
    },
  }
}
