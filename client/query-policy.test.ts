import { test } from 'node:test';
import assert from 'node:assert/strict';
const environment=globalThis as unknown as {window?:unknown};
const previousWindow=environment.window;environment.window={};
const {QueryClient,QueryObserver}=await import('@tanstack/react-query');
if(previousWindow===undefined)delete environment.window;else environment.window=previousWindow;
import { queryPolicy, refreshFirstPage, invalidateResources, pollInterval, repositoryVersion, accessLost } from './query-policy.ts';

test('returning to a fresh list reuses its request; stale return reads once', async t => {
 let now=1000,calls=0;t.mock.method(Date,'now',()=>now);
 const cache=new QueryClient();
 const options={...queryPolicy('list'),queryKey:['board','site',1],queryFn:async()=>++calls};
 const first=new QueryObserver(cache,options),stop=first.subscribe(()=>{});await first.refetch();stop();
 now+=29000;const second=new QueryObserver(cache,options),stop2=second.subscribe(()=>{});
 assert.equal(calls,1);assert.equal(second.getCurrentResult().data,1);stop2();
 now+=2000;const third=new QueryObserver(cache,options),stop3=third.subscribe(()=>{});
 await new Promise(r=>setImmediate(r));assert.equal(calls,2);stop3();cache.clear();
});

test('manual refresh retains first page while reading it once and drops the pagination chain',async()=>{
 const cache=new QueryClient(),key=['issues','site',1];let calls=0;
 cache.setQueryData(key,{pages:[{items:['old']},{items:['page2']}],pageParams:[undefined,[{page:2}]]});
 const observer=new QueryObserver(cache,{...queryPolicy('list'),queryKey:key,queryFn:async()=>{calls++;return {pages:[{items:['new']}],pageParams:[undefined]};}});
 const stop=observer.subscribe(()=>{});await refreshFirstPage(cache,key);
 assert.equal(calls,1);assert.deepEqual(cache.getQueryData(key),{pages:[{items:['new']}],pageParams:[undefined]});stop();cache.clear();
});

test('writes invalidate related resources only within the same site and account',async()=>{
 const cache=new QueryClient();for(const key of [['issues','site',1],['milestones','site',1],['issues','other',1],['issues','site',2]])cache.setQueryData(key,{});
 await invalidateResources(cache,{siteUrl:'site',accountId:1},['issues','milestones']);
 assert.equal(cache.getQueryState(['issues','site',1])?.isInvalidated,true);
 assert.equal(cache.getQueryState(['milestones','site',1])?.isInvalidated,true);
 assert.equal(cache.getQueryState(['issues','other',1])?.isInvalidated,false);
 assert.equal(cache.getQueryState(['issues','site',2])?.isInvalidated,false);cache.clear();
});

test('background and multi-page lists do not poll; unchanged repository sets keep query identity',()=>{
 assert.equal(pollInterval(60,true,1),60000);assert.equal(pollInterval(60,false,1),false);
 assert.equal(pollInterval(60,true,2),false);assert.equal(pollInterval(0,true,1),false);
 assert.equal(repositoryVersion([{id:2},{id:1}]),repositoryVersion([{id:1},{id:2}]));
 assert.notEqual(repositoryVersion([{id:1}]),repositoryVersion([{id:2}]));
 assert.equal(accessLost('forbidden'),true);assert.equal(accessLost('network_error'),false);
});

test('a transient connection failure keeps the editor identity, authorization loss clears it',async()=>{
 const {connectionForView}=await import('./query-policy.ts');
 const old={status:'connected' as const,siteUrl:'https://code.example.com',account:{id:1,name:'Alice',username:'alice'}};
 assert.equal(connectionForView(old,{status:'error',error:'network_error',siteUrl:old.siteUrl},false),old);
 assert.equal(connectionForView(old,undefined,true),old);
 assert.equal(connectionForView(old,{status:'error',error:'unauthorized',siteUrl:old.siteUrl},false),undefined);
 assert.equal(connectionForView(old,{status:'unconfigured'},false),undefined);
 const next={...old,account:{...old.account,id:2}};assert.equal(connectionForView(old,next,false),next);
});


test('polling stops in background and after loading more, then manual refresh resumes from page one', async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 const cache=new QueryClient(),key=['board','site',1];let visible=true,calls=0;
 const options={...queryPolicy('list'),queryKey:key,queryFn:async()=>{calls++;return {pages:[{items:[calls]}],pageParams:[1]};},refetchInterval:(q:{state:{data:unknown}})=>pollInterval(60,visible,(q.state.data as {pages?:unknown[]})?.pages?.length??1)};
 const observer=new QueryObserver(cache,options),stop=observer.subscribe(()=>{});await observer.refetch();assert.equal(calls,1);
 t.mock.timers.tick(60000);await new Promise(r=>setImmediate(r));assert.equal(calls,2);
 visible=false;observer.setOptions(options);t.mock.timers.tick(120000);await new Promise(r=>setImmediate(r));assert.equal(calls,2);
 visible=true;observer.setOptions(options);await cache.refetchQueries({type:'active',stale:true},{cancelRefetch:false});assert.equal(calls,3);
 cache.setQueryData(key,{pages:[{items:['a']},{items:['b']}],pageParams:[1,2]});
 t.mock.timers.tick(120000);await new Promise(r=>setImmediate(r));assert.equal(calls,3);
 await refreshFirstPage(cache,key);assert.equal(calls,4);assert.equal(observer.getCurrentResult().data?.pages.length,1);
 stop();cache.clear();
});

test('a failed RPC read keeps the last successful query data and candidate cache survives six minutes',async t=>{
 const {readResult}=await import('./query-policy.ts');
 assert.ok(queryPolicy('options').gcTime>=600000);
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 const cache=new QueryClient();let fail=false,calls=0;
 const options={...queryPolicy('options'),queryKey:['candidates','site',1],queryFn:()=>readResult(Promise.resolve(fail?{ok:false as const,error:'network_error'}:{ok:true as const,items:['member']})).then(r=>{calls++;return r;})};
 const observer=new QueryObserver(cache,options),stop=observer.subscribe(()=>{});await observer.refetch();stop();
 t.mock.timers.tick(360000);const second=new QueryObserver(cache,options),stop2=second.subscribe(()=>{});assert.equal(calls,1);
 fail=true;const failed=await second.refetch();assert.equal(failed.isError,true);assert.deepEqual(failed.data,{ok:true,items:['member']});stop2();cache.clear();
});
