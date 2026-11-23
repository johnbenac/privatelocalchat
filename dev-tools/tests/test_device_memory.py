import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('device_memory', Path(__file__).resolve().parents[2]/'dev-tools/operator-device-memory.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeviceMemoryTests(unittest.TestCase):
    def test_only_selected_browser_metadata_is_saved(self):
        rows = [{'pid': 1, 'name': 'com.apple.WebKit.WebContent', 'physFootprint': 123, 'secret': 'omit'},
                {'pid': 2, 'name': 'MobileSafari', 'physFootprint': 456},
                {'pid': 3, 'name': 'UnrelatedApp', 'physFootprint': 789}]
        self.assertEqual(module.browser_samples(rows, [1]), [{'pid': 1, 'name': 'com.apple.WebKit.WebContent', 'footprintBytes': 123}])

    def test_invalid_metrics_and_boolean_pids_are_not_reported_as_measurements(self):
        rows = [{'pid': True, 'name': 'MobileSafari', 'physFootprint': 1},
                {'pid': 2, 'name': 'MobileSafari', 'physFootprint': float('nan'), 'memResidentSize': -1, 'memCompressed': True, 'cpuUsage': 0.5}]
        self.assertEqual(module.browser_samples(rows), [{'pid': 2, 'name': 'MobileSafari', 'cpuUsage': 0.5}])

    def test_the_tunnel_gets_remotepairing_fallback_only_when_the_library_takes_it(self):
        class Old:
            def __init__(self, serial, autopair):
                self.options = {'serial': serial, 'autopair': autopair}

        class New:
            def __init__(self, serial, autopair, remotepairing_fallback=True):
                self.options = {'serial': serial, 'autopair': autopair, 'remotepairing_fallback': remotepairing_fallback}

        class Transport:
            pass

        Transport.UserspaceRsdTunnel = Old
        self.assertEqual(module.make_tunnel(Transport, 'S1').options, {'serial': 'S1', 'autopair': False})
        Transport.UserspaceRsdTunnel = New
        self.assertEqual(module.make_tunnel(Transport, 'S1').options, {'serial': 'S1', 'autopair': False, 'remotepairing_fallback': False})

