"""Regression for the misleading total-capacity reading observed on the physical phone."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('storage_preflight', Path(__file__).parents[1]/'operator-device-storage.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class StoragePreflightTests(unittest.TestCase):
    def test_observed_large_total_does_not_admit_another_model_download(self):
        result = module.assess_storage({'AmountDataAvailable':505454592,
                                       'TotalDataAvailable':76507250688}, 3*1024**3)
        self.assertFalse(result['sufficientAtObservation'])
        self.assertEqual(result['immediateAvailableBytes'], 505454592)

    def test_missing_or_invalid_immediate_reading_does_not_fall_back_to_total(self):
        for value in [None, True, -1, '76507250688']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.assess_storage({'AmountDataAvailable':value,
                                       'TotalDataAvailable':76507250688}, 3*1024**3)

    def test_enough_immediate_headroom_can_admit_the_next_trial(self):
        self.assertTrue(module.assess_storage({'AmountDataAvailable':4*1024**3},3*1024**3)
                        ['sufficientAtObservation'])

if __name__ == '__main__':
    unittest.main()
