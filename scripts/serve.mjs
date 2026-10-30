import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const root=path.resolve('dist'),port=Number(process.env.PORT||4317);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const body=await readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
