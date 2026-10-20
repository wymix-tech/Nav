<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  appearance: 'M12 3a9 9 0 1 0 0 18V3ZM12 3a9 9 0 0 1 0 18M12 7h4M12 12h5M12 17h4',
  layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  views: 'M3 5h18v14H3zM8 5v14M3 10h18',
  hand: 'M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-1c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l3 3',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8z',
  home: 'm3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  cursor: 'm5 3 14 10-7 1-3 7L5 3Z',
  select: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  region: 'M3 3h18v18H3zM3 8h18',
  additive: 'M3 3h10v10H3zM17 13v8M13 17h8',
  snap: 'M5 3v9a7 7 0 0 0 14 0V3h-4v9a3 3 0 0 1-6 0V3H5ZM5 7h4M15 7h4',
  organize: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  baseline: 'M4 4h16v16H4zM4 10h16M10 4v16',
  reset: 'M3 10a9 9 0 1 1 2 8M3 3v7h7',
  grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  resize: 'm8 20 12-12M14 20l6-6',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  locate: 'M12 2v4M12 18v4M2 12h4M18 12h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM12 12h.01',
  right: 'm10 6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
}
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    :stroke-width="['more', 'grip'].includes(name) ? 3 : 1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name] || paths.more" />
  </svg>
</template>
