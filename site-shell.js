(()=>{
const script=document.currentScript,base=new URL('.',script.src);
const studyNav=document.querySelector('.study-nav');
let theme=document.documentElement.dataset.theme||'light';
try{const stored=localStorage.getItem('oge-theme');if(stored==='light'||stored==='dark')theme=stored}catch{}
document.documentElement.dataset.theme=theme;
if(new URLSearchParams(location.search).has('workspace'))document.documentElement.classList.add('workspace-embed');
const nav=studyNav||document.createElement('nav');
const journal=new URL('zhurnal.html',base);
if(location.pathname===journal.pathname)document.body.classList.add('legacy-journal');
let teacher=false;try{teacher=!!(sessionStorage.getItem('oge-teacher-session-v1')||localStorage.getItem('oge-teacher-device-v1'))}catch{}
if(!studyNav){
 const items=[
  ['formuly.html','Формулы'],['grafiki.html','Тренажёр графиков'],
  ['forces.html','Силы и векторы'],['laboratory.html','Лаборатория'],
  ['fipi-mechanics.html','Банк ФИПИ'],['teach.html','Журнал репетитора'],
 ];
 const links=items.map(([file,label])=>{
  const url=new URL(file,base);
  const current=location.pathname===url.pathname?' aria-current="page"':'';
  return `<a href="${url.href}"${current}>${label}</a>`;
 }).join('');
 nav.className='site-nav legacy-nav';
 nav.setAttribute('aria-label','Материалы и кабинет');
 nav.innerHTML=`<a class="site-brand" href="${new URL('index.html',base).href}" aria-label="INVARIANT · Задачник" translate="no">INVARIANT</a>
  <a href="${new URL('account.html',base).href}">Кабинет</a>
  <details class="study-menu"><summary>Ещё</summary><div class="study-menu-links">${links}<button type="button" data-theme-toggle></button></div></details>`;
 document.body.prepend(nav);
}
const menu=nav.querySelector('.study-menu');
const button=nav.querySelector('[data-theme-toggle]');
if(teacher){
 const route=document.createElement('a');
 route.href=new URL('tutor-plan/',base);
 route.textContent='Маршрут ОГЭ';
 button.before(route);
}
document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false});
menu.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||!menu.open)return;
 menu.open=false;
 menu.querySelector('summary').focus();
});
function paint(){
 const light=document.documentElement.dataset.theme==='light';
 button.textContent=light?'Тёмная тема':'Светлая тема';
 const meta=document.querySelector('meta[name="theme-color"]');
 if(!meta)return;
 const background=getComputedStyle(document.documentElement).getPropertyValue('--ui-page').trim();
 if(background)meta.content=background;
}
paint();
button.onclick=()=>{
 const next=document.documentElement.dataset.theme==='light'?'dark':'light';
 document.documentElement.dataset.theme=next;
 try{localStorage.setItem('oge-theme',next)}catch{}
 paint();
};
if(!document.documentElement.classList.contains('workspace-embed')){
 const css = document.createElement('link');
 css.rel = 'stylesheet';
 css.href = new URL('frog-helper.css?v=site-polish-1', base).href;
 document.head.append(css);
 const guide = document.createElement('script');
 guide.src = new URL('frog-guide.js?v=ai-1', base).href;
 guide.onload = () => {
  const helper = document.createElement('script');
  helper.src = new URL('frog-helper.js?v=site-polish-1', base).href;
  document.body.append(helper);
 };
 document.body.append(guide);
}
})();
