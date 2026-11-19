import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,wavDuration,handleApi,cleanReview,createReview,reserveQuota} from '../server/api.mjs';
import {localDatabase} from '../server/local-store.mjs';
import {pcmWav,prepareAudio} from '../public/ai-review.js';
const input=()=>({language:'en',mode:'reading',title:'Practice',reference:'Today I will speak clearly.',transcript:'Today I will speak clearly.',duration:6,acoustic:{pauses:{available:true,pauses:[]},pitch:{available:false}}});
const review=()=>({summary:'本次转写内容完整，下一遍可以尝试自然连读。',strengths:['转写包含完整句子。'],dimensions:[{name:'内容完成',level:'较好',detail:'转写和原文一致，实际发音仍需回听。'}],priorities:[{title:'练习意群',evidenceFrom:'reference',quote:'Today I will speak clearly.',reason:'用两个意群突出句意。',action:'先读 Today，再把其余词连起来读。'}],practice:'慢读一遍，再用自然节奏重读。'});
const completion=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(review())}}]});
const request=(body,headers={})=>new Request('https://yanxi.test/api/evaluate',{method:'POST',headers:{Origin:'https://yanxi.test','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('invalid mode, duration and oversized text are rejected before provider use',()=>{
 for(const value of [{...input(),language:'xx'},{...input(),duration:NaN},{...input(),duration:1},{...input(),reference:'x'.repeat(8001)}])assert.throws(()=>validateInput(value));
});
test('WAV export is PCM mono 16 kHz and malformed audio is rejected',async()=>{
 const bytes=new Uint8Array(await pcmWav(new Float32Array(16000)).arrayBuffer());assert.equal(wavDuration(bytes),1);assert.throws(()=>wavDuration(new Uint8Array(44)));bytes[20]=3;assert.throws(()=>wavDuration(bytes));
});
test('audio just beyond two minutes is split into valid balanced chunks',async()=>{
 const previous=globalThis.window,samples=new Float32Array(16000*120+800);
 globalThis.window={AudioContext:class{async decodeAudioData(){return {duration:samples.length/16000,length:samples.length,sampleRate:16000,numberOfChannels:1,getChannelData:()=>samples};}async close(){}}};
 try{const chunks=await prepareAudio(new Blob(['test']));assert.equal(chunks.length,2);for(const chunk of chunks){const duration=wavDuration(new Uint8Array(await chunk.arrayBuffer()));assert.ok(duration>1&&duration<=120);}}finally{globalThis.window=previous;}
});
test('invented evidence is not attributed to the original text',()=>{
 const value=review();value.priorities[0].quote='A sentence that was never read.';assert.equal(cleanReview(value,input()).priorities[0].quote,'');
});
test('cross-origin and missing key fail without provider access',async()=>{
 let calls=0;const fake=async()=>{calls++;return completion();};
 assert.equal((await handleApi(request(input(),{Origin:'https://other.test'}),{}, {},fake)).status,403);
 assert.equal((await handleApi(request(input()),{}, {},fake)).status,503);assert.equal(calls,0);
});
test('public endpoint fails closed when durable quota binding is missing',async()=>{
 let calls=0;const response=await handleApi(request(input()),{DEEPSEEK_API_KEY:'unit-test-private-value'},{},async()=>{calls++;return completion();});assert.equal(response.status,503);assert.equal(calls,0);
});
test('successful text review preserves model boundary and never returns key',async()=>{
 const db=localDatabase();try{let seen;const result=await handleApi(request(input()),{DB:db,DEEPSEEK_API_KEY:'unit-test-private-value'},{},async(url,init)=>{seen=JSON.parse(init.body);return completion();});assert.equal(result.status,200);const value=await result.json();assert.equal(value.metrics.similarity,100);assert.equal(value.transcription,'browser');assert.equal(value.model,'deepseek-flash');assert.match(seen.messages[0].content,/不能听音频/);assert.equal(seen.thinking.type,'disabled');assert.doesNotMatch(JSON.stringify(value),/unit-test-private-value/);}finally{db.close();}
});
test('cloud ASR transcript is used for review and comparison',async()=>{
 const data=validateInput({...input(),transcript:'Incorrect browser transcript.'});let asr=0,model=0;
 const value=await createReview(data,[new File([await pcmWav(new Float32Array(16000)).arrayBuffer()],'speech.wav')],{DEEPSEEK_API_KEY:'test'},async(url,options)=>{if(url.endsWith('/asr')){asr++;assert.ok(options.body.get('file'));return Response.json({text:'Today I will speak clearly.',duration_ms:1000});}model++;const body=JSON.parse(options.body);assert.match(body.messages[1].content,/Today I will speak clearly/);return completion();});
 assert.equal(value.transcription,'deepseek');assert.equal(value.metrics.similarity,100);assert.equal(asr,1);assert.equal(model,1);
});
test('empty speech has no fabricated assessment',async()=>{
 let modelCalled=false;await assert.rejects(()=>createReview(validateInput(input()),[new File(['audio'],'speech.wav')],{DEEPSEEK_API_KEY:'test'},async url=>{if(url.endsWith('/asr'))return Response.json({text:''});modelCalled=true;return completion();}),/没有识别到/);assert.equal(modelCalled,false);
});
test('manual correction skips cloud transcription',async()=>{
 const value=await createReview(validateInput({...input(),corrected:true}),[new File(['audio'],'speech.wav')],{DEEPSEEK_API_KEY:'test'},async url=>{assert.ok(!url.endsWith('/asr'));return completion();});assert.equal(value.transcription,'corrected');
});
test('provider authentication and truncated responses give safe recoverable errors',async()=>{
 const db=localDatabase();try{const response=await handleApi(request(input()),{DB:db,DEEPSEEK_API_KEY:'private-value'},{},async()=>Response.json({error:{message:'private-value'}},{status:401}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private-value/);}finally{db.close();}
 await assert.rejects(()=>createReview(validateInput(input()),[],{DEEPSEEK_API_KEY:'test'},async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{partial'}}]})),/未完整返回/);
});
test('minute and daily reservations are durable and respect concurrent limits',async()=>{
 const db=localDatabase();const env={DB:db,DEEPSEEK_API_KEY:'test',AI_GLOBAL_DAILY_LIMIT:'3',AI_CLIENT_DAILY_LIMIT:'2'},now=1795017600000;
 try{const r=new Request('https://yanxi.test',{headers:{'cf-connecting-ip':'192.0.2.1'}});const outcomes=await Promise.allSettled([reserveQuota(env,r,now),reserveQuota(env,r,now),reserveQuota(env,r,now)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);await assert.rejects(()=>reserveQuota(env,r,now+61000));const second=new Request('https://yanxi.test',{headers:{'cf-connecting-ip':'192.0.2.2'}});await reserveQuota(env,second,now);await assert.rejects(()=>reserveQuota(env,second,now+61000));assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM ai_review_usage').bind().first()).count,3);}finally{db.close();}
});
