(()=>{
const script=document.currentScript,base=new URL('.',script.src);
const studyNav=document.querySelector('.study-nav');
let theme='light';
try{const stored=localStorage.getItem('oge-theme');if(stored==='light'||stored==='dark')theme=stored}catch{}
document.documentElement.dataset.theme=theme;
if(new URLSearchParams(location.search).has('workspace'))document.documentElement.classList.add('workspace-embed');
const nav=studyNav||document.createElement('nav');
let teacher=false;try{teacher=!!(sessionStorage.getItem('oge-teacher-session-v1')||localStorage.getItem('oge-teacher-device-v1'))}catch{}
if(studyNav){
 const menu=nav.querySelector('.study-menu');
 if(teacher){
  const route=document.createElement('a');
  route.href=new URL('tutor-plan/',base);
  route.textContent='Маршрут ОГЭ';
  nav.querySelector('[data-theme-toggle]').before(route);
 }
 document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false});
 menu.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||!menu.open)return;
  menu.open=false;
  menu.querySelector('summary').focus();
 });
}else{
 const items=[['teach.html','🔒 Журнал репетитора'],['index.html','Задачник'],['account.html','Учебный кабинет'],['grafiki.html','Графики'],['forces.html','Силы'],['laboratory.html','Лаборатория'],...(teacher?[['tutor-plan/','Маршрут ОГЭ']]:[])];
 nav.className='site-nav';
 nav.setAttribute('aria-label','Материалы и кабинет');
 nav.innerHTML=items.map(([url,text])=>`<a href="${new URL(url,base).href}" ${location.pathname===new URL(url,base).pathname?'aria-current="page"':''}>${text}</a>`).join('')+'<button type="button" data-theme-toggle></button>';
 document.body.prepend(nav);
}
const button=nav.querySelector('[data-theme-toggle]');
function paint(){
 const light=document.documentElement.dataset.theme==='light';
 button.textContent=light?'Тёмная тема':'Светлая тема';
 if(studyNav)document.querySelector('meta[name="theme-color"]').content=light?'#f5f5ef':'#161d19';
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
 css.href = new URL('frog-helper.css?v=ai-1', base).href;
 document.head.append(css);
 const guide = document.createElement('script');
 guide.src = new URL('frog-guide.js?v=ai-1', base).href;
 guide.onload = () => {
  const helper = document.createElement('script');
  helper.src = new URL('frog-helper.js?v=study-layout-1', base).href;
  document.body.append(helper);
 };
 document.body.append(guide);
}
})();
