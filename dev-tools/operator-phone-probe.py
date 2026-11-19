#!/usr/bin/env python3
"""One-shot, read-only look at one public page in the paired iPhone's Safari, through a usbmux socket (docs/DEV-DIAGNOSTICS.md, "A one-page look at the phone").

Its own automation context and one tab; it loads one https page of an allowed host, reads the page's address, whether it is a secure context, the user agent, the viewport and the first
300 characters of its text, then closes its window and deletes its session. It never taps (automation cannot), never installs, never pairs and never touches another context.
Requires the optional pymobiledevice3 (a virtual environment of the operator's own) and a trust that already exists.

    # forward the phone's usbmuxd (it is plugged into the host `boiler`) to a private socket, then:
    ssh -o StreamLocalBindUnlink=yes -o ExitOnForwardFailure=yes -f -N -L $DIR/usbmuxd.sock:/var/run/usbmuxd boiler
    /path/to/venv/bin/python dev-tools/operator-phone-probe.py --usbmux-socket $DIR/usbmuxd.sock --pairing-cache $DIR/pair [--url https://privatelocal.chat/version.json]

Close calls are driver.close() and session.protocol.deleteSession(wait_for_response=False); the page list still shows a deleted session for a few seconds, so it is checked after a short wait.
"""
import argparse, asyncio, json, sys
from pathlib import Path
from urllib.parse import urlsplit

ALLOWED_HOSTS = ('privatelocal.chat', 'dev.privatelocal.chat')


def check_url(url, allowed=ALLOWED_HOSTS):
    """The url if it is an https address of an allowed host with no credentials or port; otherwise ValueError."""
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname not in allowed or parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError('only https pages of ' + ', '.join(allowed) + ' are looked at: ' + url)
    return url


async def probe(usbmux_socket, pairing_cache, url):
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.webinspector import WebinspectorService, SAFARI
    from pymobiledevice3.services.web_protocol.driver import WebDriver
    ld = await create_using_usbmux(serial=None, usbmux_address=usbmux_socket, autopair=False, pairing_records_cache_folder=Path(pairing_cache))
    result = {'url': url, 'steps': []}
    session = driver = None
    async with WebinspectorService(ld) as inspector:
        try:
            safari = await inspector.open_app(SAFARI)
            session = await asyncio.wait_for(inspector.automation_session(safari), 20)
            driver = WebDriver(session)
            await driver.start_session(); result['steps'].append('session started')
            await asyncio.wait_for(driver.get(url), 40); result['steps'].append('page loaded')
            script = 'return JSON.stringify({url:location.href,secure:isSecureContext,ua:navigator.userAgent,viewport:innerWidth+"x"+innerHeight,dpr:devicePixelRatio,text:document.body.innerText.slice(0,300)})'
            result['page'] = json.loads(await asyncio.wait_for(driver.execute_script(script), 20)); result['steps'].append('evaluated')
        finally:
            if driver:
                try: await asyncio.wait_for(driver.close(), 5); result['steps'].append('window closed')
                except Exception as e: result['steps'].append('close failed: ' + type(e).__name__)
            if session:
                try:
                    await asyncio.wait_for(session.protocol.deleteSession(wait_for_response=False), 5)
                    await asyncio.sleep(5)
                    pages = await asyncio.wait_for(inspector.get_open_application_pages(1), 5)
                    result['steps'].append('session deleted; still listed after 5 s: %s' % any(x.page.automation_session_id == session.get_id() for x in pages))
                except Exception as e: result['steps'].append('delete failed: ' + type(e).__name__)
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--usbmux-socket', required=True)
    ap.add_argument('--pairing-cache', required=True, help='an existing folder (it may be empty: the trust is read through usbmuxd); nothing is paired')
    ap.add_argument('--url', default='https://privatelocal.chat/version.json')
    a = ap.parse_args(argv)
    try: url = check_url(a.url)
    except ValueError as e: ap.error(str(e))
    print(json.dumps(asyncio.run(probe(a.usbmux_socket, a.pairing_cache, url)), indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
