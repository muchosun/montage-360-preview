const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync('analytics.js','utf8');
function setup({host='montazh360.ru',protocol='https:',path='/',id=114749900,search='',storage=new Map(),brokenStorage=false}={}){
 const calls=[],scripts=[],listeners={};
 const sandbox={location:{hostname:host,protocol,pathname:path,search},URLSearchParams,URL,Date,console,
 sessionStorage:{getItem:k=>{if(brokenStorage)throw Error();return storage.get(k)||null;},setItem:(k,v)=>{if(brokenStorage)throw Error();storage.set(k,v);}},
 document:{scripts,createElement:()=>({}),head:{appendChild:s=>scripts.push(s)},addEventListener:(n,f)=>listeners[n]=f}};
 sandbox.window=sandbox;sandbox.M360_ANALYTICS={counterId:id};sandbox.ym=(...x)=>calls.push(x);vm.createContext(sandbox);const run=()=>vm.runInContext(source,sandbox);run();return {sandbox,calls,scripts,listeners,run,storage};
}
test('only the production HTTPS homepage initializes once, without Webvisor',()=>{
 const x=setup();x.run();assert.equal(x.scripts.length,1);assert.equal(x.scripts[0].src,'https://mc.yandex.ru/metrika/tag.js');assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],114749900);assert.equal(x.calls[0][1],'init');assert.equal(x.calls[0][2].webvisor,false);assert.equal(x.calls[0][2].clickmap,false);assert.equal(x.calls[0][2].trackLinks,false);
});
test('previews, HTTP, guest page and invalid IDs do not load Metrika',()=>{
 for(const config of [{host:'localhost'},{host:'muchosun.github.io'},{host:'preview.montazh360.ru'},{protocol:'http:'},{path:'/guest.html'},{id:null},{id:'token-is-not-a-counter'},{id:0}]){const x=setup({...config,search:'?utm_source=test'});assert.equal(x.calls.length,0);assert.equal(x.scripts.length,0);if(config.host||config.protocol||config.path)assert.equal(x.storage.size,0);}
});
test('same-tab UTM survives navigation; only known bounded campaign keys are stored',()=>{
 const a=setup({search:'?utm_source=qa&utm_campaign=synthetic&phone=private&comment=private&utm_term='+('a'.repeat(500))});
 const b=setup({storage:a.storage});const data=b.sandbox.M360Attribution.get();assert.equal(data.utm_source,'qa');assert.equal(data.utm_campaign,'synthetic');assert.equal(data.utm_term.length,200);assert.equal(data.phone,undefined);assert.equal(data.comment,undefined);data.utm_source='changed';assert.equal(b.sandbox.M360Attribution.get().utm_source,'qa');
 const c=setup({storage:a.storage,search:'?utm_source=new'});assert.equal(c.sandbox.M360Attribution.get().utm_campaign,undefined);
});
test('unavailable storage does not break initialization',()=>{const x=setup({brokenStorage:true,search:'?utm_source=qa'});assert.equal(x.calls.length,1);});
test('contact clicks send channel only; no lead success is emitted',()=>{
 const x=setup();const hrefs=['tel:+79522176744','https://t.me/GOODTOBEDONE'];for(const href of hrefs)x.listeners.click({button:0,target:{closest:()=>({href})}});
 assert.equal(x.calls.length,3);for(const call of x.calls.slice(1)){assert.equal(call[2],'contact_click');assert.deepEqual(Object.keys(call[3]),['channel']);assert.ok(!JSON.stringify(call).includes('7952'));assert.ok(!JSON.stringify(call).includes('GOODTOBEDONE'));}
 assert.ok(!x.calls.some(c=>c[2]==='lead_form_success'));
});
