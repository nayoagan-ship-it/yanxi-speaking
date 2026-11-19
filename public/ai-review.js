const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reviewInput(record,language){
 const english=language==='en',a=record.analysis||{};
 return {language,mode:english?'reading':record.material.mode,title:english?record.exercise.articleTitle:record.material.title,reference:english?record.exercise.text:record.material.mode==='reading'?record.material.text:'',framework:record.material?.framework||'prep',transcript:record.transcript||'',duration:record.duration,corrected:Boolean(a.corrected),acoustic:{pauses:a.pauses,pitch:english?a.pitch:undefined}};
}
export function pcmWav(samples,sampleRate=16000){
 const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);
 const text=(at,s)=>Array.from(s).forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,36+samples.length*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return new Blob([buffer],{type:'audio/wav'});
}
export async function prepareAudio(blob){
 const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('当前浏览器无法转换录音，请修正转写后进行文字点评。');
 const context=new Context();let audio;try{audio=await context.decodeAudioData(await blob.arrayBuffer());}finally{await context.close();}
 if(audio.duration>301)throw Error('AI 点评支持 5 分钟内的录音，请缩短练习。');
 const count=Math.floor(audio.length*16000/audio.sampleRate),ratio=audio.sampleRate/16000,channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i)),pieces=[],pieceSize=Math.ceil(count/Math.max(1,Math.ceil(count/(120*16000))));
 for(let first=0;first<count;first+=pieceSize){const size=Math.min(pieceSize,count-first),samples=new Float32Array(size);for(let i=0;i<size;i++){const at=(first+i)*ratio,left=Math.floor(at),next=Math.min(left+1,audio.length-1),fraction=at-left;let value=0;for(const channel of channels)value+=channel[left]*(1-fraction)+channel[next]*fraction;samples[i]=value/channels.length;}pieces.push(pcmWav(samples));}
 return pieces;
}
function renderReview(data){
 const r=data.review,m=data.metrics,source={deepseek:'DeepSeek 录音转写',browser:'浏览器转写',corrected:'手动修正文字'}[data.transcription]||'本次转写';
 return `<p class="ai-summary">${escape(r.summary)}</p><div class="ai-metrics"><div><b>${m.similarity===null?'—':escape(m.similarity)+'%'}</b><span>原文文字匹配</span></div><div><b>${m.speed===null?'—':escape(m.speed)}</b><span>${escape(m.speedUnit)}</span></div><div><b>${m.pauses.length}</b><span>较长低音量片段</span></div></div><p class="ai-source">依据：${source}及录音统计 · ${new Date(data.createdAt).toLocaleString('zh-CN')}</p>${r.strengths.length?`<div class="ai-strengths"><h4>这次做得好的地方</h4><ul>${r.strengths.map(s=>`<li>${escape(s)}</li>`).join('')}</ul></div>`:''}<div class="ai-dimensions">${r.dimensions.map(d=>`<div><div><strong>${escape(d.name)}</strong><span>${escape(d.level)}</span></div><p>${escape(d.detail)}</p></div>`).join('')}</div><h4>下一遍，先改这几处</h4>${r.priorities.map(p=>`<article class="ai-priority"><h5>${escape(p.title)}</h5>${p.quote?`<blockquote>${escape(p.quote)}</blockquote>`:''}<p>${escape(p.reason)}</p><p class="ai-action"><strong>练法：</strong>${escape(p.action)}</p></article>`).join('')}<div class="ai-practice"><h4>下一轮小练习</h4><p>${escape(r.practice)}</p></div><details class="ai-transcript"><summary>查看 AI 点评使用的转写</summary><p lang="${data.transcription==='corrected'?'':data.language||''}">${escape(data.transcript)}</p></details><p class="ai-footnote">${escape(data.notice)}</p>`;
}
export function mountAIReview({container,record,language,getAudio,onSave,getCurrent}){
 const input=reviewInput(record,language),fingerprint=JSON.stringify(input),panel=document.createElement('section');panel.className='ai-review-panel';panel.dataset.aiPanel=language;
 panel.innerHTML='<div class="ai-heading"><div><span class="ai-eyebrow">练完，再向前一步</span><h3>DeepSeek AI 复盘</h3></div><span class="ai-badge">AI 练习建议</span></div><div class="ai-content"></div><p class="ai-consent">点击后，会将本次录音（若可用）、选段、转写和统计发送给 DeepSeek。点评保存在当前浏览器。</p><div class="ai-feedback" role="status" aria-live="polite"></div><button type="button" class="simple-button primary ai-request">获取 AI 点评</button>';
 const intro=container.querySelector('.report-intro');if(intro)intro.after(panel);else container.append(panel);
 const body=panel.querySelector('.ai-content'),status=panel.querySelector('.ai-feedback'),button=panel.querySelector('.ai-request');
 const existing=record.aiReview?.fingerprint===fingerprint?record.aiReview:null;
 if(existing){body.innerHTML=renderReview(existing);button.textContent='重新获取点评';}
 let pending=false;
 button.addEventListener('click',async()=>{
  if(pending)return;pending=true;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='正在识别并分析…';status.classList.remove('error');status.textContent='正在准备本次练习，请稍等。';
  try{
   const form=new FormData();form.set('metadata',JSON.stringify(input));let parts=[];
   if(!input.corrected){const audio=await getAudio();if(audio?.size){try{parts=await prepareAudio(audio);}catch(error){if(!input.transcript)throw error;status.textContent='录音转换暂不可用，本次将根据已有转写进行点评。';}}}
   for(let i=0;i<parts.length;i++)form.append('audio',parts[i],`practice-${i}.wav`);
   status.textContent=parts.length?'正在识别录音并整理建议，通常需要十几秒。':'正在根据转写和录音统计整理建议。';
   const response=await fetch('/api/evaluate',{method:'POST',body:form,signal:AbortSignal.timeout(150000)});
   const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'AI 点评暂时不可用，请稍后再试。');
   if(!data.review||!data.metrics)throw Error('点评没有完整返回，请稍后重试。');
   if(JSON.stringify(reviewInput(getCurrent()||record,language))!==fingerprint)throw Error('练习文字已更新，请重新获取 AI 点评。');
   record.aiReview={...data,language,fingerprint};onSave();if(panel.isConnected){body.innerHTML=renderReview(record.aiReview);status.textContent='点评已保存到这次练习记录。';}
  }catch(error){if(panel.isConnected){status.classList.add('error');status.textContent=error.name==='TimeoutError'?'等待超时，本地复盘和录音仍然保留，请稍后重试。':error.message||'AI 点评暂时不可用。';}}
  finally{pending=false;if(panel.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=record.aiReview?'重新获取点评':'重试 AI 点评';}}
 });
 return panel;
}
