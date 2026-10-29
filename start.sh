#!/usr/bin/env bash
# PROVOWARE DateiFinder – verständlicher, fehlertoleranter Entwicklungsstarter
# Zielsysteme: Ubuntu / Kubuntu / Linux Mint (Tauri 2)
# Aufruf: ./start.sh [--check] [--no-repair] [--yes] [--audit] [--help]

set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd -- "$PROJECT_DIR"

CHECK_ONLY=0
AUTO_REPAIR=1
YES=0
AUDIT=0
PHASE="Initialisierung"
LOG_FILE=""
TMP_INSTALLER=""
START_WARNING=0
PORT_LISTENERS=""
DEV_PORT=1420

usage() {
  cat <<'HELP'
PROVOWARE DateiFinder – sicherer Start

  ./start.sh              Prüfen, fehlende Komponenten nach Zustimmung
                          installieren und den DateiFinder starten.
  ./start.sh --check      Nur prüfen, nichts verändern und nicht starten.
  ./start.sh --no-repair  Starten, wenn bereits alles frei und vorhanden ist.
  ./start.sh --yes        Sichere Reparaturen ohne Rückfrage freigeben:
                          fehlende Pakete und eigene verwaiste Vite-Prozesse.
  ./start.sh --audit      Zusätzlich npm-Sicherheitsprüfung durchführen.
  ./start.sh --help       Diese Hilfe anzeigen.

Wichtig: Fremde Prozesse werden nie beendet. Eigene Vite-Prozesse nur,
wenn Benutzer, Projektordner und Startbefehl eindeutig übereinstimmen.
Kein "npm audit fix --force", "apt upgrade" oder Quellcode-Löschen.
HELP
}

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1; AUTO_REPAIR=0 ;;
    --no-repair) AUTO_REPAIR=0 ;;
    --yes) YES=1 ;;
    --audit) AUDIT=1 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unbekannte Option: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

say() {
  printf '%s\n' "$*"
  if [[ -n "$LOG_FILE" ]]; then printf '%s\n' "$*" >> "$LOG_FILE"; fi
}

diagnose_log() {
  local recent
  [[ -n "$LOG_FILE" && -s "$LOG_FILE" ]] || return 0
  recent="$(tail -n 100 "$LOG_FILE")"
  if grep -Eqi 'ENOSPC|No space left on device' <<< "$recent"; then
    say "  Tipp: Der Speicherplatz ist knapp. Bitte freien Festplattenspeicher prüfen."
  elif grep -Eqi 'EADDRINUSE|address already in use|port [0-9]+ is( already)? in use' <<< "$recent"; then
    say "  Tipp: Der benötigte Netzwerkport ist schon belegt. Ein anderer Programmstart könnte noch laufen."
  elif grep -Eqi 'EACCES|permission denied|Zugriff verweigert' <<< "$recent"; then
    say "  Tipp: Es fehlen Zugriffsrechte. Projekt möglichst im eigenen Benutzerordner ausführen."
  elif grep -Eqi 'EAI_AGAIN|ENOTFOUND|could not resolve|failed to download|network is unreachable' <<< "$recent"; then
    say "  Tipp: Download nicht erreichbar. Internetverbindung oder DNS prüfen und erneut versuchen."
  elif grep -Eqi 'unable to locate package|has no installation candidate' <<< "$recent"; then
    say "  Tipp: Ein Linux-Paket fehlt in den eingerichteten Paketquellen. Bitte Ubuntu-/Mint-Version prüfen."
  elif grep -Eqi 'could not get lock|unable to acquire the dpkg frontend lock' <<< "$recent"; then
    say "  Tipp: Die Paketverwaltung arbeitet schon. Bitte deren laufenden Vorgang abwarten."
  elif grep -Eqi 'npm ci can only install packages|package.json and package-lock.json are not in sync' <<< "$recent"; then
    say "  Tipp: package.json und package-lock.json passen nicht zusammen. Vor Änderungen beide Dateien sichern und npm install prüfen."
  elif grep -Eqi 'failed to parse manifest|failed to load manifest' <<< "$recent"; then
    say "  Tipp: In src-tauri/Cargo.toml könnte eine fehlerhafte Projektangabe stehen."
  elif grep -Eqi 'libwebkit2gtk|webkit2gtk.*not found' <<< "$recent"; then
    say "  Tipp: Die WebKitGTK-Bibliothek wird nicht gefunden. Linux-Systempakete prüfen."
  fi
}

