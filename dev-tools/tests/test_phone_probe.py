import importlib.util, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('operator_phone_probe', Path(__file__).resolve().parent.parent / 'operator-phone-probe.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)  # imports nothing optional at load: pymobiledevice3 is imported only when a probe runs


class CheckUrl(unittest.TestCase):
    def test_allowed_pages(self):
        for url in ('https://privatelocal.chat/version.json', 'https://dev.privatelocal.chat/', 'https://privatelocal.chat:443/x'):
            self.assertEqual(probe.check_url(url), url)

    def test_refused_pages(self):
        for url in ('http://privatelocal.chat/', 'https://example.org/', 'https://privatelocal.chat.evil.example/', 'https://user:pw@privatelocal.chat/',
                    'https://privatelocal.chat:8443/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://evilprivatelocal.chat/'):
            with self.assertRaises(ValueError, msg=url):
                probe.check_url(url)


if __name__ == '__main__':
    unittest.main()
