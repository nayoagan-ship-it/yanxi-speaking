import {handleApi} from '../server/api.mjs';
export function createWorker(assets){return {async fetch(request,env,ctx){
 const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,env,ctx);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
 const asset=assets[path==='/'?'/index.html':path];if(!asset)return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':path==='/'||path.endsWith('.html')||path.endsWith('sw.js')?'no-store':'public, max-age=300'}});
}};}
