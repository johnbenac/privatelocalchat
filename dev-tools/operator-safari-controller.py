#!/usr/bin/env python3
"""Control one owned development Safari context over an already trusted USB socket.

Requires optional pymobiledevice3. Commands and full results are local private IPC.
Never restarts Safari or selects another project's context. Explicit session teardown
is not proof that iOS reclaimed its temporary filesystem namespace.
"""
import asyncio,json,time,fcntl,argparse
from pathlib import Path
from urllib.parse import urlsplit
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.webinspector import WebinspectorService,SAFARI
from pymobiledevice3.services.web_protocol.driver import WebDriver

def options():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--usbmux-socket',required=True)
    parser.add_argument('--udid',default=None,help='the exact device to control when more than one phone is attached (otherwise the first one found)')
    parser.add_argument('--pairing-cache',default='work/ios-pairing')
    parser.add_argument('--ipc-directory',default='work/usb-control')
    parser.add_argument('--start-path',choices=('/', '/404.html'),default='/404.html')
    parser.add_argument('--duration-seconds',type=int,default=7200)
    args=parser.parse_args()
    if not 1 <= args.duration_seconds <= 7200:
        parser.error('Duration must be between 1 and 7200 seconds')
    private_root=Path(__file__).resolve().parent.parent/'work'
    if not Path(args.ipc_directory).resolve().is_relative_to(private_root.resolve()):
        parser.error('Command IPC and session receipts must remain under ignored work/')
    return args

