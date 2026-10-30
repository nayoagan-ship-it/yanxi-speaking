import {createEnglishModule} from './english-app.js';
import {THEMES,MODES,FRAMEWORKS,READING_CATEGORIES,generateMaterial,getModel} from './content.js';
import {normalize,evaluate} from './evaluation.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clock=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const readLocal=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('yanxi-'+key))??fallback;}catch{return fallback;}};
const writeLocal=(key,value)=>{try{localStorage.setItem('yanxi-'+key,JSON.stringify(value));return true;}catch{return false;}};
const storedSettings=readLocal('settings',{});
const settings={theme:'life',length:1,framework:'prep',readingCategory:'policy',...storedSettings};
if(!READING_CATEGORIES[settings.readingCategory])settings.readingCategory='policy';
if(!THEMES[settings.theme])settings.theme='life';
if(!FRAMEWORKS[settings.framework])settings.framework='prep';
if(![1,2,3].includes(Number(settings.length)))settings.length=1;
const savedHistory=readLocal('history',[]),savedFavorites=readLocal('favorites',[]);
let history=Array.isArray(savedHistory)?savedHistory.filter(r=>r?.id&&r?.material&&r?.analysis):[];
let favorites=Array.isArray(savedFavorites)?savedFavorites.filter(m=>m?.id&&MODES[m.mode]):[];
let language=readLocal('language','zh')==='en'?'en':'zh';
let view='practice',mode=['reading','structure','impromptu'].includes(settings.mode)?settings.mode:'structure';
let material=createMaterial();
let showPauses=false,largeText=false,showFramework=mode!=='impromptu',session=null,busy=false,ttsPlaying=false,prepTimer=null,prepRemaining=0,reportRecord=null,installPrompt=null;
const transientAudio=new Map();let activeAudioUrl=null,toastTimer=null;
let databasePromise;
function database(){
  if(!databasePromise)databasePromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('yanxi-audio',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('recordings');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('storage blocked'));
  });
  return databasePromise;
}
async function audioStore(action,id,blob){
  try{const db=await database();return await new Promise((resolve,reject)=>{
    const tx=db.transaction('recordings',action==='get'?'readonly':'readwrite'),store=tx.objectStore('recordings');
    const req=action==='get'?store.get(id):action==='put'?store.put(blob,id):store.delete(id);
    let result;req.onsuccess=()=>result=req.result;req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(action==='get'?result:true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}catch{return action==='get'?null:false;}
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function isLocked(){if(session||busy||english.isBusy()){toast('请先结束本次练习，再进行切换');return true;}return false;}
function stopTTS(){if('speechSynthesis'in window)speechSynthesis.cancel();ttsPlaying=false;const el=$('[data-action="listen"] span');if(el)el.textContent='听示范';}
function stopPreparation(){clearInterval(prepTimer);prepTimer=null;prepRemaining=0;}
function saveSettings(){settings.mode=mode;if(mode==='reading'&&READING_CATEGORIES[material.readingCategory])settings.readingCategory=material.readingCategory;writeLocal('settings',settings);}
function createMaterial(){return generateMaterial(mode,settings.theme,Number(settings.length),settings.framework,settings.readingCategory);}
function todaySeconds(){const date=new Date().toLocaleDateString('zh-CN');return history.filter(r=>new Date(r.date).toLocaleDateString('zh-CN')===date).reduce((total,r)=>total+r.duration,0);}
const paragraphs=text=>String(text).split(/\n\n+/).map(p=>`<p>${esc(p)}</p>`).join('');
function articleHTML(text){return String(text).split(/\n\n+/).map(p=>`<p>${Array.from(p).map(c=>esc(c)+(showPauses&&/[，、；：。！？]/.test(c)?`<span class="pause-mark" aria-hidden="true">${/[。！？]/.test(c)?'∥':'/'}</span>`:'')).join('')}</p>`).join('');}
function heroHTML(){const seconds=todaySeconds();return `<section class="hero"><div class="eyebrow">A LITTLE BETTER, EVERY DAY</div><h1>把想法，<br><span>说得更好。</span></h1><p class="hero-sub">说得顺 · 想得清 · 表达有条理</p><div class="voice-art" aria-hidden="true"><div class="art-disc"></div><div class="art-orbit"></div><div class="art-wave">${'<i></i>'.repeat(7)}</div><span class="art-star">✧</span><span class="art-dot"></span></div></section><div class="daily-progress"><span>今日已练 <strong>${Math.floor(seconds/60)} 分钟</strong></span><div class="progress-track"><i style="width:${Math.min(seconds/600*100,100)}%"></i></div><span>目标 10 分钟</span></div>`;}
function tabsHTML(){return `<div class="mode-tabs" role="tablist" aria-label="练习方式">${[['reading','朗读练习','把话说顺'],['structure','结构表达','把话说清'],['impromptu','即兴表达','把话说稳']].map(([id,label,sub])=>`<button role="tab" aria-selected="${mode===id}" data-mode="${id}" class="${mode===id?'active':''}">${label}<small>${sub}</small></button>`).join('')}</div>`;}
function readingLabel(m){return m.custom?'自选材料':READING_CATEGORIES[m.readingCategory]||THEMES[m.theme]||'历史素材';}
function readingFiltersHTML(){const current=READING_CATEGORIES[material.readingCategory]?material.readingCategory:settings.readingCategory;return `<div class="reading-filters" role="group" aria-label="朗读素材类型">${Object.entries(READING_CATEGORIES).map(([id,label])=>`<button data-reading-category="${id}" class="${id===current?'active':''}" aria-pressed="${id===current}">${label}</button>`).join('')}</div>`;}
function readingTextHTML(m){if(!m.sections?.length)return articleHTML(m.text);return m.sections.map((section,index)=>`${m.sections.length>1?`<h4 class="reading-section-title">${String(index+1).padStart(2,'0')} · ${esc(section.title)}</h4>`:''}${articleHTML(section.text)}`).join('');}
function readingSourcesHTML(m){if(!m.sections?.length)return `<div class="reading-sources"><p>${m.custom?'自选文字 · 来源由你自行确认':'历史练习稿 · 未记录外部来源'}</p></div>`;return `<div class="reading-sources"><p class="source-heading">材料出处 · ${m.sections.length>1?'联读仅需朗读各篇正文':'仅需朗读上方正文'}</p>${m.sections.map((section,index)=>`<div class="source-entry"><span class="source-kind">${m.sections.length>1?(index+1)+' · ':''}${esc(section.kind)}</span><a href="${esc(section.source.url)}" target="_blank" rel="noopener noreferrer">${esc(section.source.title)} ↗</a><p>${esc(section.source.publisher)}<br>${esc(section.source.dateLabel||'来源页日期')}：${esc(section.source.date)}</p></div>`).join('')}<p class="source-footnote">开源版使用原创练习示例。政策与新闻场景均为练习设定，不代表真实政策文件或新闻报道。</p></div>`;}
function materialHTML(){const saved=favorites.some(m=>m.id===material.id),count=normalize(material.text).length;const steps=FRAMEWORKS[material.framework].steps;
  return `<div class="section-heading"><h2>${mode==='reading'?'练习材料，读得更稳':mode==='structure'?'把一个想法，说清楚':'给自己一个小挑战'}</h2><button class="text-button" data-action="settings">${icon('tune')}练习设置</button></div><div class="material-settings"><span class="pill green">${esc(mode==='reading'?readingLabel(material):THEMES[material.theme])}</span><span class="pill"><i class="dot"></i>${mode==='reading'?`约 ${Math.max(1,Math.round(count/220))} 分钟`:`${material.length} 分钟表达`}</span><span class="pill">${mode==='reading'?esc(material.sourceLabel||(material.custom?'自选文本':'历史练习稿')):esc(FRAMEWORKS[material.framework].short)}</span></div>${mode==='reading'?readingFiltersHTML():''}<article class="reading-card"><div class="card-top"><span class="card-label">${mode==='reading'?'READ ALOUD':mode==='structure'?'THINK · ORGANIZE · SPEAK':'A MOMENT TO SPEAK'} / ${String((material.seed??0)+1).padStart(2,'0')}</span><button class="favorite-button ${saved?'saved':''}" data-action="favorite" aria-label="${saved?'取消收藏':'收藏本篇'}" aria-pressed="${saved}">${icon('bookmark')}</button></div><h3>${esc(material.title)}</h3>${mode==='reading'?`<div class="article ${largeText?'large':''}" id="reading-text">${readingTextHTML(material)}</div>${readingSourcesHTML(material)}<div class="card-footer"><span>${count} 字 · 只读正文</span><button class="pause-toggle ${showPauses?'on':''}" data-action="pauses" aria-pressed="${showPauses}"><span class="switch"></span>停顿提示</button></div>`:`<p class="question-audience">${esc(material.audience)}<br><strong>可用例子：</strong>${esc(material.example)}</p>${mode==='structure'||showFramework?`<div class="framework-title">${esc(FRAMEWORKS[material.framework].name)}</div><div class="steps">${steps.map(([name,starter,detail],i)=>`<div class="step"><span class="step-number">${i+1}</span><div><b>${esc(name)}</b><p>${esc(starter)}</p><small>${esc(detail)}</small></div></div>`).join('')}</div>`:`<div class="prep-box"><b>先在心里列三个关键词</b>一个核心观点、两个理由、一个具体例子。<br>准备好后，试着完整说 ${material.length} 分钟。</div>`}${mode==='impromptu'?`<div class="preparation"><span id="prep-label">先想清楚，再开口</span><button class="text-button" data-action="prepare">${icon('clock')}<span class="prep-count">准备 30 秒</span></button></div><button class="text-button full mt" data-action="framework">${showFramework?'收起表达框架，挑战一下':'卡住了？看看表达框架'}</button>`:''}<details class="fold"><summary>看看表达示范 <span class="small-note">· 参考结构，换成自己的经历</span></summary><div class="model-text">${esc(getModel(material))}</div></details>`}</article><button class="generate-button" data-action="generate">${icon('refresh')}${mode==='reading'?'换一份正式材料':'换一个练习话题'}</button><div class="coach-tip">${icon('spark')}<div><strong>${mode==='reading'?'正式表达，稳一点。':'先有骨架，再有内容。'}</strong>${mode==='reading'?esc(material.practiceHint||'按意群停顿，长句先抓主干，再展开修饰内容。'):'先说结论，用“第一、第二”串起理由，再用一句话收尾。'}</div></div>`;
}
function recorderHTML(){return `<section class="recorder ${session?'recording':''}" aria-label="录音练习"><div class="timer-row"><span class="timer-dot"></span><span id="timer-status">${session?'正在练习':'准备好了，就开口吧'}</span></div><div class="timer" id="timer">${session?clock((performance.now()-session.start)/1000):'00:00'}</div><div class="live-wave" aria-hidden="true">${Array.from({length:17},(_,i)=>`<i style="--h:${[4,8,13,6,16,9,21,14,8,19,11,17,7,12,5,9,4][i]}px"></i>`).join('')}</div><div class="record-controls"><button class="record-side" data-action="listen" ${session?'disabled':''}>${icon('headphones')}<span>听示范</span></button><button class="record-main" data-action="record" aria-label="${session?'结束并自动评价':'开始录音练习'}" ${busy?'disabled':''}>${session?'<span class="stop-square"></span>':icon('mic')}</button><button class="record-side" data-action="${mode==='reading'?'font':'framework'}" ${session?'disabled':''}>${mode==='reading'?'<span style="font-size:20px;font-family:Georgia">A<span style="font-size:13px">a</span></span>':icon('book')}<span>${mode==='reading'?'调整字号':'表达框架'}</span></button></div><p class="record-caption" id="record-caption">${session?'结束并自动评价':mode==='reading'?'开始朗读':'开始表达'}</p><p class="privacy-note">录音仅保存在本机 · 语音识别由浏览器提供<br>首次使用需允许麦克风；识别可能需要网络</p><div id="record-status" class="record-status" role="status"></div><div id="live-transcript" class="live-text" ${session?'':'hidden'}><small>实时转写 · 结束后自动分析</small><span id="final-transcript">${esc(session?.transcript||'')}</span><span id="interim-transcript" class="live-interim"></span></div></section>`;}
function render(){
  document.body.dataset.language=language;
  document.querySelectorAll('[data-language]').forEach(button=>{button.classList.toggle('active',button.dataset.language===language);button.setAttribute('aria-pressed',String(button.dataset.language===language));});
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
  if(language==='en'){english.render(view);return;}
  if(view==='practice')$('#app').innerHTML=`<div class="section-fade">${heroHTML()}${tabsHTML()}${materialHTML()}${recorderHTML()}</div>`;
  if(view==='history')renderHistory();if(view==='favorites')renderFavorites();
}
function renderHistory(){const total=history.reduce((n,r)=>n+r.duration,0),days=new Set(history.map(r=>new Date(r.date).toLocaleDateString('zh-CN'))).size;$('#app').innerHTML=`<div class="section-fade"><div class="page-heading"><div class="eyebrow">YOUR VOICE, YOUR GROWTH</div><h1>每一次开口，都算数。</h1><p>回听、找到一处不足，再练一次。</p></div><div class="stat-grid"><div class="stat"><b>${history.length}</b><span>次练习</span></div><div class="stat"><b>${Math.floor(total/60)}</b><span>累计分钟</span></div><div class="stat"><b>${days}</b><span>练习天数</span></div></div>${history.length?history.map(r=>`<button class="list-card" data-record="${esc(r.id)}"><span class="pill green">${esc(MODES[r.material.mode])}</span><h3>${esc(r.material.title)}</h3><p><span>${esc(new Date(r.date).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))} · ${clock(r.duration)} · ${r.analysis.words?r.analysis.words+' 字转写':'未获得转写'}</span>${icon('chevron')}</p></button>`).join(''):`<div class="empty">${icon('chart')}<h3>你的第一条练习记录，在等你</h3><p>完成一次录音，自动保存练习复盘。<br>不必完美，先勇敢开口。</p><button class="simple-button primary" data-action="back-practice">去练习 ${icon('arrow')}</button></div>`}<p class="storage-note">记录和录音保存在当前设备的浏览器中，保留最近 30 次。换设备、清理浏览器数据不会同步保留，重要录音请下载。</p></div>`;}
function renderFavorites(){$('#app').innerHTML=`<div class="section-fade"><div class="page-heading"><div class="eyebrow">WORDS WORTH REVISITING</div><h1>留给下次，再练一遍。</h1><p>${favorites.length?'已收藏 '+favorites.length+' 份练习材料':'把喜欢的文章和话题，放在这里。'}</p></div>${favorites.length?favorites.map(m=>`<button class="list-card" data-favorite="${esc(m.id)}"><span class="pill green">${esc(MODES[m.mode])}</span><h3>${esc(m.title)}</h3><div class="excerpt">${esc(m.text||m.audience+' · '+FRAMEWORKS[m.framework].name)}</div><p class="mt"><span>打开并练习</span>${icon('chevron')}</p></button>`).join(''):`<div class="empty">${icon('bookmark')}<h3>好材料，值得再读一次</h3><p>点击练习卡片右上角的收藏图标，<br>下次就能在这里找到它。</p><button class="simple-button primary" data-action="back-practice">发现练习材料 ${icon('arrow')}</button></div>`}<p class="storage-note">收藏仅保存在当前浏览器，最多保存 100 份。</p></div>`;}
function changeView(next){if(isLocked())return;stopTTS();english.stopPlayback();stopPreparation();view=next;render();window.scrollTo({top:0,behavior:'smooth'});}
function nextMaterial(){if(isLocked())return;stopTTS();stopPreparation();material=createMaterial();showFramework=mode!=='impromptu';render();toast(mode==='reading'?'新的朗读材料准备好了':'换好话题了，先想三个关键词');}
function favorite(){const index=favorites.findIndex(m=>m.id===material.id);if(index>=0)favorites.splice(index,1);else if(favorites.length>=100){toast('收藏已满，请先移除一份材料');return;}else favorites.unshift(structuredClone(material));if(!writeLocal('favorites',favorites))toast('浏览器存储不可用，收藏仅在本次页面保留');else toast(index>=0?'已取消收藏':'已收藏，随时回来重练');render();}
const sheet=$('#sheet');
function closeSheet(){sheet.close();reportRecord=null;if(activeAudioUrl){URL.revokeObjectURL(activeAudioUrl);activeAudioUrl=null;}const audio=$('#report-audio');if(audio)audio.pause();}
function openSheet(title,content){$('#sheet-content').innerHTML=`<div class="sheet-heading"><h2 id="sheet-title">${title}</h2><button class="icon-button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button></div>${content}`;if(!sheet.open)sheet.showModal();sheet.scrollTop=0;}
function openSettings(){
  if(isLocked())return;stopTTS();
  const labels=mode==='reading'?READING_CATEGORIES:THEMES;
  const selected=mode==='reading'?settings.readingCategory:settings.theme;
  openSheet('为自己选一份练习',`<form id="settings-form"><label class="form-label">${mode==='reading'?'朗读素材类型':'想聊什么？'}</label><div class="form-options">${Object.entries(labels).map(([id,name])=>`<label class="option"><input type="radio" name="${mode==='reading'?'readingCategory':'theme'}" value="${id}" ${selected===id?'checked':''}>${name}</label>`).join('')}</div><label class="form-label">${mode==='reading'?'素材篇数':'练习长度'}</label><div class="form-options three">${[1,2,3].map(n=>`<label class="option"><input type="radio" name="length" value="${n}" ${Number(settings.length)===n?'checked':''}>${n} ${mode==='reading'?'篇':'分钟'}<small>${mode==='reading'?['约 1—2 分钟','约 2—3 分钟','约 3—5 分钟'][n-1]:['轻松开口','充分展开','完整表达'][n-1]}</small></label>`).join('')}</div>${mode!=='reading'?`<label class="form-label" for="framework-select">表达框架</label><select id="framework-select" name="framework">${Object.entries(FRAMEWORKS).map(([id,f])=>`<option value="${id}" ${settings.framework===id?'selected':''}>${f.name}</option>`).join('')}</select>`:`<label class="form-label" for="custom-text">也可以读自己的文字（选填）</label><textarea id="custom-text" name="custom" maxlength="1000" placeholder="粘贴政策文件、演讲稿或新闻正文，最多 1000 字"></textarea>`}<p class="form-note">${mode==='reading'?'从原创政策、演讲和新闻练读示例中选材；每篇标明材料说明和日期。示例不代表真实政策或新闻，多篇可组成联读，实际用时由字数和语速决定。':'表达话题来自本站原创素材库，可以反复练习，逐渐减少对框架的依赖。'}</p><button class="simple-button primary full" type="submit">${mode==='reading'?'选好，开始练习':'生成练习'} ${icon('arrow')}</button></form>`);
}
function help(){if(isLocked())return;openSheet('每天开口，慢慢进步',`<div class="help-block"><h3>三个练习，把话说明白</h3><p>朗读：选读原创政策、演讲与新闻练读示例，先读准、再读顺。政策和新闻场景仅用于练习，也可粘贴自己的材料。<br>结构表达：按框架说一个观点或讲一件事。<br>即兴表达：准备 30 秒，再脱离示范完整说一段。</p></div><div class="help-block"><h3>自动评价看什么？</h3><p>朗读对照原文，标记转写中的漏字、多字和疑似读法差异；表达检测观点、分点、例子、总结等语言线索。还会提供转写语速、低音量停顿时间和可见的填充词、重复词线索。</p></div><div class="help-block"><h3>怎样理解评价结果？</h3><p>评价由本地规则生成。语音转写会出错，也可能过滤口头禅；结构提示词不代表论证成立。请结合录音核实。本站不能评定声调、声母韵母或实际逻辑质量，不提供普通话等级分数。语速参考只是本工具的训练目标。</p></div><div class="help-block"><h3>录音与识别</h3><p>录音和记录仅存于本机浏览器。浏览器语音识别可能把音频发送给其服务提供方，识别需要浏览器支持和网络。若识别不可用，仍能录音回听；本站不会生成虚构的文字评价。请在手机的独立浏览器中打开，并允许麦克风权限。</p></div><button class="simple-button full" data-action="install">${icon('download')} 添加到手机桌面</button><p class="form-note">清理浏览器数据会移除本机记录。重要录音请从评价页下载。</p>`);}
function startPreparation(){if(isLocked())return;if(prepTimer){stopPreparation();$('.prep-count').textContent='准备 30 秒';return;}prepRemaining=30;$('.prep-count').textContent='00:30';$('#prep-label').textContent='想好观点、理由、例子';prepTimer=setInterval(()=>{prepRemaining--;const el=$('.prep-count');if(el)el.textContent=clock(prepRemaining);if(prepRemaining<=0){stopPreparation();if(el)el.textContent='重新准备';const label=$('#prep-label');if(label)label.textContent='准备好了，点击下方开始表达';toast('准备时间到了，开始你的表达吧');}},1000);}
function listen(){if(isLocked())return;if(!('speechSynthesis'in window)){toast('当前浏览器不支持朗读示范');return;}if(ttsPlaying){stopTTS();return;}const utterance=new SpeechSynthesisUtterance(mode==='reading'?material.text:getModel(material));utterance.lang='zh-CN';utterance.rate=.88;const voices=speechSynthesis.getVoices();const voice=voices.find(v=>/^zh[-_]CN/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));if(voice)utterance.voice=voice;utterance.onend=()=>stopTTS();utterance.onerror=event=>{if(event.error!=='canceled'&&event.error!=='interrupted')toast('当前浏览器暂时无法播放中文示范');stopTTS();};ttsPlaying=true;const el=$('[data-action="listen"] span');if(el)el.textContent='停止示范';speechSynthesis.speak(utterance);}

function recognitionMessage(error){return ({'not-allowed':'语音识别未获授权，本次仍可录音回听。','service-not-allowed':'浏览器的识别服务不可用，本次仍可录音回听。','network':'语音识别网络不可用，本次仍可录音回听。','audio-capture':'识别服务未能获取音频，请回听本次录音。','language-not-supported':'识别服务暂不支持中文，本次仍可录音回听。'})[error]||'语音识别暂不可用，本次仍可录音回听。';}
function startRecognition(s){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){s.recognitionStatus='当前浏览器不支持语音转写，本次可录音回听。';$('#record-status').textContent=s.recognitionStatus;return;}
  let committed='',cycleFinal='',cycleInterim='',cycleEnded=true,attempts=0;
  const rec=new Recognition();s.recognition=rec;rec.lang='zh-CN';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  const update=()=>{s.transcript=committed+cycleFinal;const final=$('#final-transcript'),interim=$('#interim-transcript');if(final)final.textContent=s.transcript;if(interim)interim.textContent=cycleInterim;};
  rec.onresult=event=>{cycleFinal='';cycleInterim='';for(let i=0;i<event.results.length;i++){if(event.results[i].isFinal)cycleFinal+=event.results[i][0].transcript;else cycleInterim+=event.results[i][0].transcript;}update();};
  rec.onstart=()=>{cycleEnded=false;const status=$('#record-status');if(status)status.textContent='正在听你说话…';};
  rec.onerror=event=>{if(event.error==='no-speech'||event.error==='aborted')return;s.recognitionStatus=recognitionMessage(event.error);if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(event.error))attempts=3;else attempts++;const status=$('#record-status');if(status)status.textContent=s.recognitionStatus;};
  rec.onend=()=>{committed+=cycleFinal;cycleFinal='';cycleInterim='';cycleEnded=true;update();if(!s.running){s.recognitionDone?.();return;}if(attempts<3){s.restartTimer=setTimeout(()=>{if(!s.running)return;try{rec.start();}catch{s.recognitionStatus='语音识别已中断，请结合录音回听。';}},500);}else{const status=$('#record-status');if(status)status.textContent=s.recognitionStatus;}};
  s.finishRecognition=()=>new Promise(resolve=>{if(cycleEnded){resolve();return;}s.recognitionDone=resolve;try{rec.stop();}catch{resolve();}setTimeout(resolve,1800);});
  try{rec.start();}catch{s.recognitionStatus='无法启动语音识别，本次可录音回听。';$('#record-status').textContent=s.recognitionStatus;}
}
async function startRecording(){
  if(busy)return;stopTTS();stopPreparation();
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('此浏览器暂不支持网页录音，请在支持录音的手机浏览器中打开');return;}
  busy=true;const button=$('[data-action="record"]');button.disabled=true;$('#record-caption').textContent='正在请求麦克风…';
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if(document.hidden){stream.getTracks().forEach(t=>t.stop());throw new Error('hidden');}
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported?.(m));
    const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
    const s={id:crypto.randomUUID(),material:structuredClone(material),start:performance.now(),running:true,stream,recorder,chunks:[],samples:[],transcript:'',recognitionStatus:'',date:new Date().toISOString()};session=s;
    recorder.ondataavailable=e=>{if(e.data.size)s.chunks.push(e.data);};recorder.onerror=()=>{s.recognitionStatus='录音发生中断，请检查本次音频是否完整。';if(s.running)stopRecording();};
    recorder.start(250);busy=false;render();startRecognition(s);
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(AudioContext){try{s.context=new AudioContext();await s.context.resume();s.source=s.context.createMediaStreamSource(stream);s.analyser=s.context.createAnalyser();s.analyser.fftSize=1024;s.source.connect(s.analyser);s.audioData=new Float32Array(1024);}catch{s.analyser=null;}}
    let lastSample=0;
    const tick=now=>{if(!s.running)return;const elapsed=(now-s.start)/1000;const timer=$('#timer');if(timer)timer.textContent=clock(elapsed);if(s.analyser&&now-lastSample>=100){lastSample=now;s.analyser.getFloatTimeDomainData(s.audioData);let sum=0;for(const v of s.audioData)sum+=v*v;const rms=Math.sqrt(sum/s.audioData.length);s.samples.push({t:Math.round(elapsed*10)/10,rms:Math.round(rms*10000)/10000});document.querySelectorAll('.live-wave i').forEach((el,i)=>el.style.setProperty('--h',Math.min(25,3+rms*200*(1+(i%5))+'').toString()+'px'));}if(elapsed>=300){toast('已达到 5 分钟，正在生成复盘');stopRecording();return;}s.frame=requestAnimationFrame(tick);};s.frame=requestAnimationFrame(tick);
    $('#record-caption')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(error){stream?.getTracks().forEach(t=>t.stop());session=null;busy=false;render();const message=error.name==='NotAllowedError'?'麦克风权限未开启。请在浏览器的网站设置中允许麦克风，再重新开始。':error.name==='NotFoundError'?'没有找到可用麦克风，请检查设备后重试。':error.message==='hidden'?'请回到当前页面后重新开始。':'麦克风暂时不可用，请关闭占用麦克风的应用后重试。';$('#record-status').textContent=message;toast('暂未开始录音');}
}
async function stopRecording(){
  const s=session;if(!s||busy||!s.running)return;busy=true;s.running=false;cancelAnimationFrame(s.frame);clearTimeout(s.restartTimer);s.duration=(performance.now()-s.start)/1000;
  const caption=$('#record-caption');if(caption)caption.textContent='正在整理录音和转写…';const btn=$('[data-action="record"]');if(btn)btn.disabled=true;
  try{
    const audioDone=new Promise(resolve=>{if(s.recorder.state==='inactive'){resolve();return;}s.recorder.onstop=resolve;try{s.recorder.stop();}catch{resolve();}setTimeout(resolve,2400);});
    await Promise.all([audioDone,s.finishRecognition?.()]);
    try{s.recognition?.abort();}catch{}
    s.stream.getTracks().forEach(t=>t.stop());if(s.context)await s.context.close().catch(()=>{});
    const blob=new Blob(s.chunks,{type:s.recorder.mimeType||s.chunks[0]?.type||'audio/webm'});
    const record={id:s.id,material:s.material,date:s.date,duration:Math.round(s.duration*10)/10,transcript:s.transcript,audioType:blob.type,analysis:evaluate({material:s.material,transcript:s.transcript,duration:s.duration,samples:s.samples,recognitionStatus:s.recognitionStatus})};
    if(blob.size){transientAudio.clear();transientAudio.set(record.id,blob);record.audioSaved=await audioStore('put',record.id,blob);}else record.audioSaved=false;
    history.unshift(record);const evicted=history.splice(30);evicted.forEach(r=>audioStore('delete',r.id));
    if(!writeLocal('history',history))toast('浏览器存储空间不足，请下载本次录音');
    session=null;busy=false;render();await openReport(record);
  }catch{session=null;busy=false;s.stream.getTracks().forEach(t=>t.stop());try{s.recognition?.abort();}catch{}s.context?.close().catch(()=>{});render();toast('本次练习未能保存，请检查浏览器存储后重试');}
}
function diffHTML(alignment){return alignment.ops.map(op=>op.type==='match'?esc(op.ref):op.type==='insert'?`<mark class="insert" title="转写多出">+${esc(op.heard)}</mark>`:`<mark class="${op.type}" title="${op.type==='omit'?'转写中缺少':'识别为：'+esc(op.heard)}">${esc(op.ref)}</mark>`).join('');}
function reportHTML(record){
  const a=record.analysis,isReading=record.material.mode==='reading',found=a.structure.filter(s=>s.found).length;
  const firstValue=isReading?(a.alignment?a.alignment.similarity+'%':'—'):(a.usable?found+'/4':'—');
  const lowCoverage=isReading&&a.words&&a.words<normalize(record.material.text).length*.5;
  return `<div class="report-kicker">PRACTICE REFLECTION</div><p class="report-intro">${esc(record.material.title)}<br>${clock(record.duration)} · ${a.corrected?'已修正转写的文字分析':'基于浏览器转写与录音信号的练习分析'}</p>${a.recognitionStatus?`<div class="notice">${esc(a.recognitionStatus)}</div>`:''}${!a.usable?'<div class="notice">本次有效转写不足，暂不评价原文匹配或表达结构。你仍可以回听录音。</div>':''}${lowCoverage?'<div class="notice">本次识别内容少于原文的一半，差异可能来自漏识别或尚未读完。请回听核实后，再决定是否需要重练。</div>':''}<div class="report-metrics"><div class="report-metric"><b>${firstValue}</b><span>${isReading?'原文字符匹配':'结构线索'}</span></div><div class="report-metric"><b>${a.speed??'—'}</b><span>转写字 / 分钟</span></div><div class="report-metric"><b>${a.pauses.available?a.pauses.pauses.length:'—'}</b><span>较长低音量片段</span></div></div><div class="report-section"><h3>回听自己的表达 <small>进步，藏在第二遍里</small></h3><div id="audio-area"><p class="small-note">正在读取本机录音…</p></div><div class="report-actions"><button class="simple-button" data-action="download-audio">${icon('download')}下载录音</button><button class="simple-button" data-action="retry">${icon('refresh')}同题再练</button></div>${a.pauses.pauses.length?`<div class="pause-links mt">${a.pauses.pauses.map(p=>`<button data-seek="${p.start}">${clock(p.start)} · ${p.duration}秒</button>`).join('')}</div><p class="small-note">点时间回听。低音量片段可能是思考、自然停顿或环境噪声变化，不等同于说话卡顿。</p>`:''}</div><div class="report-section"><h3>下一遍，重点练这几处</h3>${a.advice.slice(0,5).map((advice,i)=>`<div class="advice-item"><span class="step-number">${i+1}</span><div><h4>${esc(advice.title)}</h4><p>${esc(advice.detail)}</p></div></div>`).join('')}</div>${a.structure.length?`<div class="report-section"><h3>表达有没有清楚的骨架？</h3>${a.structure.map(s=>`<div class="structure-check ${s.found?'yes':''}"><b>${esc(s.name)}</b><span>${s.found?'✓ 检测到线索':'待补充'}</span></div>`).join('')}<p class="small-note">根据提示词检查结构线索，不代表观点正确或论证成立。回听时确认：每个理由是否都支持同一观点？例子是否与理由相关？</p></div>`:''}${a.alignment?`<div class="report-section"><h3>对照原文，找出差异 <small>请回听确认</small></h3><div class="diff-text">${diffHTML(a.alignment)}</div><p class="diff-legend">橙色虚线：转写缺少 · 红色：读法差异 · 蓝色 +：转写多出<br>去除标点后按字符编辑距离比对；识别错误也会产生差异。</p>${a.alignment.groups.length?`<ul class="diff-list">${a.alignment.groups.slice(0,12).map(g=>`<li><strong>${g.type==='omit'?'疑似漏读':g.type==='insert'?'疑似多读':'疑似读法差异'}</strong>：${g.type==='substitute'?`原文“${esc(g.ref)}” → 识别“${esc(g.heard)}”`:`“${esc(g.ref||g.heard)}”`}</li>`).join('')}</ul>`:'<p class="small-note">本次转写与原文一致。字面一致不代表声调、发音或重音完全准确。</p>'}</div>`:''}${a.usable&&(a.fluency.fillers.length||a.fluency.repeats.length)?`<div class="report-section"><h3>填充与重复线索</h3><p class="transcript">${esc([...a.fluency.fillers,...a.fluency.repeats].map(x=>'“'+x.word+'”').join('、'))}</p><p class="small-note">识别可能省略或误判这些词，请结合录音确认。有意重复、语气表达无需刻意消除。</p></div>`:''}<div class="report-section"><div class="report-title-line"><h3>${a.corrected?'修正后的转写':'本次语音转写'}</h3><button class="text-button" data-action="edit-transcript">识别不准？修正</button></div><p class="transcript mt">${record.transcript?esc(record.transcript):'未获得转写。请检查浏览器语音识别与网络；可以手动补充文字，单独练习文字结构。'}</p><div id="transcript-editor"></div></div><p class="small-note">${a.corrected?'当前结果含手动修正，只代表文本比对及结构线索。':''}语速为转写字符数 ÷ 整段录音时长，含等待时间，180—260 字/分钟仅为本站训练参考。评价不检测声调、声母韵母，也不能判断真实逻辑质量。录音及记录仅保存在本机。</p><button class="text-button danger full mt" data-action="delete-record">删除这次记录与录音</button>`;
}
async function openReport(record){stopTTS();reportRecord=record;openSheet('这一次，比上一次更清楚',reportHTML(record));const blob=transientAudio.get(record.id)||await audioStore('get',record.id);if(reportRecord?.id!==record.id||!sheet.open)return;if(activeAudioUrl)URL.revokeObjectURL(activeAudioUrl);if(blob){activeAudioUrl=URL.createObjectURL(blob);$('#audio-area').innerHTML=`<audio id="report-audio" controls preload="metadata" src="${activeAudioUrl}"></audio>${record.audioSaved?'':'<p class="small-note">录音未能写入本机存储，关闭本页前请下载保存。</p>'}`;}else $('#audio-area').innerHTML='<p class="small-note">未找到本机录音，可能未保存成功或已被浏览器清理。文字复盘仍然保留。</p>';}
async function downloadAudio(){const record=reportRecord;if(!record)return;const blob=transientAudio.get(record.id)||await audioStore('get',record.id);if(!blob){toast('未找到可下载的录音');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`言习-${record.material.title.replace(/[\\/:*?"<>|]/g,'').slice(0,30)}.${blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm'}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function editTranscript(){if(!reportRecord)return;$('#transcript-editor').innerHTML=`<form id="correct-form" class="correct-form"><label for="correct-text">对照录音修正识别结果（不会评定实际发音）</label><textarea id="correct-text" maxlength="3000" required>${esc(reportRecord.transcript)}</textarea><p class="small-note">语音识别可能过滤口头禅；修正后的结果只用于文字比对和结构练习。</p><button class="simple-button primary full" type="submit">重新分析文字</button></form>`;$('#correct-text').focus();}
function retry(){const target=reportRecord?.material;if(!target)return;material=structuredClone(target);mode=material.mode;view='practice';showFramework=mode!=='impromptu';closeSheet();saveSettings();render();window.scrollTo({top:0,behavior:'smooth'});toast('同一道题再练一遍，先改进一个地方');}
async function install(){if(installPrompt){await installPrompt.prompt();installPrompt=null;return;}openSheet('把言习放到手机桌面',`<div class="help-block"><h3>iPhone / iPad</h3><p>在 Safari 中打开网页，点击分享按钮，再选择“添加到主屏幕”。</p></div><div class="help-block"><h3>安卓手机</h3><p>在浏览器菜单中，选择“安装应用”或“添加到主屏幕”。具体名称由浏览器决定。</p></div><p class="form-note">首次联网打开后，练习素材可以离线使用；自动语音识别由浏览器提供，可能仍需要网络。</p><button class="simple-button primary full" data-action="close-sheet">知道了</button>`);}

const english=createEnglishModule({root:$('#app'),notify:toast,onViewChange(next){view=next;document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('selected',button.dataset.view===next);button.setAttribute('aria-current',button.dataset.view===next?'page':'false');});}});

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.language){if(isLocked())return;stopTTS();stopPreparation();english.stopPlayback();language=button.dataset.language;view='practice';writeLocal('language',language);render();window.scrollTo({top:0,behavior:'smooth'});return;}
  if(button.dataset.view){changeView(button.dataset.view);return;}
  if(language==='en')return;
  if(button.dataset.mode){if(isLocked())return;stopTTS();stopPreparation();mode=button.dataset.mode;material=createMaterial();showFramework=mode!=='impromptu';saveSettings();render();return;}
  if(button.dataset.readingCategory){if(isLocked())return;stopTTS();stopPreparation();settings.readingCategory=button.dataset.readingCategory;material=createMaterial();saveSettings();render();return;}
  if(button.dataset.record){const record=history.find(r=>r.id===button.dataset.record);if(record)openReport(record);return;}
  if(button.dataset.favorite){const selected=favorites.find(m=>m.id===button.dataset.favorite);if(selected){material=structuredClone(selected);mode=material.mode;view='practice';showFramework=mode!=='impromptu';saveSettings();render();window.scrollTo({top:0,behavior:'smooth'});}return;}
  if(button.dataset.seek){const audio=$('#report-audio');if(audio){audio.currentTime=Number(button.dataset.seek);audio.play().catch(()=>toast('请点击播放器开始回听'));}return;}
  const action=button.dataset.action;
  if(action==='settings')openSettings();if(action==='generate')nextMaterial();if(action==='favorite'){if(!isLocked())favorite();}
  if(action==='pauses'){if(!isLocked()){showPauses=!showPauses;render();}}if(action==='font'){if(!isLocked()){largeText=!largeText;render();}}
  if(action==='framework'){if(isLocked())return;if(mode==='structure'){openSheet('先理清四步，再开口',`<div class="steps">${FRAMEWORKS[material.framework].steps.map(([name,starter,detail],i)=>`<div class="step"><span class="step-number">${i+1}</span><div><b>${esc(name)}</b><p>${esc(starter)}</p><small>${esc(detail)}</small></div></div>`).join('')}</div><p class="form-note mt">下一轮尝试收起提示，用自己的语言说一遍。结构不是固定台词，关键是让听众跟上你的思路。</p>`);}else{showFramework=!showFramework;render();}}
  if(action==='listen')listen();if(action==='prepare')startPreparation();if(action==='record'){if(session)await stopRecording();else await startRecording();}
  if(action==='close-sheet')closeSheet();if(action==='back-practice')changeView('practice');if(action==='install')install();if(action==='retry')retry();if(action==='download-audio')downloadAudio();if(action==='edit-transcript')editTranscript();
  if(action==='delete-record'&&reportRecord){$('#transcript-editor').innerHTML=`<div class="notice mt">删除后，这次记录及本机录音将无法恢复。<button class="simple-button danger full mt" data-action="confirm-delete">确认删除</button></div>`;$('#transcript-editor').scrollIntoView({block:'center',behavior:'smooth'});}
  if(action==='confirm-delete'&&reportRecord){const id=reportRecord.id;history=history.filter(r=>r.id!==id);writeLocal('history',history);await audioStore('delete',id);transientAudio.delete(id);closeSheet();render();toast('已删除这次练习');}
});
document.addEventListener('submit',event=>{
  if(event.target.id==='settings-form'){
    event.preventDefault();if(isLocked())return;
    const data=new FormData(event.target);
    settings.theme=data.get('theme')||settings.theme;
    settings.readingCategory=data.get('readingCategory')||settings.readingCategory;
    settings.length=Number(data.get('length'));settings.framework=data.get('framework')||settings.framework;
    const custom=String(data.get('custom')||'').trim();
    if(custom&&normalize(custom).length<10){toast('请至少输入 10 个字，方便完成一次练习');return;}
    material=createMaterial();
    if(custom){material={id:crypto.randomUUID(),mode:'reading',theme:settings.theme,length:settings.length,framework:settings.framework,title:'我的朗读材料',text:custom.slice(0,1000),custom:true,sourceLabel:'自选文本',readingCategory:'custom'};}
    saveSettings();closeSheet();render();toast('练习材料已准备好');
  }
  if(event.target.id==='correct-form'){event.preventDefault();if(!reportRecord)return;const text=$('#correct-text').value.trim();if(!normalize(text)){toast('请输入有效的中文或文字内容');return;}reportRecord.transcript=text;reportRecord.analysis=evaluate({material:reportRecord.material,transcript:text,duration:reportRecord.duration,pauseAnalysis:reportRecord.analysis.pauses,recognitionStatus:reportRecord.analysis.recognitionStatus,corrected:true});writeLocal('history',history);openReport(reportRecord);toast('已按修正文字重新分析');}
});
$('#help-button').addEventListener('click',()=>language==='en'?english.help():help());
$('.brand').addEventListener('click',event=>{event.preventDefault();changeView('practice');});
sheet.addEventListener('click',event=>{if(event.target===sheet){const rect=sheet.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeSheet();}});
sheet.addEventListener('close',()=>{const audio=$('#report-audio');audio?.pause();if(activeAudioUrl){URL.revokeObjectURL(activeAudioUrl);activeAudioUrl=null;}reportRecord=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTTS();if(session?.running){toast('离开页面，已结束本次录音');stopRecording();}}});
window.addEventListener('beforeunload',()=>{session?.stream?.getTracks().forEach(t=>t.stop());try{session?.recognition?.abort();}catch{}});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();
