/* Still's offline cache stores public shells and WEB only. Never cache API responses. */
const CACHE='still-public-v15';
const PAGES=['/create-image','/read','/today','/journey','/create','/scripture','/chat','/journal','/settings'];
async function prepareOffline(){
 const cache=await caches.open(CACHE);
 await cache.addAll(['/offline.html','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/bibles/WEB.json','/bibles/catalog.json','/backgrounds/mountain-hush.jpg','/backgrounds/quiet-water.svg','/backgrounds/sage-hills.svg']);
 const assets=new Set();
 for(const page of PAGES){const response=await fetch(page,{cache:'reload'});if(!response.ok)throw new Error('A screen could not be saved.');const html=await response.clone().text();await cache.put(page,response);for(const match of html.matchAll(/(?:src|href)="([^" ]+)"/g)){if(match[1].startsWith('/_next/static/'))assets.add(match[1].replaceAll('&amp;','&'));}}
 await cache.addAll([...assets]);
}
self.addEventListener('install',event=>{event.waitUntil(prepareOffline().then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('still-public-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data?.type==='CACHE_OFFLINE')event.waitUntil(prepareOffline().then(()=>event.ports[0]?.postMessage({ok:true})).catch(error=>event.ports[0]?.postMessage({ok:false,error:error.message})));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method==='GET'&&url.origin===self.location.origin&&url.pathname.startsWith('/tts/')){event.respondWith(caches.open('still-tts-runtime-v1').then(async cache=>{const hit=await cache.match(request);if(hit)return hit;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}));return;}
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.includes('agent.json'))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(async response=>{if(response.ok&&PAGES.includes(url.pathname)){const cache=await caches.open(CACHE);await cache.put(url.pathname,response.clone());}return response;}).catch(async()=>await caches.match(url.pathname)||await caches.match('/offline.html')));return;}
 // RSC responses must not be confused with HTML shells. Offline navigation uses full links.
 if(request.headers.get('RSC'))return;
 if(url.pathname.startsWith('/_next/static/')||url.pathname==='/bibles/WEB.json'||url.pathname==='/bibles/catalog.json'||url.pathname.startsWith('/icons/')||url.pathname.startsWith('/backgrounds/')||url.pathname.startsWith('/tts/'))event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(async response=>{if(response.ok)(await caches.open(CACHE)).put(request,response.clone());return response;})));
});