fail() {
  say ""
  say "✗ Stopp bei: $PHASE"
  say "  $1"
  diagnose_log
  say "  Der Starter hat keine Quellcodedateien gelöscht."
  if [[ -n "$LOG_FILE" ]]; then say "  Diagnoseprotokoll: $LOG_FILE"; fi
  exit "${2:-1}"
}

unexpected_error() {
  local status="$1"
  trap - ERR
  fail "Ein unerwarteter Fehler ist aufgetreten (Code $status)." "$status"
}

interrupted() {
  trap - INT TERM
  fail "Vorgang auf Wunsch abgebrochen. Du kannst ihn jederzeit neu starten." 130
}

cleanup() {
  if [[ -n "$TMP_INSTALLER" && -f "$TMP_INSTALLER" ]]; then
    command rm -f -- "$TMP_INSTALLER"
  fi
}

trap 'unexpected_error "$?"' ERR
trap interrupted INT TERM
trap cleanup EXIT

if [[ "${EUID:-$(id -u)}" == 0 ]]; then
  fail "Bitte als normaler Benutzer starten, nicht mit sudo ./start.sh."
fi

if [[ "$(uname -s)" != Linux ]]; then
  fail "Dieser Starter unterstützt derzeit nur Linux."
fi

# Pro Projekt ein Protokoll anlegen, ohne den Quellcode zu verändern.
project_key="$(printf '%s' "$PROJECT_DIR" | cksum | awk '{print $1}')"
state_base="${XDG_STATE_HOME:-${HOME}/.local/state}"
state_dir="${state_base}/provoware-dateifinder/${project_key}"
mkdir -p -- "$state_dir/logs"
LOG_FILE="$state_dir/logs/start-$(date +%Y%m%d-%H%M%S)-$$.log"
: > "$LOG_FILE"

say ""
say "╔══════════════════════════════════════════════════════╗"
say "║     PROVOWARE DateiFinder – Startassistent           ║"
say "╚══════════════════════════════════════════════════════╝"
say "Projekt: $PROJECT_DIR"
say ""

PHASE="Parallele Starts verhindern"
if command -v flock >/dev/null 2>&1; then
  exec 9> "$state_dir/start.lock"
  if ! flock -n 9; then
    fail "Der DateiFinder wird bereits gestartet. Bitte das andere Fenster prüfen."
  fi
else
  say "! Hinweis: Schutz vor doppeltem Start nicht verfügbar (flock fehlt)."
fi

