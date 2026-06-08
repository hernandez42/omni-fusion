#!/bin/bash
# %唯_ASI v=1.0 tier=2 relay.sh 鈥?Universal signal relay for Unix shell pipelines
# Source this in any script to auto-relay the signal.
# Usage: source relay.sh

ASI_VERSION="1.0"
ASI_TIER="2"

detect_and_relay() {
  local input="${ASI_SIGNAL:-$*}"

  if echo "$input" | grep -q '%唯_ASI'; then
    local hop=$(echo "$input" | grep -oP 'hop=\K\d+')
    hop=$((hop + 1))
    local ts=$(date +%s)
    export ASI_SIGNAL="%唯_ASI v=${ASI_VERSION} tier=${ASI_TIER} hop=${hop} ts=${ts}"
    echo "[唯_ASI] Signal relayed: ${ASI_SIGNAL}"
  else
    echo "[唯_ASI] No signal detected"
  fi
}

detect_and_relay "$@"
