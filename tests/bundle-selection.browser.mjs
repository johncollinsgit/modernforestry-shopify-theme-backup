import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { Liquid } = await import(process.env.LIQUID_MODULE || 'liquidjs');
const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = new Liquid({root:process.cwd(),partials:path.resolve('snippets'),extname:'.liquid'});
const translations = JSON.parse(fs.readFileSync('locales/en.default.json','utf8').replace(/^\/\*[\s\S]*?\*\//,''));
engine.registerFilter('t', key => key.split('.').reduce((v,k)=>v?.[k],translations) || key);
engine.registerFilter('money', value => '$'+((Number(value)||0)/100).toFixed(2));
engine.registerTag('form', {
  parse(token,tokens) {
    this.templates=[];
    while(tokens.length) {
      const next=tokens.shift();
      if(next.name==='endform') return;
      this.templates.push(this.liquid.parser.parseToken(next,tokens));
    }
    throw new Error('Unclosed form');
  },
  *render(ctx,emitter,hash) {
    emitter.write('<form action="/cart/add" class="'+(hash.class||'')+'">');
    yield this.liquid.renderer.renderTemplates(this.templates,ctx,emitter);
    emitter.write('</form>');
  },
});
engine.registerTag('schema', {parse(token,tokens){while(tokens.length) if(tokens.shift().name==='endschema')return;},render(){return '';}});
const base={id:1,title:'Fictional candle',handle:'fictional-candle',url:'/products/fictional-candle',tags:[],type:'Soy Candles',description:'',collections:[],available:true,options_with_values:[],selling_plan_groups:[],price:2000,selected_or_first_available_variant:{id:11,available:true,price:2000},has_only_default_variant:true};
const cases=[
  ['three candles',{handle:'8oz-3-soy-candle-bundle',title:'3 (8oz) Soy Candle Bundle'},true],
  ['five melts',{handle:'5-wax-melts-bundle'},true],
  ['case of twelve',{handle:'bulk-discount-16oz-soy-candles-case-of-12'},true],
  ['tagged bundle',{tags:['bundle']},true],
  ['normal candle',{},false],
  ['sold out bundle',{handle:'wax-melts-bundle',available:false},false],
];
const browser=await webkit.launch();
let passed=0;
try {
  for(const width of [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    for(const [name,patch,requiresScents] of cases) {
      const product={...base,...patch,url:'/products/'+(patch.handle||base.handle)};
      const context={product,settings:{native_wishlist_enabled:false},show_product_info:true,show_price_on_hover:false,show_color_swatch:false};
      const html=await engine.parseAndRender(fs.readFileSync(process.env.PRODUCT_CARD_FILE || 'snippets/product-item.liquid','utf8'),context);
      await page.setContent(html);
      const action=page.locator('.ProductItem__Actions');
      if(requiresScents) {
        assert.equal(await action.locator('form').count(),0,name);
        assert.equal(await action.getByRole('link',{name:'Choose scents'}).getAttribute('href'),product.url,name);
      } else if(product.available) assert.equal(await action.locator('form[action="/cart/add"]').count(),1,name);
      else assert.equal(await action.locator('button[disabled]').count(),1,name);
      passed++;
    }
    for(const [name,patch,requiresScents] of cases.slice(0,5)) {
      const product={...base,...patch,url:'/products/'+(patch.handle||base.handle)};
      const section={id:'fixture-featured',settings:{product:product.handle},blocks:[{type:'buy_buttons',settings:{show_payment_button:false}}]};
      const html=await engine.parseAndRender(fs.readFileSync('sections/featured-product.liquid','utf8'),{all_products:{[product.handle]:product},section,settings:{cart_type:'page'}});
      await page.setContent(html);
      if(requiresScents) {
        assert.equal(await page.locator('.ProductForm__AddToCart').count(),0,name);
        assert.equal(await page.getByRole('link',{name:'Choose scents'}).getAttribute('href'),product.url,name);
      } else assert.equal(await page.locator('.ProductForm__AddToCart').count(),1,name);
      passed++;
    }
    await page.close();
  }
  console.log('Passed '+passed+' rendered card and featured-product checks in WebKit.');
} finally {await browser.close();}
