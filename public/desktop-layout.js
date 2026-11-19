export function layoutPractice(root){
 const recorder=root.querySelector('.recorder');if(!recorder||root.querySelector('.desktop-practice'))return;
 const parent=recorder.parentElement,nodes=Array.from(parent.children),start=nodes.findIndex(n=>n.classList.contains('section-heading')),at=nodes.indexOf(recorder);if(start<0||at<start)return;
 const grid=document.createElement('div');grid.className='desktop-practice';
 const main=document.createElement('div');main.className='desktop-main';const side=document.createElement('aside');side.className='desktop-side';side.setAttribute('aria-label','录音和练习提示');
 parent.insertBefore(grid,nodes[start]);grid.append(main,side);
 nodes.slice(start,at).forEach(n=>main.append(n));nodes.slice(at).forEach(n=>side.append(n));
 const tip=document.createElement('div');tip.className='desktop-context';tip.innerHTML='<strong>每次只改进一个地方</strong><p>先完成一段，再回听。打开复盘后，可以获取 DeepSeek AI 建议，选一个重点继续练。</p>';side.append(tip);
}
