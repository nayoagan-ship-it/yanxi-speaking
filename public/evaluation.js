// Transparent practice signals; this is not phoneme assessment or semantic grading.
export const normalize = text => String(text||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function alignText(reference, transcript) {
  const a=Array.from(normalize(reference)), b=Array.from(normalize(transcript));
  if(a.length>1400||b.length>3000) return null;
  const width=b.length+1, dp=new Uint16Array((a.length+1)*width);
  for(let i=0;i<=a.length;i++)dp[i*width]=i;
  for(let j=0;j<=b.length;j++)dp[j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
    dp[i*width+j]=Math.min(dp[(i-1)*width+j]+1,dp[i*width+j-1]+1,dp[(i-1)*width+j-1]+(a[i-1]===b[j-1]?0:1));
  }
  let i=a.length,j=b.length; const ops=[];
  while(i||j) {
    const v=dp[i*width+j];
    if(i&&j&&a[i-1]===b[j-1]&&v===dp[(i-1)*width+j-1]) {ops.push({type:'match',ref:a[--i],heard:b[--j],index:i});}
    else if(i&&j&&v===dp[(i-1)*width+j-1]+1){ops.push({type:'substitute',ref:a[--i],heard:b[--j],index:i});}
    else if(i&&v===dp[(i-1)*width+j]+1){ops.push({type:'omit',ref:a[--i],heard:'',index:i});}
    else {ops.push({type:'insert',ref:'',heard:b[--j],index:i});}
  }
  ops.reverse(); const groups=[];
  for(const op of ops) if(op.type!=='match') {
    const last=groups.at(-1);
    if(last&&last.type===op.type&&op.index<=last.end+1){last.ref+=op.ref;last.heard+=op.heard;last.end=op.index;}
    else groups.push({...op,end:op.index});
  }
  const count = type => ops.filter(o=>o.type===type).length;
  return {ops,groups,referenceLength:a.length,spokenLength:b.length,distance:dp[a.length*width+b.length],similarity:Math.max(0,Math.round((1-dp[a.length*width+b.length]/Math.max(a.length,b.length,1))*100)),omitted:count('omit'),inserted:count('insert'),substituted:count('substitute')};
}
export function analyzeStructure(text,framework='prep') {
  const clean=String(text||'').replace(/\s/g,'');
  if(!normalize(clean).length)return [];
  const start=clean.slice(0,80),end=clean.slice(-100);
  const sets={
    prep:[['开头有观点',/我(认为|觉得|的看法|的观点|的选择|倾向|支持|建议)|在我看来|我会选择/.test(start),'先用“我的看法是……”回答问题。'],['理由分点说',(/(首先|第一|一是)/.test(clean)&&/(其次|第二|二是)/.test(clean)),'加上“第一……第二……”，每点只讲一个理由。'],['有具体例子',/(比如|例如|举个例|有一次|记得|曾经)/.test(clean),'补一个“比如，有一次……”的真实小例子。'],['结尾有收束',/(所以|因此|总之|综上|总的来说|这就是|我的建议|我的看法)/.test(end),'最后用“所以，我建议……”回到你的观点。']],
    star:[['情境交代',/(当时|那天|有一次|去年|上周|上次|以前|曾经)/.test(start),'先交代“当时，在……的情况下”。'],['任务明确',/(任务|目标|需要|负责|要解决|问题是)/.test(clean),'加一句“我当时需要解决的是……”。'],['行动有顺序',/(先|第一步)/.test(clean)&&/(然后|接着|再|第二步)/.test(clean),'用“我先……然后……”讲清行动顺序。'],['结果有交代',/(最后|最终|结果|完成|学到|收获)/.test(end),'用“最后……我学到……”说明结果和收获。']],
    action:[['先给结论',/(建议|提议|应该|可以|我认为|我觉得)/.test(start),'开头直接说“我的建议是……”。'],['说明原因',/(因为|原因|理由|一方面|首先|第一)/.test(clean),'给出一个“原因是……”的具体解释。'],['方案具体',/(方案|分.{0,2}步|先.{1,30}(再|然后)|负责人|具体.{0,3}(做|可以)|第一步)/.test(clean),'用“先……再……”明确可执行的步骤。'],['下一步清楚',/(接下来|下一步|我会|我们会|明天|今天|本周|从.{1,8}开始)/.test(end),'结尾说明“接下来，我会在……之前完成……”。']]
  };
  return (sets[framework]||sets.prep).map(([name,found,advice])=>({name,found,advice}));
}
export function analyzeFluency(text) {
  const clean=String(text||'');
  const fillers=[...clean.matchAll(/(嗯|呃|额|就是说|怎么说呢|那个那个|然后然后)/g)].map(m=>({word:m[0],index:m.index}));
  const repeats=[...clean.matchAll(/([\u4e00-\u9fff]{2,5})[，、\s]*\1/g)].filter(m=>!['慢慢','一点点','越来越','一天天','人人','看看','想想','说说','试试'].includes(m[0])).map(m=>({word:m[0],index:m.index}));
  return {fillers,repeats};
}
export function analyzePauses(samples=[]) {
  // Leading/trailing silence is excluded. Low amplitude is only a playback cue.
  if(samples.length<20) return {available:false,pauses:[],activeDuration:null};
  const voiced=samples.map((s,i)=>s.rms>=0.015?i:-1).filter(i=>i>=0);
  if(voiced.length<4)return {available:false,pauses:[],activeDuration:null};
  const first=voiced[0],last=voiced.at(-1); const pauses=[];let silenceStart=null;
  for(let i=first;i<=last;i++) {
    if(samples[i].rms<0.015&&silenceStart===null)silenceStart=samples[i].t;
    if(samples[i].rms>=0.015&&silenceStart!==null){const d=samples[i].t-silenceStart;if(d>=1.5)pauses.push({start:Math.round(silenceStart*10)/10,duration:Math.round(d*10)/10});silenceStart=null;}
  }
  return {available:true,pauses,activeDuration:Math.max(1,samples[last].t-samples[first].t)};
}
export function evaluate({material,transcript='',duration=0,samples=[],pauseAnalysis,recognitionStatus='',corrected=false}) {
  const words=normalize(transcript).length,pauses=pauseAnalysis||analyzePauses(samples),fluency=analyzeFluency(transcript);
  const usable=words>0&&duration>=3;
  const speed=usable?Math.round(words/duration*60):null;
  const alignment=material.mode==='reading'&&usable?alignText(material.text,transcript):null;
  const structure=material.mode!=='reading'&&usable?analyzeStructure(transcript,material.framework):[];
  const advice=[];
  if(!usable)advice.push({title:'本次未形成可比对的转写',detail:duration<3?'录音太短。准备好后，说满一句话再结束。':'请检查浏览器语音识别、网络与麦克风权限。仍可回听录音，或修正转写后做文字比对。'});
  if(alignment) {
    const first=alignment.groups[0];
    if(first)advice.push({title:'先重练这一处',detail:first.type==='omit'?`转写中缺少“${first.ref}”。先回听核实，再把它所在的句子分成两小段，慢读三遍。`:first.type==='insert'?`转写中多出“${first.heard}”。回听确认是否重复或补词，重读时用手指跟着原文走。`:`原文“${first.ref}”被识别成“${first.heard}”。先回听确认，再把这个词单独读清楚，放回句子练两遍。`});
    else advice.push({title:'文字比对很完整',detail:'这次转写和原文一致。下一轮试着在关键词上轻轻加重，让意思更容易被听懂。文字一致不代表发音完全准确。'});
  }
  if(speed!==null&&speed>260)advice.push({title:'把语速放慢一档',detail:`本次转写约${speed}字/分钟。试着每个短句说完停半拍，先按180—260字/分钟的训练参考练习，不必追求快。`});
  if(speed!==null&&speed<120)advice.push({title:'先想一小句，再完整说出来',detail:`本次转写约${speed}字/分钟。录音中的等待和漏识别也会拉低这个数。回听后，把长句分成短句，一次顺畅说完一小句。`});
  if(pauses.pauses.length)advice.push({title:'回听较长停顿',detail:`检测到${pauses.pauses.length}处超过1.5秒的低音量片段。点时间标记回听；若是卡住，先看三个关键词，再用短句复述。自然的思考停顿无需消除。`});
  if(fluency.fillers.length||fluency.repeats.length)advice.push({title:'用短停顿替代填充词',detail:`转写中发现${fluency.fillers.length}处填充词线索、${fluency.repeats.length}处重复词线索。回听确认后，试着在想词时停一拍，再接下一句。`});
  for(const s of structure.filter(s=>!s.found).slice(0,2))advice.push({title:s.name+'可以更明确',detail:s.advice});
  if(usable&&!advice.length)advice.push({title:'再练一遍，让重点更突出',detail:'保留一个核心结论、两个不同的理由和一个具体例子。回听时检查每句话是否都在支持你的结论。'});
  return {words,duration,speed,alignment,structure,fluency,pauses,advice,recognitionStatus,corrected,usable};
}
