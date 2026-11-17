#!/usr/bin/env python3
"""Read immediate iPhone storage headroom over an existing, trusted USB connection."""
import argparse
import asyncio
import json
import math
from pathlib import Path
import subprocess
import tempfile


def assess_storage(values, required_bytes):
    immediate = values.get('AmountDataAvailable')
    if isinstance(immediate, bool) or not isinstance(immediate, int) or immediate < 0:
        raise ValueError('Immediate device storage metric is unavailable; do not substitute TotalDataAvailable')
    return {
        'immediateAvailableBytes': immediate,
        'requiredBytes': required_bytes,
        'sufficientAtObservation': immediate >= required_bytes,
        'reportedTotalDataAvailableBytes': values.get('TotalDataAvailable'),
        'scope': 'Point-in-time advisory; successful writes still require runtime error handling',
    }


async def read_storage(socket, pairing_cache):
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.usbmux import list_devices
    devices = [d for d in await asyncio.wait_for(list_devices(usbmux_address=str(socket)), 10)
               if d.connection_type == 'USB']
    if len(devices) != 1:
        raise RuntimeError('Storage preflight requires exactly one trusted USB device')
    lockdown = await asyncio.wait_for(create_using_usbmux(
        usbmux_address=str(socket), serial=devices[0].serial, connection_type='USB', autopair=False,
        pairing_records_cache_folder=pairing_cache,
    ), 15)
    try:
        return await asyncio.wait_for(lockdown.get_value(domain='com.apple.disk_usage'), 10)
    finally:
        await asyncio.wait_for(lockdown.close(), 5)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument('--usbmux-socket', help='Existing local USB multiplexing socket')
    source.add_argument('--ssh-host', help='Trusted Mac SSH target, for example user@mac-host')
    p.add_argument('--ssh-port', type=int, default=2222)
    p.add_argument('--required-gib', type=float, default=3)
    p.add_argument('--pairing-cache', default=str(Path.home()/'.config/privatelocalchat/ios-pairing'))
    p.add_argument('--out', help='Optional operator receipt; keep under ignored work/')
    args = p.parse_args()
    if not math.isfinite(args.required_gib) or args.required_gib < 0:
        p.error('required-gib must be finite and nonnegative')
    pairing = Path(args.pairing_cache)
    pairing.mkdir(parents=True, exist_ok=True, mode=0o700)
    tunnel = None
    try:
        with tempfile.TemporaryDirectory(prefix='plc-ios-usbmux-') as directory:
            if args.ssh_host:
                socket = Path(directory)/'usbmux.sock'
                tunnel = subprocess.Popen([
                    'ssh', '-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
                    '-o', 'ConnectTimeout=8', '-p', str(args.ssh_port),
                    '-L', str(socket)+':/var/run/usbmuxd', '--', args.ssh_host,
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                async def ready():
                    for _ in range(100):
                        if tunnel.poll() is not None:
                            raise RuntimeError('The temporary Mac SSH tunnel exited')
                        if socket.is_socket():
                            return
                        await asyncio.sleep(.1)
                    raise TimeoutError('The temporary Mac SSH tunnel did not become ready')
                asyncio.run(ready())
            else:
                socket = Path(args.usbmux_socket)
            values = asyncio.run(read_storage(socket, pairing))
            report = assess_storage(values, math.ceil(args.required_gib*1024**3))
            if args.out:
                Path(args.out).write_text(json.dumps(report, indent=2)+'\n')
            print(json.dumps(report))
            return 0 if report['sufficientAtObservation'] else 2
    finally:
        if tunnel:
            tunnel.terminate()
            try:
                tunnel.wait(timeout=5)
            except subprocess.TimeoutExpired:
                tunnel.kill()
                tunnel.wait()


if __name__ == '__main__':
    raise SystemExit(main())
