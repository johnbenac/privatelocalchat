#!/usr/bin/env python3
"""Bounded read-only iPhone process-memory sampling over an existing trusted USB socket."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time


def browser_samples(rows, pids=()):
    selected = []
    fields = {'physFootprint': 'footprintBytes', 'memResidentSize': 'residentBytes',
              'memCompressed': 'compressedBytes', 'memRPrvt': 'privateResidentBytes',
              'uniqueID': 'processUniqueId', 'cpuUsage': 'cpuUsage'}
    for row in rows:
        pid = row.get('pid')
        if isinstance(pid, bool) or not isinstance(pid, int):
            continue
        if row.get('name') not in ('com.apple.WebKit.WebContent', 'MobileSafari'):
            continue
        if pids and pid not in pids:
            continue
        item = {'pid': pid, 'name': row['name']}
        for source, target in fields.items():
            value = row.get(source)
            if (not isinstance(value, bool) and isinstance(value, (int, float))
                    and math.isfinite(value) and value >= 0):
                item[target] = value
        selected.append(item)
    return selected


async def collect(args):
    # Optional device libraries stay out of ordinary builds and stdlib-only tests.
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.usbmux import list_devices
    from pymobiledevice3.remote import userspace_tunnel as transport
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.sysmontap import Sysmontap

    devices = [d for d in await asyncio.wait_for(list_devices(usbmux_address=args.usbmux_socket), 10)
               if d.connection_type == 'USB']
    if len(devices) != 1:
        raise RuntimeError('Sampling requires exactly one trusted USB device')
    serial = devices[0].serial

    async def trusted_connection(**kwargs):
        if kwargs.get('serial') not in (None, serial):
            raise RuntimeError('Unexpected device selection')
        return await create_using_usbmux(
            serial=serial, usbmux_address=args.usbmux_socket, autopair=False,
            pairing_records_cache_folder=Path(args.pairing_cache))

    # This optional library resolves USB internally. Inject only its connection factory
    # in this standalone process; never alter Mac interfaces or global asyncio networking.
    previous = transport.create_using_usbmux
    transport.create_using_usbmux = trusted_connection
    tunnel = transport.UserspaceRsdTunnel(serial=serial, autopair=False, remotepairing_fallback=False)
    count = total_bytes = 0
    started = time.monotonic()
    try:
        rsd = await asyncio.wait_for(tunnel.aopen(), 30)
        async with DvtProvider(rsd) as provider:
            tap = await Sysmontap.create(provider, interval=args.interval_ms)
            async with tap:
                with Path(args.out).open('w') as output:
                    try:
                        async with asyncio.timeout(args.duration_seconds):
                            async for rows in tap.iter_processes():
                                sample = {'receivedAt': datetime.now(timezone.utc).isoformat(),
                                          'elapsedMs': round((time.monotonic()-started)*1000),
                                          'processes': browser_samples(rows, args.pid)}
                                line = json.dumps(sample)+'\n'
                                total_bytes += len(line.encode())
                                if total_bytes > 20_000_000:
                                    break
                                output.write(line)
                                output.flush()
                                count += 1
                    except TimeoutError:
                        pass
    finally:
        try:
            await asyncio.wait_for(tunnel.aclose(), 15)
        finally:
            transport.create_using_usbmux = previous
    return {'samples': count, 'bytes': total_bytes, 'durationMs': round((time.monotonic()-started)*1000),
            'radiosOrMacInterfacesChanged': False, 'scope': 'Received-time process samples; bytes are distinct accounting views, not additive.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--usbmux-socket', required=True)
    p.add_argument('--pairing-cache', default=str(Path.home()/'.config/privatelocalchat/ios-pairing'))
    p.add_argument('--duration-seconds', type=int, default=600)
    p.add_argument('--interval-ms', type=int, default=1000)
    p.add_argument('--pid', type=int, action='append', default=[])
    p.add_argument('--out', required=True, help='Private JSONL under this project work/ directory')
    args = p.parse_args()
    if not 1 <= args.duration_seconds <= 3600 or not 250 <= args.interval_ms <= 60000:
        p.error('Duration must be 1–3600 seconds and interval 250–60000 ms')
    root = Path(__file__).resolve().parent.parent/'work'
    if not Path(args.out).resolve().is_relative_to(root.resolve()):
        p.error('Raw device samples must be saved under the ignored project work/ directory')
    async def bounded():
        return await asyncio.wait_for(collect(args), args.duration_seconds+90)
    print(json.dumps(asyncio.run(bounded())))


if __name__ == '__main__':
    main()
