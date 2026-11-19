import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {handleApi} from './api.mjs';
import {localDatabase} from './local-store.mjs';
const root=resolve('public'),state=resolve('.local');await mkdir(state,{recursive:true});
const env={DB:localDatabase(resolve(state,'ai-usage.sqlite')),DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,DEEPSEEK_MODEL:process.env.DEEPSEEK_MODEL||'deepseek-flash'};
if(process.argv.includes('--key-stdin')){
 if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stderr.write('Ready for private server input (hidden).\n');
 const value=await new Promise(resolve=>{let text='';process.stdin.on('data',chunk=>{text+=chunk;if(/[\r\n]/.test(text)){process.stdin.pause();process.stdin.removeAllListeners('data');if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(JSON.parse(text));}});});env.DEEPSEEK_API_KEY=value.key;
}
const args=process.argv.slice(2),port=Number(args[args.indexOf('--port')+1]||process.env.PORT||4317);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await handleApi(request,env,{waitUntil:p=>p.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{env.DB.close();process.exit();}));
