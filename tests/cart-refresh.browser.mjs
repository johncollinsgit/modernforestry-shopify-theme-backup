import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
const {parse}=await import(process.env.ACORN_MODULE||'acorn');
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
function functions(source,names) {
 const found={};
 const visit=node=>{
  if(!node||typeof node!=='object')return;
  if(['FunctionExpression','FunctionDeclaration'].includes(node.type)&&names.includes(node.id?.name))found[node.id.name]=source.slice(node.start,node.end);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 };
 visit(parse(source,{ecmaVersion:'latest'}));
 for(const name of names)assert.ok(found[name],`Missing source function ${name}`);
 return found;
}
const theme=fs.readFileSync(process.env.CART_ASSET||'assets/theme.js','utf8');
const cartSource=theme.slice(theme.indexOf('var CartSection ='),theme.indexOf('var CollectionListSection ='));
const methods=functions(cartSource,['_attachListeners','_updateItemQuantity','_reloadPageWithQuantity','_rerenderCart','_replaceContent']);
const rewards=fs.readFileSync('assets/forestry-rewards.js','utf8');
const wishlist=fs.readFileSync('assets/forestry-wishlist.js','utf8');
const wishFns=functions(wishlist,['clean','escapeHtml','shortDate','requiresScentSelection','chooseScentsLabel','drawerItemMarkup','sellingPlanProductUrl','compactAddToCartLabel','injectCompactAddToCart']);
const browser=await webkit.launch();
let passed=0;
try {
 for(const width of [390,1280]) {
  let quantity=1,holdNextCart=0;
  const cart=()=>({item_count:quantity,currency:'USD',total_price:quantity*3000,original_total_price:quantity*3000,items:quantity?[{id:11,quantity,original_line_price:quantity*3000,properties:{}}]:[],cart_level_discount_applications:[]});
  const root=()=>`<div data-forestry-rewards-root data-surface="cart" data-shopify-customer-id="771" data-marketing-profile-id="1" data-empty-cart="${quantity===0}" data-cart-has-eligible-items="${quantity>0}" data-cart-rewards-eligible-subtotal-amount="${quantity*30}" data-endpoint-candle-cash-status="/status"><div class="ForestryRewardsRoot__loading">Candle Cash</div></div>`;
  const section=()=>`<section data-section-type="cart" data-section-settings='{"itemCount":${quantity},"type":"page"}'><header class="PageHeader">Cart</header>${quantity?`<form class="Cart"><div class="CartItemWrapper"><a id="minus" href="/cart/change?quantity=${quantity-1}&line=1" data-action="update-item-quantity" data-line="1" data-quantity="${quantity-1}">Minus</a><input class="QuantitySelector__CurrentQuantity" data-line="1" value="${quantity}"><a id="plus" href="/cart/change?quantity=${quantity+1}&line=1" data-action="update-item-quantity" data-line="1" data-quantity="${quantity+1}">Plus</a></div>${root()}<span class="Cart__TotalPrice">$${quantity*30}.00</span></form>`:`<p>Empty cart</p>${root()}`}</section>`;
  const setup=`window.routes={cartChangeUrl:'/cart/change',cartUrl:'/cart'};window.theme={pageType:'cart'};window.Dom={nodeListToArray:n=>Array.from(n)};class Delegate{constructor(el){this.el=el}on(type,selector,fn){if(typeof selector==='function'){fn=selector;selector=null}this.el.addEventListener(type,e=>{const target=selector?e.target.closest(selector):this.el;if(target)fn(e,target)})}};const el=document.querySelector('[data-section-type="cart"]');window.testCart={element:el,options:{type:'page',drawer:false},itemCount:1,delegateElement:new Delegate(el),documentDelegate:new Delegate(document.documentElement),_onProductAdded(){},_updateCartNote(){}};Object.assign(testCart,{${Object.entries(methods).map(([k,v])=>JSON.stringify(k)+':'+v).join(',')}});testCart._attachListeners();window.documentToken=Math.random();document.querySelector('#add').onclick=async()=>{await fetch('/cart/change.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({line:1,quantity:1})});document.documentElement.dispatchEvent(new CustomEvent('cart:refresh',{bubbles:true}))};`;
  const server=http.createServer(async(req,res)=>{
   const url=new URL(req.url,'http://local');
   const reply=(type,data)=>{res.writeHead(200,{'Content-Type':type});res.end(data)};
   const json=data=>reply('application/json',JSON.stringify(data));
   if(url.pathname==='/rewards.js')return reply('text/javascript',rewards);
   if(url.pathname==='/status')return json({ok:true,data:{profile_id:1,state:'linked_customer',balance:{amount:80},redemption_access:{redeem_enabled:true,mode:'live'},redemption_rules:{redeem_increment_dollars:10,online_minimum_subtotal_cents:4000},cart_reward_available:true,available_rewards:[{id:1,candle_cash_cost:10,reward_value:10}]}});
   if(url.pathname==='/cart.js'){const snapshot=cart();const delay=holdNextCart;holdNextCart=0;if(delay)await new Promise(r=>setTimeout(r,delay));return json(snapshot)}
   if(url.pathname==='/cart/change.js'){let body='';for await(const chunk of req)body+=chunk;quantity=JSON.parse(body).quantity;return json(cart())}
   if(url.pathname==='/cart'&&url.searchParams.has('section_id'))return reply('text/html',section());
   if(url.pathname==='/cart')return reply('text/html',`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><span class="Header__CartCount">1</span><span class="Header__CartDot"></span>${section()}<button id="add">Add again</button><script>${setup}</script><script src="/rewards.js"></script>`);
   res.writeHead(404);res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
   await page.goto(origin+'/cart');
   await page.waitForFunction(()=>document.querySelector('[data-forestry-rewards-root]')?.dataset.forestryRewardsState==='loaded');
   const token=await page.evaluate(()=>window.documentToken);
   await page.evaluate(()=>{window.originalRewardsRoot=document.querySelector('[data-forestry-rewards-root]');window.badStates=[];window.writes=0;new MutationObserver(()=>{window.writes++;const r=window.originalRewardsRoot;if(document.contains(r)&&!r.querySelector('[data-candle-cash-redemption-progress]'))window.badStates.push(r.textContent)}).observe(originalRewardsRoot,{childList:true});});
   const progress=page.getByRole('progressbar');
   for(const [control,expected] of [['#plus',4000],['#minus',3000],['#minus',0],['#add',3000]]) {
    await page.locator(control).click();
    assert.equal(await page.evaluate(()=>window.documentToken),token,'Quantity change must not navigate');
    await page.waitForFunction(expected=>document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')===String(expected),expected);
    assert.equal(await page.evaluate(()=>window.documentToken),token,'Quantity change must not navigate');
    assert.equal(await page.evaluate(()=>document.querySelector('[data-forestry-rewards-root]')===window.originalRewardsRoot),true,'Keep the reward panel');
    passed++;
   }
   holdNextCart=600;
   const staleRead=page.waitForRequest(r=>new URL(r.url()).pathname==='/cart.js');
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('forestry:rewards:refresh')));
   await staleRead;
   await page.locator('#plus').click();
   await page.waitForFunction(()=>document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')==='4000');
   await page.waitForTimeout(900);
   assert.equal(await progress.getAttribute('aria-valuenow'),'4000','An older cart response must not revert the reward');
   assert.deepEqual(await page.evaluate(()=>window.badStates),[],'No generic/loading card during cart changes');
   assert.deepEqual(errors,[]);
   passed++;
   await page.evaluate(code=>{window.runtime={primaryNode:{dataset:{chooseScentsLabel:'Choose scents'}}};(0,eval)(code);window.wishTest={drawerItemMarkup,injectCompactAddToCart}},Object.values(wishFns).join('\n'));
   for(const item of [{product_handle:'5-wax-melts-bundle'},{product_handle:'bulk-discount-8oz-soy-candles'},{product_handle:'fictional',product_requires_scent_selection:true},{product_handle:'regular-candle'}]) {
    const requires=item.product_handle!=='regular-candle';
    const data={product_id:'1',product_variant_id:'11',product_title:'Fictional product',product_url:'/products/'+item.product_handle,...item};
    await page.evaluate(item=>{document.body.insertAdjacentHTML('beforeend','<ul id="wish-test">'+wishTest.drawerItemMarkup(item)+'</ul>')},data);
    assert.equal(await page.locator('#wish-test [data-action="forestry-wishlist-add-to-cart"]').count(),requires?0:1);
    if(requires)assert.equal(await page.locator('#wish-test').getByRole('link',{name:'Choose scents'}).getAttribute('href'),data.product_url);
    await page.locator('#wish-test').evaluate(e=>e.remove());
    passed++;
   }
   for(const data of [{productHandle:'5-wax-melts-bundle'},{productHandle:'regular-candle'},{productHandle:'fictional',productRequiresScentSelection:'true'},{productHandle:'candle-club',productRequiresSellingPlan:'true',productDefaultSellingPlanId:'44'}]) {
    const needsPage=data.productHandle!=='regular-candle';
    const result=await page.evaluate(data=>{const info=document.createElement('div');info.className='ProductItem__Info';const root=document.createElement('div');root.className='ForestryWishlistRoot--compact';Object.assign(root.dataset,{productId:'1',productVariantId:'11',productUrl:'/products/'+data.productHandle,...data});info.appendChild(root);document.body.appendChild(info);wishTest.injectCompactAddToCart(root);const result={forms:info.querySelectorAll('form').length,label:info.querySelector('.ProductItem__Actions a')?.textContent,href:info.querySelector('.ProductItem__Actions a')?.getAttribute('href')};info.remove();return result},data);
    assert.equal(result.forms,needsPage?0:1);
    if(data.productRequiresSellingPlan)assert.equal(result.href,'/products/candle-club?selling_plan=44');
    else if(needsPage)assert.equal(result.label,'Choose scents');
    passed++;
   }
  } finally {await page.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
 console.log(`Passed ${passed} WebKit cart continuity, delayed-response and wishlist checks.`);
} finally {await browser.close();}
