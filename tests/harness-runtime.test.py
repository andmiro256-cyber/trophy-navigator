"""Runtime contracts: strict native API, WebDriver failures and durable audit steps.

Run: python3 tests/harness-runtime.test.py
"""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('harness_wd', ROOT / 'tools/harness/wd.py')
wd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wd)


class HarnessRuntime(unittest.TestCase):
    def setUp(self):
        wd.CLICKLOG.clear()
        wd.GAPS.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        Path(self.tmp.name, 'logs').mkdir()
        self.audit = patch.object(wd, 'A', self.tmp.name)
        self.audit.start()
        self.addCleanup(self.audit.stop)

    def test_webdriver_errors_raise_instead_of_becoming_js_values(self):
        error = {'value': {'error': 'javascript error', 'message': 'missing API'}}
        with patch.object(wd, 'req', return_value=error):
            with self.assertRaisesRegex(RuntimeError, 'javascript error: missing API'):
                wd.S('test-session').js('missing.method()')
        with patch.object(wd, 'req', return_value={'value': {'count': 3}}):
            self.assertEqual(wd.S('test-session').js('return model'), {'count': 3})

    def test_strict_missing_native_api_never_injects_sources(self):
        browser = Mock()
        browser.js.return_value = False
        with patch.object(wd, 'STRICT', True):
            with self.assertRaisesRegex(RuntimeError, 'native __tnTest'):
                wd.tn_install(browser)
        browser.js.assert_called_once_with('return !!window.__tnTest')
        self.assertNotIn('injected', wd.GAPS)

    def test_strict_native_api_never_installs_gap_shim(self):
        def execute(source):
            if source == 'return !!window.__tnTest': return True
            if source.startswith('try { return __tnTest.size()'): return True
            if source == 'return __tnTest.engine': return 'leaflet'
            if source == 'return __tnTest.VERSION': return 2
            if source == wd.HARNESS_JS: return 14
            self.fail('Unexpected script injection in strict mode')
        browser = Mock()
        browser.js.side_effect = execute
        with patch.object(wd, 'STRICT', True):
            result = wd.tn_install(browser)
        self.assertTrue(result['strict'])
        self.assertNotIn('installed', result)

    def persisted(self, prefix):
        return json.loads(Path(self.tmp.name, 'logs', prefix + '.json').read_text())

    def test_extra_js_error_fails_and_is_saved_before_scenario_end(self):
        browser = Mock()
        browser.js.side_effect = RuntimeError('javascript error: missing geometry')
        rec = wd.Rec(browser, 'extra-error')
        with patch.object(wd, 'st', side_effect=lambda _: {}), patch.object(wd.time, 'sleep'):
            row = rec('geometry', extra='return missing()', shot=False)
        self.assertEqual(row['status'], 'FAIL')
        self.assertIn('missing geometry', row['pyerr'])
        self.assertEqual(self.persisted('extra-error'), [row])

    def test_missing_click_fails_only_its_step_and_is_saved_immediately(self):
        browser = Mock()
        browser.js.return_value = None
        rec = wd.Rec(browser, 'missing-click')
        with patch.object(wd, 'st', side_effect=lambda _: {}), patch.object(wd.time, 'sleep'):
            failed = rec('missing button', lambda: wd.click(browser, '#missing'), shot=False)
            self.assertEqual(self.persisted('missing-click'), [failed])
            passed = rec('following observation', shot=False)
        self.assertEqual(failed['status'], 'FAIL')
        self.assertIn('#missing', failed['click_errors'][0])
        self.assertEqual(passed['status'], 'PASS')
        self.assertEqual(len(self.persisted('missing-click')), 2)


if __name__ == '__main__':
    unittest.main()
