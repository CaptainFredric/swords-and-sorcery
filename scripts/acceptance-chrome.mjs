import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export function launchAcceptanceChrome(bin, profile, log, { width=1280, height=800 }={}) {
  const child=spawn(bin,[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling','--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows','--remote-allow-origins=*',
    '--window-size='+width+','+height,'--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
  ],{stdio:['ignore','pipe','pipe']});
  const stream=createWriteStream(log);
  child.stdout.pipe(stream,{end:false});
  child.stderr.pipe(stream,{end:false});
  child.on('close',()=>stream.end());
  let spawnError;
  child.on('error',error=>{spawnError=error;});
  console.log('[CHROME START]',JSON.stringify({bin,pid:child.pid,log,width,height}));
  async function target() {
    let last;
    const deadline=Date.now()+30000;
    while(Date.now()<deadline && !spawnError && child.exitCode===null && !child.signalCode){
      try{
        const port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];
        const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)});
        const page=(await response.json()).find(item=>item.type==='page');
        if(page){
          console.log('[CHROME READY]',JSON.stringify({pid:child.pid,port}));
          return page;
        }
        last='no page target';
      }catch(error){last=error.cause?.code??error.message;}
      await sleep(100);
    }
    const tail=(await readFile(log,'utf8').catch(()=>'' )).slice(-3000);
    throw Error('Chrome debugger startup failed '+JSON.stringify({
      bin,pid:child.pid,code:child.exitCode,signal:child.signalCode,error:spawnError?.message,last,stderr:tail,
    }));
  }
  return {child,target};
}
