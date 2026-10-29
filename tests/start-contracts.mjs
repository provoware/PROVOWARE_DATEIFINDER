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
  run)
    if [[ "$MOCK_APP_PORT_RACE" == 1 && ! -e "$MOCK_PORT_MARKER" ]]; then
      : > "$MOCK_PORT_MARKER"
      echo 'Error: Port 1420 is already in use' >&2
      exit 1
    fi
    [[ "$MOCK_APP_FAIL" != 1 ]]
    ;;
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
  mockFile(join(bin, 'ss'), `#!/usr/bin/env bash
if [[ "$MOCK_PORT_WITHOUT_OWNER" == 1 ]]; then
  echo 'LISTEN 0 511 127.0.0.1:1420 0.0.0.0:*'
  exit 0
fi
if [[ "$MOCK_APP_PORT_RACE" == 1 && ! -e "$MOCK_PORT_MARKER" ]]; then exit 0; fi
if [[ -n "$MOCK_PORT_PID" && -r "/proc/$MOCK_PORT_PID/stat" ]]; then
  status="$(awk '{print $3}' "/proc/$MOCK_PORT_PID/stat")"
  if [[ "$status" != Z ]]; then
    printf 'LISTEN 0 511 127.0.0.1:1420 0.0.0.0:* users:(("node",pid=%s,fd=19))\\n' "$MOCK_PORT_PID"
  fi
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
    MOCK_APP_PORT_RACE: '0',
    MOCK_PORT_WITHOUT_OWNER: '0',
    MOCK_PORT_MARKER: join(directory, 'port-claimed.marker'),
  };

  return {
    directory,
    calls,
    env,
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

function mockViteProcess(f) {
  const viteDir = join(f.directory, 'node_modules', 'vite', 'bin');
  mkdirSync(viteDir, { recursive: true, mode: 0o755 });
  const vitePath = join(viteDir, 'vite.js');
  writeFileSync(vitePath, 'setInterval(() => {}, 1000);\n');
  const child = spawn(process.execPath, [vitePath, '--port', '1420'], {
    cwd: f.directory,
    stdio: 'ignore',
    ...nobody,
  });
  f.env.MOCK_PORT_PID = String(child.pid);
  return child;
}

test('Hilfe ist ohne Projekt und ohne Änderungen verfügbar', () => {
  const f = fixture({ project: false });
  try {
    const result = f.run(['--help']);
    assert.equal(result.status, 0, JSON.stringify({ signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }));
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

test('Prüfmodus meldet belegten Port ohne Prozesse zu beenden', async () => {
  const f = fixture();
  const vite = mockViteProcess(f);
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = f.run(['--check']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Port 1420 ist bereits belegt/);
    assert.match(result.stdout, /mit Hinweis abgeschlossen/);
    assert.equal(vite.exitCode, null);
    assert.doesNotMatch(f.callsText(), /run tauri/);
  } finally { vite.kill('SIGTERM'); f.cleanup(); }
});

test('Nur eindeutig eigener Vite-Prozess wird mit --yes beendet', async () => {
  const f = fixture();
  const vite = mockViteProcess(f);
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = f.run(['--yes']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Eigener Vite-Prozess/);
    assert.match(result.stdout, /Port 1420 ist wieder frei/);
    assert.match(f.callsText(), /run tauri -- dev/);
  } finally { vite.kill('SIGTERM'); f.cleanup(); }
});

test('Fremder Prozess bleibt auch mit --yes unangetastet', async () => {
  const f = fixture();
  const stranger = spawn('sleep', ['20'], { cwd: f.directory, stdio: 'ignore', ...nobody });
  try {
    f.env.MOCK_PORT_PID = String(stranger.pid);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = f.run(['--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /wird nicht beendet/);
    assert.equal(stranger.exitCode, null);
    assert.doesNotMatch(f.callsText(), /run tauri/);
  } finally { stranger.kill('SIGTERM'); f.cleanup(); }
});

test('--no-repair stoppt bei eigenem belegten Port ohne Signal', async () => {
  const f = fixture();
  const vite = mockViteProcess(f);
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = f.run(['--no-repair']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Keine Prozesse wurden verändert/);
    assert.equal(vite.exitCode, null);
    assert.doesNotMatch(f.callsText(), /run tauri/);
  } finally { vite.kill('SIGTERM'); f.cleanup(); }
});

test('Portbelegung ohne eindeutige PID wird auch mit --yes nie beendet', () => {
  const f = fixture();
  try {
    f.env.MOCK_PORT_WITHOUT_OWNER = '1';
    const result = f.run(['--yes']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /nicht eindeutig erkennbar/);
    assert.doesNotMatch(f.callsText(), /run tauri/);
  } finally { f.cleanup(); }
});

test('Später Portkonflikt wird höchstens einmal nach sicherem Stopp neu versucht', async () => {
  const f = fixture();
  const vite = mockViteProcess(f);
  try {
    f.env.MOCK_APP_PORT_RACE = '1';
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = f.run(['--yes']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Portkonflikt erst während des Starts erkannt/);
    assert.match(result.stdout, /Zweiter und letzter Startversuch/);
    assert.equal(f.callsText().match(/run tauri -- dev/g)?.length, 2);
  } finally { vite.kill('SIGTERM'); f.cleanup(); }
});

test('Tauri-Versionsprüfung akzeptiert kompatible Versionspräfixe', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, 'package.json'), JSON.stringify({
      scripts: { tauri: 'tauri' }, devDependencies: { '@tauri-apps/cli': '^2.11.4' },
    }));
    const result = f.run(['--check']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Vorprüfung erfolgreich/);
  } finally { f.cleanup(); }
});

for (const version of ['^3.2.0', '12.0.0']) {
  test(`Nicht unterstützte Tauri-Version ${version} stoppt vor Systemänderungen`, () => {
    const f = fixture({ packages: false });
    try {
      writeFileSync(join(f.directory, 'package.json'), JSON.stringify({
        scripts: { tauri: 'tauri' }, devDependencies: { '@tauri-apps/cli': version },
      }));
      const result = f.run(['--yes']);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /nicht als Tauri 2 bestätigt/);
      assert.doesNotMatch(f.callsText(), /SUDO_CALLED|CURL_CALLED|run tauri/);
    } finally { f.cleanup(); }
  });
}
