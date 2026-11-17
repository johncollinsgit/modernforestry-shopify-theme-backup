const {webkit}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../assets/theme.js',import.meta.url),'utf8');
const start=source.indexOf('function _replaceContent(html)');
const end=source.indexOf('\n      }\n    }]);',start);
const fn=source.slice(start,end+8);
const browser=await webkit.launch();
try{
 const page=await browser.newPage();
 for(const drawer of [false,true])for(const before of [0,1])for(const after of [0,1]){
  const result=await page.evaluate(({fn,drawer,before,after})=>{
   const markup=n=>`<section data-section-type="cart" data-section-settings='{"itemCount":${n}}'><header class="PageHeader">${n}</header><div class="Drawer__Main">${n?'<form class="Cart">Product</form>':'<p>Empty cart</p>'}</div></section>`;
   document.body.innerHTML='<span class="Header__CartCount"></span><span class="Header__CartDot"></span>'+markup(before);
   window.theme={pageType:drawer?'index':'cart'};window.Dom={nodeListToArray:n=>Array.from(n)};
   const root=document.querySelector('section'),state={element:root,options:{drawer},itemCount:before};
   (0,eval)('('+fn+')').call(state,markup(after));
   return {count:state.itemCount,cart:!!root.querySelector('.Cart'),label:document.querySelector('.Header__CartCount').textContent};
  },{fn,drawer,before,after});
  assert.deepEqual(result,{count:after,cart:!!after,label:String(after)});
 }
 const liquid=await fs.readFile(new URL('../snippets/wlm-head.liquid',import.meta.url),'utf8');
 const script=liquid.slice(liquid.lastIndexOf("<script type='text/javascript'>")+31,liquid.lastIndexOf('</script>')).replace(/\{% if wlmLockON %\}([\s\S]*?)\{% else %\}([\s\S]*?)\{% endif %\}/, '$2');
 for(const present of [false,true]){
  await page.goto("about:blank");
  const result=await page.evaluate(({script,present})=>{let calls=[];delete window.wlm;if(present)window.wlm={navigateByLocation:()=>calls.push('navigate'),jq:()=>({ready:f=>f()}),removeLinks:()=>calls.push('links')};(0,eval)(script);document.dispatchEvent(new Event('DOMContentLoaded'));return calls;},{script,present});
  assert.deepEqual(result,present?['navigate','links']:[]);
 }
 console.log('WebKit: eight cart transitions and WLM available/unavailable regressions passed');
}finally{await browser.close()}
