import { QueryPolicyProvider } from "./query.tsx";
import { useConnection } from "./site.ts";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Modal } from '@getpaseo/plugin/client/react-native';
import { useQueryClient } from '@tanstack/react-query';
import { type PluginSurfaceProps } from '@getpaseo/plugin/client';
import { DraftRegistry } from './drafts.ts';
import { Action, workbenchStyles, type Theme } from './workbench-ui.tsx';
const DraftContext=createContext<{registry:DraftRegistry;request(action:()=>void):void}|undefined>(undefined);
export function WorkbenchBoundary({theme,children}:PluginSurfaceProps&{children:(go:(action:()=>void)=>void)=>ReactNode}) {
 const cache=useQueryClient();
 useEffect(()=>{
  cache.setQueryDefaults(['view'],{gcTime:Infinity});
  return cache.getQueryCache().subscribe(event=>{
   if(event.type!=='updated'||!['success','error'].includes(event.action.type)||event.query.queryKey[0]==='connection')return;
   const result=event.query.state.data as {ok?:boolean;error?:string}|undefined;
   const error=event.query.state.error instanceof Error?event.query.state.error.message:result?.ok===false?result.error:undefined;
   if(['account_changed','unauthorized','unconfigured'].includes(error??''))void cache.invalidateQueries({queryKey:['connection']});
  });
 },[cache]);
 const connection=useConnection();
 const scope=connection?`${connection.siteUrl}:${connection.account.id}`:'disconnected';
 return <QueryPolicyProvider><DraftBoundary key={scope} theme={theme}>{children}</DraftBoundary></QueryPolicyProvider>;
}
function DraftBoundary({theme,children}:{theme:Theme;children:(go:(action:()=>void)=>void)=>ReactNode}) {
 const [registry]=useState(()=>new DraftRegistry()),[confirm,setConfirm]=useState(false),[blocked,setBlocked]=useState(false);
 const request=(action:()=>void)=>{const result=registry.request(action);setBlocked(result==='blocked');if(result==='confirm')setConfirm(true);};
 const styles=workbenchStyles(theme);
 return <DraftContext.Provider value={{registry,request}}>{children(request)}
  <Modal title="未保存的改动" open={confirm} onOpenChange={open=>{if(!open){registry.cancel();setConfirm(false);}}}><Modal.Content>
   <Text style={styles.text}>离开将放弃尚未保存的改动，是否继续？</Text>
   <View style={[styles.toolbar,{justifyContent:'flex-end'}]}><Action theme={theme} label="继续编辑" onPress={()=>{registry.cancel();setConfirm(false);}}/><Action theme={theme} primary label="放弃改动并离开" onPress={()=>{registry.discard();setConfirm(false);}}/></View>
  </Modal.Content></Modal>
  {blocked?<View accessibilityLiveRegion="polite" style={{position:'absolute',bottom:16,alignSelf:'center',padding:12,backgroundColor:theme.colors.surface2,borderWidth:1,borderColor:theme.colors.border}}><Text style={styles.text}>正在提交，请等待结果后再离开。</Text><Action theme={theme} quiet label="知道了" onPress={()=>setBlocked(false)}/></View>:null}
 </DraftContext.Provider>;
}
export function useDiscard() {
 const context=useContext(DraftContext);
 return context?.request??((action:()=>void)=>action());
}
export function useDraft(dirty:boolean,busy=false) {
 const context=useContext(DraftContext),id=useRef(Symbol());
 useEffect(()=>{context?.registry.set(id.current,{dirty,busy});return()=>context?.registry.remove(id.current);},[context?.registry,dirty,busy]);
 return useDiscard();
}
