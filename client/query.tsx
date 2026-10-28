import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { AppState, type ScrollView } from 'react-native';
import { useSettings } from '@getpaseo/plugin/client';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { workbenchSettings } from '../shared/workbench.ts';
import { pollInterval, queryPolicy } from './query-policy.ts';

interface Visibility {visibilityState?:string;addEventListener(type:string,fn:()=>void):void;removeEventListener(type:string,fn:()=>void):void}
export function useVisible() {
 const document=(globalThis as unknown as {document?:Visibility}).document;
 const read=()=>document?document.visibilityState!=='hidden':AppState.currentState!=='background'&&AppState.currentState!=='inactive';
 const [visible,setVisible]=useState(read);
 useEffect(()=>{
  const update=()=>setVisible(read());document?.addEventListener('visibilitychange',update);
  const sub=AppState.addEventListener('change',update);update();
  return()=>{document?.removeEventListener('visibilitychange',update);sub.remove();};
 },[document]);
 return visible;
}
const PolicyContext=createContext({visible:true,seconds:0});
export function QueryPolicyProvider({children}:{children:ReactNode}) {
 const visible=useVisible(),settings=useSettings(workbenchSettings),cache=useQueryClient();
 const seconds=settings.status==='ready'?settings.values.autoRefreshSeconds:0;
 const previous=useRef(visible);
 useEffect(()=>{
  if(visible&&!previous.current)void cache.refetchQueries({type:'active',stale:true,predicate:q=>q.options.meta?.workbenchVisible!==false&&((q.state.data as {pages?:unknown[]}|undefined)?.pages?.length??1)<=1},{cancelRefetch:false});
  previous.current=visible;
 },[visible,cache]);
 return <PolicyContext.Provider value={{visible,seconds}}>{children}</PolicyContext.Provider>;
}
export function useQueryPolicy(kind:'list'|'detail'|'options',active=true) {
 const {visible,seconds}=useContext(PolicyContext);
 return {...queryPolicy(kind),meta:{workbenchVisible:active},refetchInterval:(query:{state:{data:unknown}})=>{
  const data=query.state.data as {pages?:unknown[]}|undefined;
  return kind==='options'?false:pollInterval(seconds,visible&&active,data?.pages?.length??1);
 },refetchIntervalInBackground:false};
}
// View preferences live in the host-owned client cache, never on disk with private bodies.
export function useViewState<T>(key:QueryKey,initial:T):[T,Dispatch<SetStateAction<T>>] {
 const cache=useQueryClient(),scope=JSON.stringify(key);
 const [saved,setSaved]=useState(()=>({scope,value:cache.getQueryData<T>(key)??initial}));
 const value=saved.scope===scope?saved.value:cache.getQueryData<T>(key)??initial;
 const ref=useRef(value);ref.current=value;
 const set:Dispatch<SetStateAction<T>>=next=>{
  const result=typeof next==='function'?(next as (old:T)=>T)(ref.current):next;
  ref.current=result;cache.setQueryData(key,result);setSaved({scope,value:result});
 };
 return [value,set];
}

export function useListScroll(key:QueryKey) {
 const cache=useQueryClient(),scroll=useRef<ScrollView>(null);
 const props={ref:scroll,scrollEventThrottle:100,onScroll:(event:{nativeEvent:{contentOffset:{y:number}}})=>{cache.setQueryData(key,event.nativeEvent.contentOffset.y);},
  onContentSizeChange:()=>{const y=cache.getQueryData<number>(key);if(y)scroll.current?.scrollTo({y,animated:false});}};
 return [props,()=>{cache.setQueryData(key,0);scroll.current?.scrollTo({y:0,animated:false});}] as const;
}
