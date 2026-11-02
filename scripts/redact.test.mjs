// Regression tests for the secret masker (src/lib/server/redact.ts). Run: npm test
// node:test + Node's TypeScript stripping; `--conditions=react-server` lets the 'server-only' import resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from '../src/lib/server/redact.ts';

const kept = (s) => assert.equal(redactSecrets(s), s, `masked a non-secret: ${s}`);
const masked = (s) => assert.ok(redactSecrets(s).includes('••••'), `left a secret visible: ${s}`);

test('keeps a word-prefixed UUID (Honcho openclawSessionKey)', () => {
  kept('agent:openclaw:openclaw-5253d45e-dac1-4c19-ba8c-fe47c03ff896');
});

test('keeps a Notion page URL with a hex page id', () => {
  kept('https://app.notion.com/p/volta-og/Video-Production-0f001eb37cd3417e8ba827621bb94c66?source=copy_link');
});

test('keeps document file names made of words, codes and dates', () => {
  kept('IMMACULATE CONSTELLATION-HHRG-118-GO12-Wstate-ShellenbergerM-20241113.pdf');
  kept('HHRG-118-GO06-TTF-FravorD-20230726.pdf');
  kept('22-F-0249_PA_EST_AOI_Mgmt_Sync_Group_05-16-23.pdf');
});

test('still masks random keys, with or without separators', () => {
  masked('token kq9Xv2Lm8Rt4Zb7Nw1Yc5Hd3Jf6Gp0Ts');
  masked('id aZ3k-9QpL_x7Vm2Rt8Yw4Nc6Hb1Jd5Kf8Lq2');
  masked('real key sk-ant-api03-uADY85gTq8xG5SkLm2Pq9Rw7Zt4Vb1Nc3Hj6Yk0Ud');
  masked('bk_us1_9fK2mQ7xL4pR8tZ3wN6vB1cY');
});

test('still masks hex keys named by a credential word', () => {
  masked('agnt_live_0123456789abcdef0123456789abcdef');
  masked('apikey_fedcba9876543210fedcba9876543210ab_0011223344556677');
  masked('MY_PLUGIN_API_KEY_0123ABCD4567EF89');
});
