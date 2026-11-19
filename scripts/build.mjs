import {readFile,readdir,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {build} from 'esbuild';
const root=resolve('.'),dist=resolve(root,'dist'),source=resolve(root,'public'),scratch=resolve(root,'.local/build');
await readFile(resolve(source,'index.html'));
if(dist!==root+sep+'dist'||!dist.startsWith(root+sep))throw Error('Unexpected build output');
await rm(dist,{recursive:true,force:true});await mkdir(resolve(dist,'server'),{recursive:true});await mkdir(resolve(dist,'.openai'),{recursive:true});await mkdir(scratch,{recursive:true});
await cp(resolve(root,'.openai/hosting.json'),resolve(dist,'.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(dist,'.openai/drizzle'),{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const assets={};for(const name of await readdir(source)){const type=types[extname(name)];if(!type)throw Error('Unsupported public asset: '+name);assets['/'+name]={body:await readFile(resolve(source,name),'utf8'),type};}
await writeFile(resolve(scratch,'assets.mjs'),'export const ASSETS='+JSON.stringify(assets)+';\n');
await writeFile(resolve(scratch,'entry.mjs'),"import {createWorker} from '../../worker/index.mjs';\nimport {ASSETS} from './assets.mjs';\nexport default createWorker(ASSETS);\n");
await build({entryPoints:[resolve(scratch,'entry.mjs')],outfile:resolve(dist,'server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',logLevel:'warning'});
console.log(JSON.stringify({built:true,assets:Object.keys(assets).length,entry:'dist/server/index.js',bundled:true}));
