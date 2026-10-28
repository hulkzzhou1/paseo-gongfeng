export class DraftRegistry {
 private entries=new Map<symbol,{dirty:boolean;busy:boolean}>();
 private pending:(()=>void)|undefined;
 set(id:symbol,value:{dirty:boolean;busy:boolean}) {this.entries.set(id,value);}
 remove(id:symbol) {this.entries.delete(id);}
 request(action:()=>void) {
  if([...this.entries.values()].some(v=>v.busy))return 'blocked';
  if([...this.entries.values()].some(v=>v.dirty)){this.pending=action;return 'confirm';}
  action();return 'done';
 }
 cancel(){this.pending=undefined;}
 discard(){if([...this.entries.values()].some(v=>v.busy))return;const action=this.pending;this.pending=undefined;action?.();}
}
