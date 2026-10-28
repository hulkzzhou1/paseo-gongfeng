import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DraftRegistry} from './drafts.ts';
test('leaving a dirty editor asks once, cancellation retains draft, discard runs the requested action',()=>{
 const registry=new DraftRegistry();let left=0;const id=Symbol();registry.set(id,{dirty:true,busy:false});
 assert.equal(registry.request(()=>left++),'confirm');assert.equal(left,0);
 registry.cancel();assert.equal(left,0);registry.request(()=>left++);registry.discard();assert.equal(left,1);
 registry.remove(id);assert.equal(registry.request(()=>left++),'done');assert.equal(left,2);
});
test('writes in progress block leaving including a previously opened discard confirmation',()=>{
 const registry=new DraftRegistry(),id=Symbol();let left=0;
 registry.set(id,{dirty:true,busy:false});registry.request(()=>left++);
 registry.set(id,{dirty:true,busy:true});registry.discard();assert.equal(left,0);
 assert.equal(registry.request(()=>left++),'blocked');
 registry.set(id,{dirty:false,busy:false});registry.request(()=>left++);assert.equal(left,1);
});