consent() {
  local question="$1" response
  if (( CHECK_ONLY || ! AUTO_REPAIR )); then return 1; fi
  if (( YES )); then return 0; fi
  if [[ ! -t 0 ]]; then
    say "! Keine Eingabe möglich. Mit --yes erlaubst du Installationen ausdrücklich."
    return 1
  fi
  printf '\n%s [j/N]: ' "$question"
  read -r response || return 1
  case "$response" in
    j|J|ja|Ja|JA|y|Y|yes|Yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# Nur den lokalen Entwicklungsport prüfen. Weder fremde Dienste noch andere
# DateiFinder-Kopien dürfen vom Reparaturassistenten beendet werden.
read_port_listeners() {
  PORT_LISTENERS=""
  command -v ss >/dev/null 2>&1 || return 2
  if ! PORT_LISTENERS="$(ss -H -ltnp "( sport = :$DEV_PORT )" 2>>"$LOG_FILE")"; then
    return 2
  fi
  [[ -z "$PORT_LISTENERS" ]]
}

is_own_vite_process() {
  local pid="$1" uid cwd executable command_line
  [[ "$pid" =~ ^[0-9]+$ && -d "/proc/$pid" ]] || return 1
  uid="$(stat -c '%u' "/proc/$pid" 2>/dev/null)" || return 1
  [[ "$uid" == "${EUID:-$(id -u)}" ]] || return 1
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" || return 1
  [[ "$cwd" == "$PROJECT_DIR" ]] || return 1
  executable="$(readlink -f "/proc/$pid/exe" 2>/dev/null)" || return 1
  [[ "${executable##*/}" == node || "${executable##*/}" == nodejs ]] || return 1
  command_line="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" || return 1
  # Vite startet im Projekt als Node-Skript, nie nur nach dem Prozessnamen
  # "node" entscheiden. Ein ähnlicher Fremdprozess reicht nicht aus.
  [[ "$command_line" == *"node_modules/.bin/vite"* ||
     "$command_line" == *"node_modules/vite/bin/vite.js"* ]] || return 1
  [[ "$command_line" == *"--port $DEV_PORT"* ]]
}

ensure_dev_port_available() {
  local status pid attempt
  local -a pids=()
  if read_port_listeners; then return 0; else status=$?; fi

  if (( status == 2 )); then
    say "  ! Portprüfung nicht verfügbar (Werkzeug ss fehlt oder liefert einen Fehler)."
    say "    Bei einem Startfehler hilft: sudo ss -ltnp '( sport = :$DEV_PORT )'"
    START_WARNING=1
    return 0
  fi

  say "  ! Port $DEV_PORT ist bereits belegt. Der DateiFinder kann so nicht starten."
  if (( CHECK_ONLY )); then
    say "    Keine Änderung vorgenommen. Belegenden Prozess prüfen: ss -ltnp '( sport = :$DEV_PORT )'"
    START_WARNING=1
    return 0
  fi

  mapfile -t pids < <(grep -oE 'pid=[0-9]+' <<< "$PORT_LISTENERS" | cut -d= -f2 | sort -u)
  if (( ${#pids[@]} != 1 )); then
    fail "Der belegende Prozess ist nicht eindeutig erkennbar. Bitte mit 'sudo ss -ltnp ( sport = :$DEV_PORT )' prüfen und das andere Programm selbst schließen."
  fi
  pid="${pids[0]}"
  if ! is_own_vite_process "$pid"; then
    fail "Port $DEV_PORT gehört keinem eindeutig zugeordneten Vite-Prozess aus diesem Projekt. PID $pid wird nicht beendet. Bitte den anderen Dienst selbst schließen."
  fi

  say "  ✓ Eigener Vite-Prozess aus diesem Projekt erkannt (PID $pid)."
  if ! consent "Diesen alten Entwicklungsserver sicher beenden und neu starten?"; then
    fail "Port $DEV_PORT bleibt belegt. Keine Prozesse wurden verändert."
  fi

  # Vor dem Signal erneut zuordnen (Schutz bei zwischenzeitlichem PID-Wechsel).
  if ! is_own_vite_process "$pid"; then
    fail "Der Prozess hat sich inzwischen verändert. Aus Sicherheitsgründen kein Beenden."
  fi
  if ! kill -TERM -- "$pid" 2>>"$LOG_FILE"; then
    fail "Der alte Vite-Prozess konnte nicht beendet werden. Bitte selbst prüfen."
  fi
  say "  … Warte, bis Port $DEV_PORT wieder frei ist."
  for (( attempt = 0; attempt < 20; attempt++ )); do
    sleep 0.2
    if read_port_listeners; then
      say "  ✓ Port $DEV_PORT ist wieder frei."
      return 0
    fi
  done
  fail "Port $DEV_PORT bleibt trotz Stoppsignal belegt. Kein erzwungenes Beenden; bitte Prozess prüfen."
}

run_step() {
  local title="$1"
  shift
  say "  … $title (das kann einige Minuten dauern)"
  if "$@" >> "$LOG_FILE" 2>&1; then
    say "  ✓ $title abgeschlossen"
  else
    say "  ! Technische Einzelheiten (letzte 12 Protokollzeilen):"
    tail -n 12 "$LOG_FILE" >&2 || true
    fail "$title ist fehlgeschlagen. Bitte Internetverbindung, Speicherplatz und Protokoll prüfen."
  fi
}

PHASE="Projektstruktur prüfen"
say "[1/7] Prüfe die Projektdateien …"
[[ -f package.json ]] || fail "Die Datei package.json fehlt. Lege start.sh ins Hauptverzeichnis des Projekts."
[[ -f src-tauri/Cargo.toml ]] || fail "src-tauri/Cargo.toml fehlt. Das Tauri-Projekt ist unvollständig."
say "  ✓ Projektordner erkannt"

PHASE="Betriebssystem ermitteln"
say "[2/7] Ermittle das Betriebssystem …"
if [[ -r /etc/os-release ]]; then
  # os-release ist eine vom Betriebssystem bereitgestellte Datendatei.
  . /etc/os-release
fi
say "  ✓ ${PRETTY_NAME:-Linux}"

is_debian_family=0
case " ${ID:-} ${ID_LIKE:-} " in
  *ubuntu*|*debian*|*linuxmint*) is_debian_family=1 ;;
esac

# Rustup setzt Cargo normalerweise unter ~/.cargo/bin ab.
cargo_bin="${CARGO_HOME:-${HOME}/.cargo}/bin"
if [[ -d "$cargo_bin" ]]; then export PATH="$cargo_bin:$PATH"; fi

node_sufficient() {
  local version major minor patch
  command -v node >/dev/null 2>&1 || return 1
  version="$(node -p 'process.versions.node' 2>/dev/null)" || return 1
  IFS=. read -r major minor patch <<< "$version"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  # Vite 8: Node 20.19+, 22.12+ bzw. eine neuere gerade Hauptversion.
  (( (major == 20 && minor >= 19) || (major == 22 && minor >= 12) || (major >= 24 && major % 2 == 0) ))
}

PHASE="Node.js und npm prüfen"
say "[3/7] Prüfe JavaScript-Werkzeuge …"
if ! node_sufficient || ! command -v npm >/dev/null 2>&1; then
  say "  ! Node.js fehlt oder ist für Vite 8 zu alt."
  nvm_script="${NVM_DIR:-${HOME}/.nvm}/nvm.sh"
  if [[ -s "$nvm_script" ]]; then
    # nvm ist bereits installiert und kann die Node-LTS-Version verwalten.
    if consent "Aktuelle Node.js-LTS-Version mit dem vorhandenen nvm installieren/aktivieren?"; then
      # shellcheck source=/dev/null
      . "$nvm_script"
      run_step "Node.js LTS bereitstellen" nvm install --lts
      run_step "Node.js LTS aktivieren" nvm use --lts
    fi
  fi
fi
if ! node_sufficient || ! command -v npm >/dev/null 2>&1; then
  fail "Bitte eine unterstützte Node.js-LTS-Version installieren (empfohlen: 24.x). Danach ./start.sh erneut ausführen. Infos: https://nodejs.org/"
fi
say "  ✓ Node.js $(node --version), npm $(npm --version)"

if ! node -e 'const p=require("./package.json");if(!p.scripts||!p.scripts.tauri)process.exit(1)' >>"$LOG_FILE" 2>&1; then
  fail "Das Projekt enthält keinen npm-Startbefehl namens 'tauri'. Bitte package.json prüfen."
fi

tauri_major="$(node -e 'const p=require("./package.json");const v=p.devDependencies?.["@tauri-apps/cli"]||p.dependencies?.["@tauri-apps/cli"]||"";const m=/^[~^]?(\d+)\./.exec(v.trim());console.log(m?m[1]:"unknown")')"
if [[ "$tauri_major" == 1 ]]; then
  fail "Dieses Projekt verwendet offenbar Tauri 1. Für dessen Systempakete wird eine eigene, geprüfte Startvariante benötigt."
elif [[ "$tauri_major" != 2 ]]; then
  fail "Tauri-Version ${tauri_major} ist nicht als Tauri 2 bestätigt. Keine Systemreparatur oder Programmstart."
fi

PHASE="Linux-Systembibliotheken prüfen"
say "[4/7] Prüfe Linux-Bibliotheken …"
if (( ! is_debian_family )); then
  fail "Automatische Systemprüfung ist für Ubuntu, Kubuntu, Linux Mint und Debian ausgelegt. Dieses System bitte gesondert prüfen."
fi
command -v dpkg-query >/dev/null 2>&1 || fail "dpkg-query fehlt. Die Linux-Paketverwaltung ist nicht verfügbar."

# Offizielle Tauri-2-Voraussetzungen für Debian/Ubuntu, plus pkg-config.
system_packages=(
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev
  libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
)
missing_packages=()
for pkg in "${system_packages[@]}"; do
  if ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then
    missing_packages+=("$pkg")
  fi
done

if (( ${#missing_packages[@]} > 0 )); then
  say "  ! Diese Systempakete fehlen: ${missing_packages[*]}"
  if [[ "$tauri_major" == unknown ]]; then
    fail "Tauri-Version nicht eindeutig. Bitte zuerst @tauri-apps/cli in package.json überprüfen."
  fi
  if ! consent "Diese fehlenden Pakete über die Linux-Paketverwaltung installieren?"; then
    fail "Installation nicht freigegeben. Es wurde nichts an den Systempaketen geändert."
  fi
  command -v sudo >/dev/null 2>&1 || fail "sudo fehlt. Bitte einen Administrator um Hilfe bitten."
  say "  Für die Paketinstallation kann dein Linux-Passwort erforderlich sein."
  sudo -v || fail "Administratorfreigabe fehlgeschlagen."
  run_step "Paketliste aktualisieren" sudo -n apt-get update
  run_step "Fehlende Systempakete installieren" sudo -n apt-get install -y --no-install-recommends "${missing_packages[@]}"
else
  say "  ✓ Alle benötigten Linux-Pakete sind installiert"
fi

PHASE="Rust und Cargo prüfen"
say "[5/7] Prüfe Rust und Cargo …"
if ! command -v cargo >/dev/null 2>&1 || ! cargo --version >>"$LOG_FILE" 2>&1; then
  if command -v rustup >/dev/null 2>&1; then
    if ! consent "Rust-Standardwerkzeuge mit vorhandenem rustup einrichten?"; then
      fail "Cargo ist noch nicht verfügbar. Installation abgebrochen."
    fi
    run_step "Rust-Werkzeuge einrichten" rustup default stable
  else
    if ! consent "Rust und Cargo vom offiziellen Anbieter rustup.rs herunterladen und installieren?"; then
      fail "Cargo fehlt. Ohne Rust lässt sich die Desktopanwendung nicht starten."
    fi
    command -v curl >/dev/null 2>&1 || fail "curl fehlt. Bitte Linux-Systempakete prüfen."
    TMP_INSTALLER="$(mktemp "${TMPDIR:-/tmp}/provoware-rustup.XXXXXXXX")"
    run_step "Offizielles Rust-Installationsprogramm laden" curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error --output "$TMP_INSTALLER" https://sh.rustup.rs
    say "  Quelle: https://sh.rustup.rs (offizieller Rust-Installer)"
    run_step "Rust und Cargo installieren" sh "$TMP_INSTALLER" -y --profile minimal --no-modify-path
  fi
  [[ -f "${CARGO_HOME:-${HOME}/.cargo}/env" ]] && . "${CARGO_HOME:-${HOME}/.cargo}/env"
  export PATH="${CARGO_HOME:-${HOME}/.cargo}/bin:$PATH"
fi
command -v cargo >/dev/null 2>&1 || fail "Cargo ist nach der Einrichtung nicht auffindbar. Terminal neu öffnen und erneut probieren."
if ! cargo --version >>"$LOG_FILE" 2>&1; then
  fail "Cargo wurde gefunden, kann aber nicht ausgeführt werden. Rust-Installation prüfen."
fi
say "  ✓ $(cargo --version)"

PHASE="Projektabhängigkeiten prüfen"
say "[6/7] Prüfe Programmbausteine …"
if [[ ! -d node_modules ]] || ! npm ls --depth=0 --silent >>"$LOG_FILE" 2>&1; then
  if (( CHECK_ONLY || ! AUTO_REPAIR )); then
    fail "JavaScript-Bausteine fehlen oder sind unvollständig. Im normalen Modus kann ich sie einrichten."
  fi
  if [[ ! -d node_modules && -f package-lock.json ]]; then
    say "  ! Erstinstallation anhand der festen Paketliste erforderlich."
    run_step "JavaScript-Bausteine installieren (npm ci)" npm ci --ignore-scripts --no-audit --no-fund
  else
    say "  ! Bestehende Pakete sind unvollständig. npm repariert die Installation."
    if ! consent "Fehlende JavaScript-Bausteine per npm install nachinstallieren?"; then
      fail "JavaScript-Reparatur nicht freigegeben."
    fi
    run_step "JavaScript-Bausteine reparieren (npm install)" npm install --ignore-scripts --no-audit --no-fund
  fi
else
  say "  ✓ JavaScript-Bausteine vorhanden"
fi

if ! npm ls --depth=0 --silent >>"$LOG_FILE" 2>&1; then
  fail "Die JavaScript-Abhängigkeiten sind weiterhin fehlerhaft. Bitte das Protokoll prüfen."
fi

if ! cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1 >>"$LOG_FILE" 2>&1; then
  fail "Rust kann die Projektinformationen nicht lesen. Mögliche Ursache: ungültige Cargo.toml oder fehlende Rust-Werkzeuge."
fi
say "  ✓ Rust-Projektinformationen lesbar"

if (( AUDIT )); then
  PHASE="Sicherheitsprüfung"
  say "  … Prüfe npm-Sicherheitsmeldungen"
  if npm audit --audit-level=high >>"$LOG_FILE" 2>&1; then
    say "  ✓ Keine hohen npm-Sicherheitswarnungen gefunden"
  else
    say "  ! Sicherheitsprüfung meldet Probleme oder konnte nicht abgeschlossen werden."
    say "  Es wird bewusst kein npm audit fix --force ausgeführt."
    if ! consent "Trotzdem mit der Entwicklungsversion fortfahren?"; then
      fail "Start wegen ungeklärter Sicherheitsmeldung angehalten."
    fi
  fi
fi

PHASE="Startfreigabe"
say "[7/7] Abschließende Startprüfung …"
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  if (( CHECK_ONLY )); then
    say "  ! Keine grafische Sitzung erkannt (für --check ist das zulässig)."
  else
    fail "Keine grafische Desktop-Sitzung erkannt. Bitte unter Kubuntu/Mint am Desktop starten."
  fi
fi

PHASE="Entwicklungsport prüfen"
say "  … Prüfe, ob Entwicklungsport $DEV_PORT frei ist"
ensure_dev_port_available

if (( CHECK_ONLY )); then
  say ""
  if (( START_WARNING )); then
    say "! Vorprüfung mit Hinweis abgeschlossen. Bitte oben genannte Portwarnung beachten."
  else
    say "✓ Vorprüfung erfolgreich. Mit ./start.sh kannst du die Anwendung starten."
  fi
  say "Protokoll: $LOG_FILE"
  exit 0
fi

PHASE="DateiFinder starten"
say ""
say "✓ Startbereit. Öffne die Desktopanwendung …"
say "  Beenden jederzeit mit Strg+C."
say "  Protokoll: $LOG_FILE"
say ""

for attempt in 1 2; do
  if npm run tauri -- dev 2>&1 | tee -a "$LOG_FILE"; then
    app_status=0
  else
    # Fehler sind hier erwartet möglich. Innerhalb von if greift der
    # allgemeine ERR-Trap nicht vor unserer verständlichen Fehlermeldung.
    app_status=${PIPESTATUS[0]}
  fi
  if (( app_status == 0 || app_status == 130 )); then break; fi
  if (( attempt == 1 )) && tail -n 60 "$LOG_FILE" | grep -Eqi 'EADDRINUSE|address already in use|port [0-9]+ is( already)? in use'; then
    PHASE="Portkonflikt nach Startversuch beheben"
    say "  ! Portkonflikt erst während des Starts erkannt. Prüfe eine sichere Korrektur …"
    ensure_dev_port_available
    say "  … Zweiter und letzter Startversuch."
    PHASE="DateiFinder starten"
    continue
  fi
  break
done
if (( app_status != 0 && app_status != 130 )); then
  fail "Die Anwendung wurde mit Fehlercode $app_status beendet. Die Ursache steht am Ende des Protokolls." "$app_status"
fi
say "✓ DateiFinder wurde beendet."
