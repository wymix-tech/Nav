import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'
export function offlinePlugin(): Plugin {
  return {
    name: 'nav-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const paths = [
        '/',
        '/index.html',
        ...Object.keys(bundle)
          .filter((name) => name.startsWith('assets/') || name === 'favicon.svg')
          .map((name) => '/' + name),
      ]
      const version = createHash('sha256').update(JSON.stringify(paths)).digest('hex').slice(0, 16)
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE='nav-${version}',PATHS=${JSON.stringify(paths)};
 self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PATHS))));
 self.addEventListener('message',e=>{if(e.data==='ACTIVATE')self.skipWaiting()});
 self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('nav-')&&k!==CACHE).map(k=>caches.delete(k))))));
 self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/uploads/'))return;
 if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));
 else if(PATHS.includes(u.pathname))e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));
 });`,
      })
    },
  }
}
