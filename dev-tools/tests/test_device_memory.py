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
