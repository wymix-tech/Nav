import { validateInstalled, type InstalledWidget } from '@nav/shared'
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
export function pluginDocument(widget: InstalledWidget, secret: string): string {
  validateInstalled(widget)
  const nonce = crypto.randomUUID(),
    entry = widget.cdnUrl
  const origins = (widget.manifest.networkOrigins ?? []).join(' ')
  const csp = `default-src 'none'; script-src 'nonce-${nonce}' ${entry}; connect-src ${origins || "'none'"}; img-src data: ${origins}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'`
  const json = (s: string) => JSON.stringify(s).replace(/</g, '\\u003c')
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><style>html,body,#root{margin:0;height:100%;font:14px system-ui;color:#e2e8f0}body{overflow:auto}</style></head><body><div id="root"></div><script type="module" nonce="${nonce}">
 const secret=${json(secret)};let mounted=false,dispose,port;
 window.addEventListener('message',async e=>{
  if(e.source!==parent||e.data?.secret!==secret||e.data?.type!=='init'||mounted||!e.ports[0])return;
  mounted=true;port=e.ports[0];
  try{const module=await import(${json(entry)});if(typeof module.mount!=='function')throw Error('插件缺少 mount 导出');
   dispose=await module.mount(document.getElementById('root'),e.data.config,{updateConfig:config=>port.postMessage({type:'config',config})});
   port.onmessage=e=>{if(e.data?.type==='dispose'){dispose?.();port.close()}else if(e.data?.type==='config')module.updateConfig?.(e.data.config)};
   port.postMessage({type:'ready'});
  }catch(e){port.postMessage({type:'error',message:String(e.message??e)})}
 });parent.postMessage({type:'plugin-ready',secret},'*');
 </script></body></html>`
}
