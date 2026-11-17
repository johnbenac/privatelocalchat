#!/usr/bin/env python3
"""Provision the Private Local Chat asset CDN without modifying app hosting."""
import json
from pathlib import Path
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent
TOKEN_FILE = Path('/root/.config/privatelocalchat/cloudflare-api-token')
BUCKET = 'privatelocalchat-assets'
HOST = 'assets.privatelocal.chat'

def api(path, method='GET', data=None):
    token = TOKEN_FILE.read_text().strip()
    request = urllib.request.Request(
        'https://api.cloudflare.com/client/v4/' + path, method=method,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        result = json.load(error)
        raise RuntimeError(json.dumps({'status': error.code, 'errors': result.get('errors')})) from None
    if not result.get('success'):
        raise RuntimeError(json.dumps(result.get('errors')))
    return result['result']

def configure_model_browser_cache(zone_id):
    # Header transforms run after the edge-cache decision. Keep CDN caching while
    # avoiding a second browser HTTP copy beside OPFS/WebLLM's explicit offline cache.
    base = 'zones/' + zone_id + '/rulesets'
    sets = api(base)
    existing = next((r for r in sets if r['phase'] == 'http_response_headers_transform'
                     and r['kind'] == 'zone'), None)
    rule = {
        'ref': 'privatelocalchat_weights_no_browser_copy',
        'description': 'Keep one intentional offline model copy without duplicate HTTP weight caching',
        'expression': 'http.host eq "' + HOST + '" and (ends_with(http.request.uri.path, ".gguf") or ends_with(http.request.uri.path, ".bin"))',
        'action': 'rewrite',
        'action_parameters': {'headers': {'cache-control': {'operation': 'set', 'value': 'no-store'}}},
        'enabled': True,
    }
    if existing:
        current = api(base + '/' + existing['id'])
        previous = next((r for r in current['rules'] if r.get('ref') == rule['ref']), None)
        if previous:
            api(base + '/' + existing['id'] + '/rules/' + previous['id'], 'PATCH', rule)
        else:
            api(base + '/' + existing['id'] + '/rules', 'POST', rule)
    else:
        api(base, 'POST', {'name': 'Private Local Chat model browser storage policy',
                          'kind': 'zone', 'phase': 'http_response_headers_transform', 'rules': [rule]})
    return {'host': HOST, 'weightResponseCacheControl': 'no-store',
            'edgeCachePolicyChanged': False, 'ruleRef': rule['ref']}

def main():
    zone = api('zones?name=privatelocal.chat')[0]
    account = zone['account']['id']
    path = 'accounts/' + account + '/r2/buckets'
    buckets = api(path).get('buckets', [])
    if not any(bucket['name'] == BUCKET for bucket in buckets):
        api(path, 'POST', {'name': BUCKET})
    api(path + '/' + BUCKET + '/cors', 'PUT', {'rules': [{
        'allowed': {'origins': ['*'], 'methods': ['GET', 'HEAD'], 'headers': ['Range', 'Content-Type']},
        'exposeHeaders': ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag'],
        'maxAgeSeconds': 86400}]})
    domains = api(path + '/' + BUCKET + '/domains/custom').get('domains', [])
    if not any(domain['domain'] == HOST for domain in domains):
        api(path + '/' + BUCKET + '/domains/custom', 'POST', {
            'domain': HOST, 'enabled': True, 'zoneId': zone['id'], 'minTLS': '1.2'})
    rules_path = 'zones/' + zone['id'] + '/rulesets'
    rulesets = api(rules_path)
    existing = next((ruleset for ruleset in rulesets if ruleset['phase'] == 'http_request_cache_settings' and ruleset['kind'] == 'zone'), None)
    rule = {'ref': 'privatelocalchat_assets_cache', 'description': 'Cache public Private Local Chat assets using object freshness headers',
            'expression': 'http.host eq "' + HOST + '"', 'action': 'set_cache_settings',
            'action_parameters': {'cache': True, 'browser_ttl': {'mode': 'respect_origin'},
                                  'edge_ttl': {'mode': 'respect_origin'}}, 'enabled': True}
    if existing:
        current = api(rules_path + '/' + existing['id'])
        previous = next((item for item in current['rules'] if item.get('ref') == rule['ref']), None)
        if previous:
            api(rules_path + '/' + existing['id'] + '/rules/' + previous['id'], 'PATCH', rule)
        else:
            api(rules_path + '/' + existing['id'] + '/rules', 'POST', rule)
    else:
        api(rules_path, 'POST', {'name': 'Private Local Chat asset caching', 'kind': 'zone',
                               'phase': 'http_request_cache_settings', 'rules': [rule]})
    configure_model_browser_cache(zone['id'])
    state = {'account': account, 'zone': zone['id'], 'bucket': BUCKET, 'domain': HOST,
             'canonicalOrigin': 'https://privatelocal.chat'}
    (ROOT / 'cdn-state.json').write_text(json.dumps(state, indent=2) + '\n')
    print(json.dumps(state))

if __name__ == '__main__':
    main()
