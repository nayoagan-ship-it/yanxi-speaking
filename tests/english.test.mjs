import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ARTICLE,DEFAULT_PARAGRAPHS,makeExercise,selectParagraphs,splitSentences,parseImportedArticle,wordCoaches} from '../dist/english-content.js';
import {englishTokens,alignWords,estimatePitch,analyzePitch,evaluateEnglish} from '../dist/english-evaluation.js';

test('open-source article has twelve original English paragraphs with clear provenance',()=>{
  assert.equal(ARTICLE.paragraphs.length,12);assert.deepEqual(ARTICLE.paragraphs.map(p=>p.id),Array.from({length:12},(_,i)=>i+1));
  assert.equal(ARTICLE.id,'original-speaking-club');assert.equal(ARTICLE.title,'A Small Speaking Club');assert.match(ARTICLE.source,/原创.*MIT/);
  assert.ok(ARTICLE.paragraphs.every(p=>p.text.length>80));assert.doesNotMatch(ARTICLE.paragraphs.map(p=>p.text).join(' '),/[\u4e00-\u9fff]/);
});

test('default exercise preserves the two selected natural paragraphs verbatim',()=>{
  const ex=makeExercise(ARTICLE,DEFAULT_PARAGRAPHS,'passage');assert.deepEqual(ex.paragraphIds,[10,11]);assert.equal(ex.text,ARTICLE.paragraphs.slice(9,11).map(p=>p.text).join('\n\n'));
  assert.equal(selectParagraphs(ARTICLE,[1,2,3]).length,2);assert.equal(selectParagraphs(ARTICLE,[100])[0].id,1);
});
test('sentence practice neither rewrites the original nor mixes paragraph numbers',()=>{
  const ex=makeExercise(ARTICLE,[10,11],'sentence',999);assert.equal(ex.sentenceIndex,ex.sentences.length-1);assert.equal(ex.text,'Progress can be a clearer sentence, a calmer pause, or the courage to try once more.');assert.equal(ex.sentences.at(-1).paragraphId,11);
  for(const sentence of splitSentences(ARTICLE.paragraphs[9].text))assert.ok(ARTICLE.paragraphs[9].text.includes(sentence));
});
test('English comparison uses words, ignores case and standardizes curly apostrophes',()=>{
  assert.deepEqual(englishTokens('It’s NOT just that.'),["it's",'not','just','that']);assert.equal(alignWords('Put down the device; engage the person.','put down the device engage the person').similarity,100);
  const omit=alignWords('Put down the device.','Put the device.');assert.equal(omit.mistakes[0].ref,'down');assert.equal(omit.mistakes[0].type,'omit');
  const change=alignWords('deeper friendship','deeper relationships');assert.equal(change.mistakes[0].type,'substitute');assert.equal(change.mistakes[0].heard,'relationships');
});
test('pitch estimator measures synthetic 110 and 220 Hz at real recording sample rates',()=>{
  for(const sampleRate of [44100,48000])for(const hz of [110,220]){const signal=Float32Array.from({length:4096},(_,i)=>.12*Math.sin(2*Math.PI*hz*i/sampleRate));const measured=estimatePitch(signal,sampleRate);assert.ok(Math.abs(measured.hz-hz)<2,`${sampleRate} Hz recording, target ${hz}, got ${measured.hz}`);assert.ok(measured.confidence>=.8);}
});
test('silence and nonperiodic noise do not get a fabricated pitch',()=>{
  assert.equal(estimatePitch(new Float32Array(4096),48000).hz,null);let seed=5;const noise=Float32Array.from({length:4096},()=>{seed=(seed*1664525+1013904223)>>>0;return (seed/4294967296-.5)*.2;});assert.equal(estimatePitch(noise,48000).hz,null);assert.equal(analyzePitch([]).available,false);
});
test('pitch contour detects direction without claiming pronunciation correctness',()=>{
  const rising=Array.from({length:61},(_,i)=>({t:i/10,hz:100+i,confidence:.98,rms:.1}));const result=analyzePitch(rising);assert.equal(result.available,true);assert.equal(result.tail.direction,'rise');assert.ok(result.range>3);assert.equal('score'in result,false);
});
test('empty ASR gives no word score but valid local audio observations can remain',()=>{
  const ex=makeExercise(ARTICLE,[11],'passage');const samples=Array.from({length:61},(_,i)=>({t:i/10,hz:130,confidence:.95,rms:.1}));const result=evaluateEnglish({exercise:ex,transcript:'',duration:6,samples});assert.equal(result.alignment,null);assert.equal(result.wpm,null);assert.equal(result.pitch.available,true);assert.equal(result.phonemeAssessmentAvailable,false);
});
test('manual transcript corrections preserve original acoustic summaries',()=>{
  const exercise=makeExercise(ARTICLE,[11],'passage'),acoustic={pitch:{available:true,range:3.1,trace:[],tail:null},pauses:{available:true,pauses:[{start:2,duration:2}],activeDuration:8}};
  const result=evaluateEnglish({exercise,transcript:exercise.text,duration:12,acoustic,corrected:true});assert.equal(result.alignment.similarity,100);assert.deepEqual(result.pitch,acoustic.pitch);assert.equal(result.corrected,true);assert.equal(result.phonemeAssessmentAvailable,false);
});
test('imported article paragraphs retain text and do not acquire built-in provenance',()=>{
  const article=parseImportedArticle('My article','This is the first paragraph.\n\nThis is the second paragraph.');assert.equal(article.paragraphs.length,2);assert.equal(article.paragraphs[1].text,'This is the second paragraph.');assert.equal(article.author,undefined);assert.throws(()=>parseImportedArticle('Bad','纯中文内容'));
  assert.ok(wordCoaches(makeExercise().paragraphs.map(p=>p.text).join(' ')).some(w=>w.word==='engage'));
});
