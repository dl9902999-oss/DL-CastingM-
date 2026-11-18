import { useCallback,useContext,useEffect,useRef,useState } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction } from '@/components/ui/alert-dialog';
export function useUnsavedChanges(active:boolean) {
 const [dirty,setDirty]=useState(false),[asking,setAsking]=useState(false);
 const current=useRef(false);current.current=active&&dirty;
 const answer=useRef<((value:boolean)=>void)|null>(null);
 const {navigator}=useContext(UNSAFE_NavigationContext);
 const finish=(value:boolean)=>{setAsking(false);answer.current?.(value);answer.current=null;};
 const confirmLeave=(force=false):Promise<boolean>=>{
  if(!force&&!current.current)return Promise.resolve(true);
  if(answer.current)return Promise.resolve(false);
  setAsking(true);return new Promise(resolve=>{answer.current=resolve;});
 };
 useEffect(()=>{if(!active)setDirty(false);},[active]);
 useEffect(()=>()=>{answer.current?.(false);answer.current=null;},[]);
 useEffect(()=>{
  if(!active)return;
  let index=window.history.state?.idx;let restoring=false;let approvedPop=false;
  const pop=(e:PopStateEvent)=>{
   const next=e.state?.idx;
   if(restoring){restoring=false;e.stopImmediatePropagation();return;}
   if(approvedPop){approvedPop=false;index=next;return;}
   if(current.current&&typeof index==='number'&&typeof next==='number'&&index!==next){
    e.stopImmediatePropagation();const delta=next-index;restoring=true;window.history.go(-delta);
    void confirmLeave().then(ok=>{if(ok){approvedPop=true;window.history.go(delta);}});return;
   }index=next;
  };
  const before=(e:BeforeUnloadEvent)=>{if(current.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('popstate',pop,true);window.addEventListener('beforeunload',before);
  const push=navigator.push,replace=navigator.replace,go=navigator.go;
  navigator.push=(...args)=>{void confirmLeave().then(ok=>{if(ok)push.apply(navigator,args);});};
  navigator.replace=(...args)=>{void confirmLeave().then(ok=>{if(ok)replace.apply(navigator,args);});};
  navigator.go=(...args)=>{void confirmLeave().then(ok=>{if(ok){approvedPop=true;go.apply(navigator,args);}});};
  return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('popstate',pop,true);navigator.push=push;navigator.replace=replace;navigator.go=go;};
 },[navigator,active]);
 const markDirty=useCallback(()=>setDirty(true),[]);
 const dialog=<AlertDialog open={asking} onOpenChange={v=>{if(!v)finish(false);}}><AlertDialogContent className="bg-zinc-900 text-zinc-100 border-zinc-700"><AlertDialogHeader><AlertDialogTitle>尚有未儲存資料</AlertDialogTitle><AlertDialogDescription>離開會放棄本次輸入，是否確定離開？</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={()=>finish(false)}>繼續編輯</AlertDialogCancel><AlertDialogAction onClick={()=>finish(true)}>放棄並離開</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
 return {dirty,dialog,markDirty,clearDirty:()=>{current.current=false;setDirty(false);},confirmLeave};
}
