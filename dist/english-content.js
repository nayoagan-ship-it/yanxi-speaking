// Original practice article prepared for the MIT open-source edition.
export const ARTICLE={
  "id": "original-speaking-club",
  "title": "A Small Speaking Club",
  "unit": "Learning to Speak Clearly",
  "author": "言习项目",
  "source": "言习开源版原创练习文章 · MIT 许可",
  "paragraphs": [
    {
      "id": 1,
      "text": "On Tuesday evening, a small speaking club opened in an empty classroom. There was no stage and no competition. Six students simply placed their chairs in a circle and agreed to give one another time to speak."
    },
    {
      "id": 2,
      "text": "Mia brought a notebook filled with ideas, but she could not decide where to begin. She talked about breakfast, a delayed bus, and a difficult assignment. When she stopped, she realized that her listeners still did not know her main point."
    },
    {
      "id": 3,
      "text": "Instead of asking her to speak faster, the group asked a simple question. What would you like us to remember? Mia thought for a moment and wrote one clear sentence at the top of the page."
    },
    {
      "id": 4,
      "text": "Her second attempt began with that sentence. Then she gave two reasons and described one experience from her week. The story was shorter this time, yet it was easier for everyone to follow."
    },
    {
      "id": 5,
      "text": "The next student wanted to practise English for an oral examination. He knew many words on paper, but speaking them aloud felt unfamiliar. The group suggested starting with a short passage rather than a long presentation."
    },
    {
      "id": 6,
      "text": "First, he listened to a device voice reading one sentence. Next, he repeated it at a comfortable speed. Finally, he played his own recording and chose one detail to practise again."
    },
    {
      "id": 7,
      "text": "A transcript helped him notice a missing word, but the recording told a fuller story. Sometimes the recognition service had misunderstood him. He learned to listen before treating a highlighted difference as a mistake."
    },
    {
      "id": 8,
      "text": "The students also discovered that a pause could be useful. A brief silence gave a listener time to understand a new idea. Their goal was clear communication, rather than filling every second with sound."
    },
    {
      "id": 9,
      "text": "After each turn, the listeners offered one observation and one question. They described what they had understood instead of giving a score. This made the conversation more specific and helped the speaker plan another attempt."
    },
    {
      "id": 10,
      "text": "A structured practice session can begin with one small goal. For example, choose a clear opening and support it with a concrete example. Record a short attempt, listen once, and decide precisely what to try next."
    },
    {
      "id": 11,
      "text": "When you engage with a listener, leave room for a response. Ask what they understood and explain one point again if necessary. Progress can be a clearer sentence, a calmer pause, or the courage to try once more."
    },
    {
      "id": 12,
      "text": "Before leaving, the club agreed to meet again the following week. Nobody promised a perfect speech. Each person wrote down a manageable next step and left with a recording that could guide another day of practice."
    }
  ]
};
export const DEFAULT_PARAGRAPHS=[10,11];
export const WORD_COACH=[
  {word:'structured',us:'ˈstrʌk.tʃɚd',uk:'ˈstrʌk.tʃəd',stress:'STRUC-tured',tip:'重音在开头。把 /str/ 连起来，末尾的 /d/ 不要额外加一个元音。'},
  {word:'unstructured',us:'ʌnˈstrʌk.tʃɚd',uk:'ʌnˈstrʌk.tʃəd',stress:'un-STRUC-tured',tip:'把主重音放在 STRUC 上，un 读轻一些。先慢读辅音群，再连成完整单词。'},
  {word:'precisely',us:'prəˈsaɪs.li',uk:'prɪˈsaɪs.li',stress:'pre-CISE-ly',tip:'主重音在 CISE，/aɪ/ 从前向后滑动，结尾 /s.li/ 连贯而清楚。',url:'https://dictionary.cambridge.org/pronunciation/english/precisely'},
  {word:'fallow',us:'ˈfæl.oʊ',uk:'ˈfæl.əʊ',stress:'FAL-low',tip:'第一音节重读。/æ/ 嘴张开一些，结尾是双元音，不要把两个音节读成一样重。',url:'https://dictionary.cambridge.org/us/dictionary/english/fallow'},
  {word:'engage',us:'ɪnˈɡeɪdʒ',uk:'ɪnˈɡeɪdʒ',stress:'en-GAGE',tip:'重读 GAGE，/eɪ/ 要有滑动，末尾是浊辅音 /dʒ/，不要直接读成 /z/。'},
  {word:'friendship',stress:'FRIEND-ship',tip:'重音在 FRIEND。末尾 /p/ 收住；复数 friendships 的词尾 /ps/ 要连贯，不加“丝”的元音。'},
  {word:'relationships',stress:'re-LA-tion-ships',tip:'把重音放在 LA 上，末尾 ships 的 /ps/ 不要额外添一个音节。'},
  {word:'social',stress:'SO-cial',tip:'第一音节突出，第二音节读轻；注意不要把中间的 /ʃ/ 读成 /s/。'},
  {word:'quality',stress:'QUAL-i-ty',tip:'第一音节突出。按所选英音或美音示范跟读，避免每个音节等长、等重。'},
  {word:'contemporary',stress:'con-TEM-po-rary',tip:'主重音放在 TEM。先分音节慢读，再逐渐缩短非重读音节。'},
  {word:'individual',stress:'in-di-VID-u-al',tip:'把 VID 读得更突出，其余音节保持轻而连贯。'},
  {word:'connectivity',stress:'con-nec-TIV-i-ty',tip:'主重音在 TIV。先按音节读准，再把非重读部分连起来。'}
];
export function splitSentences(text){return String(text).match(/[^.!?]+(?:[.!?]+[”’"']*|$)/g)?.map(s=>s.trim()).filter(Boolean)||[];}
export function selectParagraphs(article=ARTICLE,ids=DEFAULT_PARAGRAPHS){
  const wanted=new Set(ids.map(Number));
  const selected=article.paragraphs.filter(p=>wanted.has(p.id)).slice(0,2);
  return selected.length?selected:[article.paragraphs[0]];
}
export function makeExercise(article=ARTICLE,ids=DEFAULT_PARAGRAPHS,practice='sentence',sentenceIndex=0){
  const paragraphs=selectParagraphs(article,ids),sentences=paragraphs.flatMap(p=>splitSentences(p.text).map(text=>({text,paragraphId:p.id})));
  const index=Math.max(0,Math.min(sentences.length-1,Number(sentenceIndex)||0));
  return {articleId:article.id,articleTitle:article.title,paragraphIds:paragraphs.map(p=>p.id),paragraphs,sentences,sentenceIndex:index,practice,
    title:`${article.title} · 第 ${paragraphs.map(p=>p.id).join('、')} 段`,
    text:practice==='passage'?paragraphs.map(p=>p.text).join('\n\n'):sentences[index].text};
}
export function wordCoaches(text){const lower=String(text).toLowerCase();return WORD_COACH.filter(w=>new RegExp('\\b'+w.word+'s?\\b').test(lower)).slice(0,5);}
export function sentenceGuide(text){
  const question=/\?\s*$/.test(text);
  const wh=question&&/\b(who|what|where|when|why|how|which)\b/i.test(text.slice(0,45));
  return {ending:question&&!wh?'rise':'fall',label:question?(wh?'特殊疑问句通常可自然降调 ↘':'一般疑问句可尝试升调 ↗'):'陈述句通常可自然降调 ↘',
    detail:'跟读参考，语境不同可以有其他语调。斜线表示建议意群边界，粗体表示可突出的实词，不是唯一正确读法。'};
}
export function parseImportedArticle(title,text){
  const blocks=String(text).trim().split(/\n\s*\n+/).map(s=>s.replace(/\n/g,' ').trim()).filter(Boolean);
  if(!blocks.length||blocks.length>30||String(text).length>18000)throw new Error('请录入 1—30 个自然段，全文不超过 18000 字符。');
  if(blocks.some(p=>p.length>5000))throw new Error('有一段过长，请用空行分开自然段。');
  if(!/[a-z]{3}/i.test(text))throw new Error('请粘贴英文印刷正文。');
  return {id:crypto.randomUUID(),title:String(title).trim().slice(0,100)||'我的英文文章',source:'用户自行录入的英文正文',paragraphs:blocks.map((text,i)=>({id:i+1,text}))};
}
