#!/usr/bin/env python3
"""Queue bounded dev app actions or read receipts without exposing session capabilities."""
import argparse,json,uuid,urllib.request
from pathlib import Path

private=Path('/root/.config/privatelocalchat')
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('operation',choices=['enqueue','status'])
p.add_argument('--session-file',default=str(private/'iphone-debug-session.json'))
p.add_argument('--action',choices=['state','new-chat','prompt','load','unload','profile','stop','download','cancel-download','use-model','remove-model','voice-state','voice-decide','voice-cycle'])
p.add_argument('--tier',choices=['default','light','lfm','granite'],help='model for use-model / remove-model')
p.add_argument('--gpu-layers',type=int,choices=[0,-1])
p.add_argument('--text-file',help='UTF-8 prompt file; avoids shell interpolation')
p.add_argument('--expected-commit')
p.add_argument('--command-id')
p.add_argument('--out',required=True,help='Private working receipt path')
a=p.parse_args();session=json.loads(Path(a.session_file).read_text())
base='https://dev.privatelocal.chat/api/debug/admin/sessions/'+session['id']+'/commands'
headers={'Authorization':'Bearer '+(private/'debug-read-token').read_text().strip(),'Content-Type':'application/json','User-Agent':'PrivateLocalChat-debug-operator'}
if a.operation=='enqueue':
 if not a.action or not a.expected_commit:p.error('enqueue requires --action and --expected-commit')
 if a.action=='prompt' and not a.text_file:p.error('prompt requires --text-file')
 if a.action=='profile' and a.gpu_layers is None:p.error('profile requires --gpu-layers')
 if a.action in('use-model','remove-model') and not a.tier:p.error(a.action+' requires --tier')
 command={'id':a.command_id or str(uuid.uuid4()),'action':a.action,'expectedCommit':a.expected_commit,'args':{'text':Path(a.text_file).read_text()} if a.action=='prompt' else {'gpuLayers':a.gpu_layers} if a.action=='profile' else {'tier':a.tier} if a.action in('use-model','remove-model') else {}}
 Path(a.out).write_text(json.dumps({'command':command,'state':'submission-pending'},indent=2)+'\n')
 request=urllib.request.Request(base,method='POST',headers=headers,data=json.dumps(command).encode())
else:
 if not a.command_id:p.error('status requires --command-id')
 request=urllib.request.Request(base+'/'+a.command_id,headers=headers)
with urllib.request.urlopen(request,timeout=30) as r:reply=json.load(r)
Path(a.out).write_text(json.dumps(reply,indent=2)+'\n')
print(json.dumps({k:reply[k] for k in ['id','action','issuedAt'] if k in reply} if a.operation=='enqueue' else {'id':a.command_id,'receipts':[{k:r.get(k) for k in ['status','at','code']} for r in reply.get('receipts',[])]}))