async def main(args):
    root=Path(args.ipc_directory)
    (root/'commands').mkdir(parents=True,exist_ok=True)
    (root/'results').mkdir(exist_ok=True)
    # Acquire ownership before opening another automation context.
    lock=(root/'bridge.lock').open('a')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    (root/'ready.json').write_text(json.dumps({'ready':False,'starting':True,'startedAt':time.time()})+'\n')
    # Commands left unfinished by the previous context must never be replayed.
    for f in (root/'commands').glob('*.json'):
        out=root/'results'/f.name
        if not out.exists():
            command=json.loads(f.read_text())
            out.write_text(json.dumps({'id':command['id'],'ok':False,'error':'PreviousSessionEnded','message':'Not replayed in a new automation context'})+'\n')
    ld=await create_using_usbmux(serial=args.udid,usbmux_address=args.usbmux_socket,autopair=False,pairing_records_cache_folder=Path(args.pairing_cache))
    session=None;driver=None;shutdown={'windowClosed':False,'deleteSent':False,'sessionRemovalConfirmed':False}
    try:
        async with WebinspectorService(ld) as inspector:
            try:
                safari=await inspector.open_app(SAFARI);session=await asyncio.wait_for(inspector.automation_session(safari),15);driver=WebDriver(session)
                start_path=args.start_path
                if start_path not in ('/','/404.html'): raise ValueError('Unsupported start path')
                await driver.start_session();await driver.get('https://dev.privatelocal.chat'+start_path)
                own=await driver.get_current_window_handle()
                receipt={'ready':True,'ownContext':own,'automationSession':session.get_id(),'startedAt':time.time()}
                (root/'ready.json').write_text(json.dumps(receipt)+'\n')
                (root/('session-'+session.get_id()+'.json')).write_text(json.dumps(receipt)+'\n')
                print('Own USB Safari context ready',flush=True)
                end=time.monotonic()+args.duration_seconds
                while time.monotonic()<end:
                    for f in sorted((root/'commands').glob('*.json')):
                        out=root/'results'/f.name
                        if out.exists():continue
                        c=json.loads(f.read_text());result={'id':c['id'],'ok':False}
                        try:
                            if c['action']=='navigate':
                                u=urlsplit(c['url']);assert u.scheme=='https' and u.hostname=='dev.privatelocal.chat'
                                await asyncio.wait_for(driver.get(c['url']),30);value={'url':await driver.get_current_url()}
                            elif c['action']=='recover':
                                # A new owned tab in this session retains isolated origin storage.
                                # Never stop the whole session or close another project's context.
                                old=own
                                own=await asyncio.wait_for(session.create_window('tab'),15)
                                await asyncio.wait_for(session.switch_to_top_level_browsing_context(own),15)
                                await asyncio.wait_for(driver.get('https://dev.privatelocal.chat/'),30)
                                await asyncio.wait_for(session.protocol.closeBrowsingContext(handle=old),5)
                                value={'recovered':True,'sameAutomationSession':True}
                            elif c['action']=='eval':
                                script='if(location.hostname!=="dev.privatelocal.chat")throw Error("Unexpected origin");'+c['script']
                                value=await asyncio.wait_for(driver.execute_script(script),20)
                            elif c['action']=='tap':
                                # a real touch through the automation channel (page script cannot make one): browsers only allow audio and speech after a touch.
                                # iOS has no mouse input, so this is a touch input sequence at the centre of the element.
                                assert isinstance(c.get('selector'),str) and len(c['selector'])<200
                                where=await asyncio.wait_for(driver.execute_script('if(location.hostname!=="dev.privatelocal.chat")throw Error("Unexpected origin");const e=document.querySelector('+json.dumps(c['selector'])+');if(!e)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});'),10)
                                if not where:raise ValueError('No element matches that selector')
                                point=json.loads(where)
                                sources=c.get('sources') or [{'sourceId':'finger','sourceType':'Touch'}]
                                steps=c.get('steps') or [
                                    {'states':[{'sourceId':'finger','location':'__POINT__','origin':'Viewport','duration':30}]},
                                    {'states':[{'sourceId':'finger','pressedButtons':['Left']}]},
                                    {'states':[{'sourceId':'finger','pressedButtons':[]}]}]
                                steps=json.loads(json.dumps(steps).replace('"__POINT__"',json.dumps(point)))
                                await asyncio.wait_for(session.perform_interaction_sequence(sources,steps),10)
                                value={'tapped':c['selector'],'at':point}
                            elif c['action']=='close':
                                out.write_text(json.dumps({'id':c['id'],'ok':True,'value':{'closing':True,'shutdownReceipt':'ready.json'}})+'\n')
                                return
                            else:raise ValueError('Unsupported local USB bridge action')
                            result.update(ok=True,value=value)
                        except Exception as e:result.update(error=type(e).__name__,message=str(e))
                        out.write_text(json.dumps(result,indent=2,default=str)+'\n')
                    await asyncio.sleep(.25)
            finally:
                # Cleanup must run while the inspector transport is still connected.
                if driver:
                    try:
                        script='if(location.hostname!=="dev.privatelocal.chat")throw Error("Unexpected origin");return (async()=>{window.__plcDebugDownloadControl?.("cancel-download");const host=window.__plcDebugModelHost;if(!host)return {available:false};await host.remove("light",{confirmed:true});const after=await host.inspect("light");return {available:true,bytesPresent:after.bytesPresent};})();'
                        shutdown['modelCleanup']=await asyncio.wait_for(driver.execute_script(script),20)
                    except Exception as e:shutdown['modelCleanupError']=type(e).__name__
                if driver:
                    try:
                        await asyncio.wait_for(driver.close(),3)
                        shutdown['windowClosed']=True
                    except Exception as e:shutdown['windowError']=type(e).__name__
                if session:
                    try:
                        await asyncio.wait_for(session.protocol.deleteSession(wait_for_response=False),5)
                        shutdown['deleteSent']=True
                        pages=await asyncio.wait_for(inspector.get_open_application_pages(1),5)
                        shutdown['sessionRemovalConfirmed']=not any(x.page.automation_session_id==session.get_id() for x in pages)
                    except Exception as e:shutdown['sessionError']=type(e).__name__
    finally:
        (root/'ready.json').write_text(json.dumps({'ready':False,'endedAt':time.time(),'shutdown':shutdown})+'\n')
        if session:
            (root/('session-'+session.get_id()+'.json')).write_text(json.dumps({'automationSession':session.get_id(),'endedAt':time.time(),'shutdown':shutdown})+'\n')
        await asyncio.wait_for(ld.close(),5)
if __name__ == '__main__':
    asyncio.run(main(options()))
