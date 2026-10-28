import type { QueryClient, QueryKey, InfiniteData } from '@tanstack/react-query';

export function queryPolicy(kind: 'list' | 'detail' | 'options' = 'detail') {
 return { staleTime: kind === 'list' ? 30_000 : kind === 'options' ? 600_000 : 60_000,
  refetchOnMount: (q:{state:{data:unknown}}) => ((q.state.data as {pages?:unknown[]}|undefined)?.pages?.length??1)<=1,
  gcTime: kind === 'options' ? 600_000 : 300_000, retry: false as const, refetchOnWindowFocus: false as const, refetchOnReconnect: false as const };
}
export function repositoryVersion(items: readonly {id:number}[]) { return [...new Set(items.map(i=>i.id))].sort((a,b)=>a-b).join(','); }
export function accessLost(error: unknown) {
 const code=error instanceof Error?error.message:error;
 return typeof code==='string'&&['account_changed','unauthorized','unconfigured','forbidden','not_found','stale_binding'].includes(code);
}
export function pollInterval(seconds:number,visible:boolean,pageCount:number) { return seconds>0&&visible&&pageCount<=1?seconds*1000:false; }
export async function refreshFirstPage(cache:QueryClient,key:QueryKey) {
 await cache.cancelQueries({queryKey:key,exact:true});
 cache.setQueryData<InfiniteData<unknown>>(key,old=>old?{pages:old.pages.slice(0,1),pageParams:old.pageParams.slice(0,1)}:undefined);
 await cache.invalidateQueries({queryKey:key,exact:true});
}
export function invalidateResources(cache:QueryClient,scope:{siteUrl?:string;accountId?:number},resources:readonly string[]) {
 return cache.invalidateQueries({predicate:q=>resources.includes(String(q.queryKey[0]))&&q.queryKey[1]===scope.siteUrl&&q.queryKey[2]===scope.accountId});
}

type Connection = import('@getpaseo/plugin').RpcOutput<typeof import('../shared/connection.ts').connectionStatus>;
type Connected = Extract<Connection,{status:'connected'}>;
export function connectionForView(previous:Connected|undefined,current:Connection|undefined,failed:boolean):Connected|undefined {
 if(failed)return previous;
 if(current?.status==='connected')return current;
 if(current?.status==='error'&&['network_error','service_error'].includes(current.error))return previous;
 return undefined;
}

// RPC business failures must stay query errors so transient reads never replace a good snapshot.
export async function readResult<T extends {ok:boolean;error?:string}>(request:Promise<T>):Promise<T> {
 const result=await request;
 if(!result.ok)throw Error(result.error??'invalid_response');
 return result;
}
