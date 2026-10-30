import {analyzePauses} from './evaluation.js';
import {sentenceGuide} from './english-content.js';
export const englishTokens=text=>(String(text||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").match(/[a-z]+(?:'[a-z]+)?|\d+(?:\.\d+)?/g)||[]);
export function alignWords(reference,transcript){
  const a=englishTokens(reference),b=englishTokens(transcript);
  if(a.length>600||b.length>1200)return null;
  const width=b.length+1,dp=new Uint16Array((a.length+1)*width);
  for(let i=0;i<=a.length;i++)dp[i*width]=i;
  for(let j=0;j<=b.length;j++)dp[j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i*width+j]=Math.min(dp[(i-1)*width+j]+1,dp[i*width+j-1]+1,dp[(i-1)*width+j-1]+(a[i-1]===b[j-1]?0:1));
  const ops=[];let i=a.length,j=b.length;
  while(i||j){const v=dp[i*width+j];if(i&&j&&a[i-1]===b[j-1]&&v===dp[(i-1)*width+j-1]){ops.push({type:'match',ref:a[--i],heard:b[--j],index:i});}else if(i&&j&&v===dp[(i-1)*width+j-1]+1){ops.push({type:'substitute',ref:a[--i],heard:b[--j],index:i});}else if(i&&v===dp[(i-1)*width+j]+1){ops.push({type:'omit',ref:a[--i],heard:'',index:i});}else{ops.push({type:'insert',ref:'',heard:b[--j],index:i});}}
  ops.reverse();const mistakes=ops.filter(o=>o.type!=='match');
  return {ops,mistakes,referenceWords:a.length,spokenWords:b.length,similarity:Math.max(0,Math.round((1-dp[a.length*width+b.length]/Math.max(a.length,b.length,1))*100))};
}
const quantile=(values,q)=>values[Math.min(values.length-1,Math.floor((values.length-1)*q))];
export function estimatePitch(input,sampleRate){
  if(!input?.length||!Number.isFinite(sampleRate)||sampleRate<4000)return {rms:0,hz:null,confidence:0};
  const step=Math.max(1,Math.floor(sampleRate/8000)),rate=sampleRate/step,n=Math.floor(input.length/step),signal=new Float32Array(n);
  let mean=0,sum=0;
  for(let i=0;i<n;i++){let v=0;for(let k=0;k<step;k++)v+=input[i*step+k];signal[i]=v/step;mean+=signal[i];}mean/=n;
  for(let i=0;i<n;i++){signal[i]-=mean;sum+=signal[i]*signal[i];}
  const rms=Math.sqrt(sum/n);if(rms<.012||n<200)return {rms,hz:null,confidence:0};
  const minLag=Math.floor(rate/450),maxLag=Math.min(Math.ceil(rate/65),Math.floor(n/3)),window=Math.floor(n/2),correlations=new Float32Array(maxLag+2);
  for(let lag=minLag;lag<=maxLag;lag++){let dot=0,powerA=0,powerB=0;for(let k=0;k<window;k++){const a=signal[k],b=signal[k+lag];dot+=a*b;powerA+=a*a;powerB+=b*b;}correlations[lag]=dot/Math.sqrt(powerA*powerB||1);}
  const peaks=[];for(let lag=minLag+1;lag<maxLag;lag++)if(correlations[lag]>=correlations[lag-1]&&correlations[lag]>correlations[lag+1])peaks.push(lag);
  const best=Math.max(0,...peaks.map(lag=>correlations[lag]));if(best<.8)return {rms,hz:null,confidence:best};
  const lag=peaks.find(lag=>correlations[lag]>=Math.max(.8,best*.93));if(!lag)return {rms,hz:null,confidence:best};
  const left=correlations[lag-1],mid=correlations[lag],right=correlations[lag+1],denominator=left-2*mid+right;
  const refined=lag+(denominator?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0);
  return {rms,hz:Math.round(rate/refined*10)/10,confidence:Math.round(mid*100)/100};
}
export function analyzePitch(samples=[]){
  const voiced=samples.filter(s=>Number.isFinite(s.hz)&&s.hz>=65&&s.hz<=450&&s.confidence>=.8);
  if(voiced.length<12)return {available:false,trace:[],range:null,tail:null};
  const values=voiced.map(s=>s.hz).sort((a,b)=>a-b),median=quantile(values,.5),range=12*Math.log2(quantile(values,.9)/quantile(values,.1));
  const end=voiced.at(-1).t,late=voiced.filter(s=>s.t>=end-1.2),early=voiced.filter(s=>s.t>=end-2.8&&s.t<end-1.2);
  let tail=null;
  if(late.length>=4&&early.length>=4){const a=quantile(early.map(s=>s.hz).sort((a,b)=>a-b),.5),b=quantile(late.map(s=>s.hz).sort((a,b)=>a-b),.5),delta=12*Math.log2(b/a);tail={delta:Math.round(delta*10)/10,direction:delta>1.5?'rise':delta<-1.5?'fall':'level'};}
  const stride=Math.max(1,Math.ceil(samples.length/300));
  const trace=samples.filter((_,i)=>i%stride===0).map(s=>({t:Math.round(s.t*10)/10,semitone:s.hz&&s.confidence>=.8?Math.round(12*Math.log2(s.hz/median)*10)/10:null}));
  return {available:true,range:Math.round(range*10)/10,median:Math.round(median),tail,trace};
}
export function evaluateEnglish({exercise,transcript='',duration=0,samples=[],acoustic,corrected=false,recognitionStatus=''}){
  const words=englishTokens(transcript).length,usable=words>0&&duration>=3,alignment=usable?alignWords(exercise.text,transcript):null;
  const pauses=acoustic?.pauses||analyzePauses(samples),pitch=acoustic?.pitch||analyzePitch(samples),wpm=usable?Math.round(words/duration*60):null;
  const advice=[];
  if(!usable)advice.push({title:'先回听，再确认识别是否完整',detail:duration<3?'这次录音太短，请完整读出一句话再结束。':'没有获得有效英文转写，不能进行单词比对。录音和音高线索仍可使用；请检查英语识别、网络和麦克风权限。',kind:'识别状态'});
  if(alignment?.mistakes.length){const m=alignment.mistakes[0];advice.push({title:'先核实这一处单词',detail:m.type==='omit'?`原文的 “${m.ref}” 没有出现在转写里。先回听，确认是否漏读；再听示范，把它放回整个意群中练两遍。`:m.type==='insert'?`转写多出了 “${m.heard}”。回听是否有重复或补词，重练时沿着原文的意群往下读。`:`原文 “${m.ref}” 被识别成 “${m.heard}”。回听核实，再单独听这个词的示范，最后放回句子里读。识别差异不等同于发音错误。`,kind:'转写比对'});}
  if(wpm>180)advice.push({title:'先让关键词读清楚',detail:`这次转写约 ${wpm} 词/分钟。试着放慢一档，在意群之间自然停顿，优先把词尾和重读音节读清楚。`,kind:'转写语速'});
  if(wpm!==null&&wpm<70)advice.push({title:'从逐词读，过渡到意群读',detail:`这次约 ${wpm} 词/分钟，等待和漏识别也会影响这个数。听完一个短意群后连贯复述，减少每个单词之间的额外停顿。`,kind:'转写语速'});
  if(pauses.pauses.length)advice.push({title:'回听这些停顿是否割裂意思',detail:`录音有 ${pauses.pauses.length} 处较长低音量片段。若停在冠词和名词、介词和宾语之间，可以尝试把它们放进同一意群。自然思考、换气和修辞停顿无需全部消除。`,kind:'录音线索'});
  if(pitch.available&&pitch.range<2.5)advice.push({title:'可以试着增加关键词的起伏',detail:'本次可检测的音高变化较小。听示范时选出一到两个关键词，通过轻微延长、适当加重和自然音高变化突出它们。音域小不等于语调错误，环境和嗓音也会影响测量。',kind:'录音线索'});
  if(exercise.practice==='sentence'&&pitch.tail?.direction==='rise'&&sentenceGuide(exercise.text).ending==='fall')advice.push({title:'试着把本句的结尾收稳',detail:'末尾可检测音高呈上扬走势。这句可以尝试自然降调作为对照：前面保持连贯，最后一个重读词后逐渐收住。是否采用降调仍取决于语境，不能只凭曲线判错。',kind:'录音线索'});
  if(!advice.length)advice.push({title:'把清楚，练成自然',detail:'继续用“听一遍—跟一句—回听—重录”的顺序，注意关键词突出、非重读部分轻一些。单词匹配不代表音素或语调完全准确。',kind:'下一步练习'});
  return {words,usable,alignment,wpm,pauses,pitch,advice,corrected,recognitionStatus,phonemeAssessmentAvailable:false};
}
