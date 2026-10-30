import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,alignText,analyzeStructure,analyzeFluency,analyzePauses,evaluate} from '../dist/evaluation.js';
import {THEMES,FRAMEWORKS,READING_CATEGORIES,FORMAL_READINGS,generateMaterial,initialMaterial,getModel} from '../dist/content.js';
test('punctuation and case do not become reading mistakes',()=>{assert.equal(normalize('你好，世界！ＡＢＣ。'),'你好世界abc');assert.equal(alignText('你好，世界！','你好世界').similarity,100);});
test('reading distinguishes omitted, inserted and changed characters',()=>{assert.equal(alignText('今天天气很好，我想去公园。','今天天气很好我去公园').omitted,1);assert.equal(alignText('我去公园','我想去公园').inserted,1);assert.equal(alignText('我去公园','我去花园').substituted,1);assert.equal(alignText('我我喜欢读书','我喜欢读书').omitted,1);});
test('no speech or a very short recording creates no text assessment',()=>{const base={mode:'reading',text:'今天我要练习说话。',framework:'prep'};for(const input of [{transcript:'',duration:40},{transcript:'今天',duration:1}]){const result=evaluate({material:base,...input});assert.equal(result.alignment,null);assert.equal(result.speed,null);assert.equal(result.usable,false);assert.equal(result.advice[0].title,'本次未形成可比对的转写');}});
test('structure checks depend on the selected framework',()=>{const complete='我认为每天练习很有用。第一，可以整理思路。第二，可以熟悉表达。比如有一次，我练习后更从容。所以我建议每天开口。';assert.equal(analyzeStructure(complete).filter(s=>s.found).length,4);assert.equal(analyzeStructure('今天的天空很蓝，云也很多。').filter(s=>s.found).length,0);assert.equal(analyzeStructure('当时我负责主持活动，目标是把流程讲清楚。我先列出要点，然后逐项核实。最后活动顺利完成，我学到了沟通方法。','star').filter(s=>s.found).length,4);assert.equal(analyzeStructure('我的建议是先明确目标。原因有两点。方案分两步。接下来我会列出清单。','action').filter(s=>s.found).length,4);});
test('silence analysis excludes time before and after speaking',()=>{const samples=Array.from({length:101},(_,i)=>({t:i*.1,rms:(i>=10&&i<=35)||(i>=60&&i<=80)?.05:0}));const result=analyzePauses(samples);assert.equal(result.available,true);assert.equal(result.pauses.length,1);assert.ok(result.pauses[0].duration>=2);assert.equal(analyzePauses(samples.map(s=>({...s,rms:0}))).available,false);});
test('fillers and repeated phrases are identified as clues',()=>{const result=analyzeFluency('嗯，我觉得我们我们应该先想清楚，呃，然后然后再开始。');assert.equal(result.fillers.length,3);assert.ok(result.repeats.length>=1);});
test('expression assessment gives structure advice without reading accuracy',()=>{const result=evaluate({material:{mode:'structure',framework:'prep'},transcript:'这个问题我还没有想好，今天先谈一点自己的感受。',duration:20});assert.equal(result.alignment,null);assert.equal(result.structure.length,4);assert.ok(result.advice.some(a=>a.title.includes('开头有观点')));assert.equal('score'in result,false);});
test('all topic/mode/length combinations generate usable original material',()=>{for(const theme of Object.keys(THEMES))for(const mode of ['reading','structure','impromptu'])for(const length of [1,2,3])for(const framework of Object.keys(FRAMEWORKS)){const material=generateMaterial(mode,theme,length,framework);assert.ok(material.title.length>4);assert.equal(material.framework,framework);assert.ok(mode==='reading'?normalize(material.text).length>100:material.audience.length>3);}});
test('formal reading filters, multi-article lengths and provenance remain consistent',()=>{
  for(const category of Object.keys(READING_CATEGORIES))for(const length of [1,2,3]){
    const material=generateMaterial('reading','life',length,'prep',category);
    assert.equal(material.sections.length,length);assert.equal(new Set(material.sections.map(s=>s.id)).size,length);
    assert.equal(material.text,material.sections.map(s=>s.text).join('\n\n'));
    assert.ok(normalize(material.text).length<=1400,'must fit the alignment engine');
    for(const section of material.sections){assert.ok(section.source.title);assert.ok(section.source.publisher);assert.match(section.source.date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(new URL(section.source.url).protocol,'https:');assert.ok(category==='all'||FORMAL_READINGS.find(r=>r.id===section.id).category===category);}
  }
});
test('reading falls back to the default example category while expression themes remain unchanged',()=>{
  assert.equal(initialMaterial().readingCategory,'policy');assert.equal(generateMaterial('reading','life',1,'prep','missing').readingCategory,'policy');
  for(const theme of Object.keys(THEMES)){const material=generateMaterial('structure',theme,1,'prep','news');assert.equal(material.theme,theme);assert.equal(material.sections,undefined);assert.ok(getModel(material).length>100);}
});
test('repeated reading requests change the first article and label adaptations honestly',()=>{
  for(const category of Object.keys(READING_CATEGORIES)){const first=generateMaterial('reading','life',1,'prep',category),second=generateMaterial('reading','life',1,'prep',category);assert.notEqual(first.sections[0].id,second.sections[0].id);}
  for(const material of FORMAL_READINGS.filter(r=>r.category==='news'||(r.category==='speech'&&r.id!=='speech-cai'))){assert.match(material.kind,/非.*原文/);}
});
