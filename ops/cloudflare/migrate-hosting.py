#!/usr/bin/env python3
"""Connect verified Cloudflare Pages production hosting and canonical redirects."""
import argparse
import json
from pathlib import Path
import urllib.request
import urllib.error

TOKEN = Path('/root/.config/privatelocalchat/cloudflare-api-token')
ROOT = Path(__file__).resolve().parents[2]

def api(path, method='GET', data=None):
    request = urllib.request.Request('https://api.cloudflare.com/client/v4/' + path,
        method=method, headers={'Authorization': 'Bearer ' + TOKEN.read_text().strip(),
        'Content-Type': 'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        result = json.load(error)
        raise RuntimeError(json.dumps(result.get('errors'))) from None
    if not result.get('success'):
        raise RuntimeError(json.dumps(result.get('errors')))
    return result['result']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit('After verifying production at its pages.dev URL, use --apply.')
    with urllib.request.urlopen(urllib.request.Request('https://privatelocalchat.pages.dev/version.json',headers={'User-Agent':'PrivateLocalChat-migration-check'})) as response:
        build = json.load(response)
    if build.get('branch') != 'main' or build.get('environment') != 'production':
        raise RuntimeError('The production Pages build is not verified.')
    zone = api('zones?name=privatelocal.chat')[0]
    account = zone['account']['id']
    project = 'accounts/' + account + '/pages/projects/privatelocalchat'
    domains = api(project + '/domains')
    if not any(item['name'] == 'privatelocal.chat' for item in domains):
        api(project + '/domains', 'POST', {'name': 'privatelocal.chat'})
    dns = 'zones/' + zone['id'] + '/dns_records'
    records = api(dns + '?name=privatelocal.chat')
    work = ROOT / 'work'
    work.mkdir(exist_ok=True)
    snapshot = work / 'pre-migration-apex-dns.json'
    if not snapshot.exists():
        snapshot.write_text(json.dumps(records, indent=2) + '\n')
    target = 'privatelocalchat.pages.dev'
    if not any(r['type'] == 'CNAME' and r['content'] == target for r in records):
        for record in records:
            if record['type'] in ['A', 'AAAA', 'CNAME']:
                api(dns + '/' + record['id'], 'DELETE')
        api(dns, 'POST', {'type': 'CNAME', 'name': 'privatelocal.chat',
                         'content': target, 'proxied': True, 'ttl': 1})
    redirect_zone = api('zones?name=privatelocalchat.com')[0]
    base = 'zones/' + redirect_zone['id'] + '/rulesets'
    rulesets = api(base)
    ruleset = next((r for r in rulesets if r['phase'] == 'http_request_dynamic_redirect' and r['kind'] == 'zone'), None)
    rule = {'ref': 'privatelocalchat_canonical', 'description': 'Canonical app domain with path and query preservation',
            'expression': '(http.host in {"privatelocalchat.com" "www.privatelocalchat.com"})',
            'action': 'redirect', 'action_parameters': {'from_value': {'status_code': 301,
            'target_url': {'expression': 'concat("https://privatelocal.chat", http.request.uri.path)'},
            'preserve_query_string': True}}, 'enabled': True}
    if ruleset:
        current = api(base + '/' + ruleset['id'])
        rules = current.get('rules', [])
        if not any(r.get('ref') == rule['ref'] for r in rules):
            rule['position'] = {'index': 1}
            api(base + '/' + ruleset['id'] + '/rules', 'POST', rule)
    else:
        api(base, 'POST', {'name': 'Private Local Chat canonical redirect', 'kind': 'zone',
            'phase': 'http_request_dynamic_redirect', 'rules': [rule]})
    print(json.dumps({'production': 'https://privatelocal.chat', 'commit': build['commit'],
                      'redirect': 'privatelocalchat.com', 'dnsSnapshot': str(snapshot)}))

if __name__ == '__main__':
    main()
