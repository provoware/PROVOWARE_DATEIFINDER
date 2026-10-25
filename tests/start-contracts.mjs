import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const starter = resolve('start.sh');
const nobody = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};

function mockFile(path, content) {
  writeFileSync(path, content, { mode: 0o755 });
  chmodSync(path, 0o755);
}

function fixture({ project = true, cargo = true, modules = true, packages = true, npmLsFails = false, appFails = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'provoware-starter-'));
  // Tests dürfen als root laufen; der eigentliche Starter wird dann gezielt
  // als unprivilegierter Nutzer in diesem isolierten Testordner ausgeführt.
  chmodSync(directory, 0o777);
  const bin = join(directory, 'bin');
  const home = join(directory, 'home');
  mkdirSync(bin, { mode: 0o755 });
  mkdirSync(home, { mode: 0o777 });
  chmodSync(home, 0o777);
  copyFileSync(starter, join(directory, 'start.sh'));
  chmodSync(join(directory, 'start.sh'), 0o755);

  if (project) {
    mkdirSync(join(directory, 'src-tauri'), { mode: 0o755 });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      scripts: { tauri: 'tauri' },
      devDependencies: { '@tauri-apps/cli': '2.11.4' },
    }));
    writeFileSync(join(directory, 'src-tauri', 'Cargo.toml'), '[package]\nname="test"\nversion="0.1.0"\n');
  }
  if (modules) mkdirSync(join(directory, 'node_modules'), { mode: 0o755 });

  mockFile(join(bin, 'npm'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$MOCK_CALLS"
case "$1" in
  --version) echo 11.0.0 ;;
  ls) [[ "$MOCK_NPM_LS_FAIL" != 1 ]] ;;
  run) [[ "$MOCK_APP_FAIL" != 1 ]] ;;
  *) exit 0 ;;
esac
`);
  mockFile(join(bin, 'dpkg-query'), `#!/usr/bin/env bash
if [[ "$MOCK_PACKAGES_INSTALLED" == 1 ]]; then
  printf 'install ok installed'
else
  printf 'not-installed'
fi
`);
  if (cargo) {
    mockFile(join(bin, 'cargo'), `#!/usr/bin/env bash
if [[ "$1" == --version ]]; then echo 'cargo 1.98.1'; else echo '{}'; fi
`);
  }
  mockFile(join(bin, 'sudo'), '#!/usr/bin/env bash\necho SUDO_CALLED >> "$MOCK_CALLS"\nexit 89\n');
  mockFile(join(bin, 'curl'), '#!/usr/bin/env bash\necho CURL_CALLED >> "$MOCK_CALLS"\nexit 90\n');

  const calls = join(directory, 'calls.log');
  const env = {
    ...process.env,
    PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
    HOME: home,
    XDG_STATE_HOME: directory,
    DISPLAY: ':99',
    WAYLAND_DISPLAY: '',
    MOCK_CALLS: calls,
    MOCK_PACKAGES_INSTALLED: packages ? '1' : '0',
    MOCK_NPM_LS_FAIL: npmLsFails ? '1' : '0',
    MOCK_APP_FAIL: appFails ? '1' : '0',
  };

  return {
    directory,
    calls,
    run(args) {
      return spawnSync('/bin/bash', [join(directory, 'start.sh'), ...args], {
        cwd: directory, env, encoding: 'utf8', timeout: 12_000, ...nobody,
      });
    },
    callsText() {
      try { return readFileSync(calls, 'utf8'); } catch { return ''; }
    },
    cleanup() { rmSync(directory, { recursive: true, force: true }); },
  };
}

test('Hilfe ist ohne Projekt und ohne Änderungen verfügbar', () => {
  const f = fixture({ project: false });
  try {
    const result = f.run(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--check/);
    assert.equal(f.callsText(), '');
  } finally { f.cleanup(); }
});

test('Fehlender Projektinhalt stoppt vor Reparatur oder Start', () => {
  const f = fixture({ project: false });
  try {
    const result = f.run(['--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /package\.json fehlt/);
    assert.equal(f.callsText(), '');
  } finally { f.cleanup(); }
});

test('Prüfmodus wird grün ohne die App zu starten', () => {
  const f = fixture();
  try {
    const result = f.run(['--check']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Vorprüfung erfolgreich/);
    assert.doesNotMatch(f.callsText(), /run tauri|^ci|^install/m);
  } finally { f.cleanup(); }
});

test('Normalmodus startet Tauri nach erfolgreicher Vorprüfung', () => {
  const f = fixture();
  try {
    const result = f.run([]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(f.callsText(), /run tauri -- dev/);
  } finally { f.cleanup(); }
});

test('Fehlendes Cargo im Prüfmodus löst keine Installation aus', () => {
  const f = fixture({ cargo: false });
  try {
    const result = f.run(['--check']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Cargo/);
    assert.doesNotMatch(f.callsText(), /SUDO_CALLED|CURL_CALLED|run tauri/);
  } finally { f.cleanup(); }
});

test('Fehlende npm-Pakete werden bei --no-repair nicht verändert', () => {
  const f = fixture({ modules: false });
  try {
    const result = f.run(['--no-repair']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /JavaScript-Bausteine fehlen/);
    assert.doesNotMatch(f.callsText(), /^ci|^install|run tauri/m);
  } finally { f.cleanup(); }
});

test('Systemreparatur wird bei --check niemals ausgeführt', () => {
  const f = fixture({ packages: false });
  try {
    const result = f.run(['--check']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Systempakete/);
    assert.doesNotMatch(f.callsText(), /SUDO_CALLED|CURL_CALLED|run tauri/);
  } finally { f.cleanup(); }
});

test('Gleichzeitiger zweiter Start wird ohne Seiteneffekte blockiert', async () => {
  const f = fixture();
  let locker;
  try {
    const key = spawnSync('cksum', { input: f.directory, encoding: 'utf8' }).stdout.trim().split(/\s+/)[0];
    const state = join(f.directory, 'provoware-dateifinder', key);
    mkdirSync(state, { recursive: true, mode: 0o777 });
    chmodSync(state, 0o777);
    const lockPath = join(state, 'start.lock');
    writeFileSync(lockPath, '');
    chmodSync(lockPath, 0o666);
    locker = spawn('flock', ['-n', '-F', lockPath, 'sleep', '4'], { stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = f.run(['--check']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /bereits gestartet/);
    assert.doesNotMatch(f.callsText(), /run tauri|SUDO_CALLED|CURL_CALLED/);
  } finally {
    locker?.kill('SIGTERM');
    f.cleanup();
  }
});

test('Fehlerhafter App-Start wird mit verständlichem Fehler beendet', () => {
  const f = fixture({ appFails: true });
  try {
    const result = f.run([]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Anwendung wurde mit Fehlercode/);
    assert.match(f.callsText(), /run tauri -- dev/);
  } finally { f.cleanup(); }
});
