#!/usr/bin/env python3
"""Seed the local CourtCommand stack with the Michigan Pickleball League.

Idempotent: reuses existing players/teams/presets by name instead of duplicating.
Usage:
    python3 scripts/seed_michigan_league.py               # uses http://localhost:8000
    API_URL=http://host:port python3 scripts/seed_michigan_league.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

API_URL = os.getenv("API_URL", "http://localhost:8000").rstrip("/")

LEAGUE_NAME = "Michigan Pickleball League"

# One color per team (just pleasant defaults — adjust in the Overlay Console later).
TEAMS: list[dict[str, Any]] = [
    {
        "name": "Border Battalion",
        "short_name": "BOR",
        "primary_color": "#1F3A68",
        "players": [
            "April Spisich",
            "Nga Nguyen",
            "Joyson Menzes",
            "Dom Osborne",
        ],
    },
    {
        "name": "Flint Tropics",
        "short_name": "FLT",
        "primary_color": "#E85D2F",
        "players": [
            "Jonny Walker",
            "Anthony LeMerise",
            "Gadi Bzeih",
            "Sumaya Bansfield",
        ],
    },
    {
        "name": "Lansing Loons",
        "short_name": "LAN",
        "primary_color": "#2E7D46",
        "players": [
            "Tommy Calderone",
            "Cody Roy",
            "Grace Crawford",
            "Grace Haley",
        ],
    },
    {
        "name": "Detroit Vipers",
        "short_name": "DET",
        "primary_color": "#7B1E1E",
        "players": [
            "Jack Olmstead",
            "Jack Swan",
            "Heidi Blackwell",
            "Linda Liong",
        ],
    },
    {
        "name": "Lake Michigan Rapid Fire",
        "short_name": "LMRF",
        "primary_color": "#0E7AA6",
        "players": [
            "Seth Scharich",
            "Andrew Christmann",
            "Alexis Senneker",
            "Bree DeWeerdt",
        ],
    },
    {
        "name": "Brighton Barrage",
        "short_name": "BRI",
        "primary_color": "#6C3BAA",
        "players": [
            "Dhanavin",
            "Cayden Sprowl",
            "Kelly Kristi",
            "Jeren Foreman",
        ],
    },
]


def request(method: str, path: str, body: dict | None = None) -> Any:
    url = f"{API_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{method} {path} -> HTTP {err.code}: {detail}") from err


def upsert_player(name: str, existing_by_name: dict[str, dict]) -> dict:
    if name in existing_by_name:
        return existing_by_name[name]
    created = request(
        "POST",
        "/players",
        {"display_name": name, "handedness": "right", "skill_rating": None},
    )
    existing_by_name[name] = created
    print(f"  + player: {name} (id {created['id']})")
    return created


def upsert_team(
    name: str,
    short_name: str,
    primary_color: str,
    player_ids: list[int],
    existing_by_name: dict[str, dict],
) -> dict:
    payload = {
        "name": name,
        "short_name": short_name,
        "logo_url": None,
        "primary_color": primary_color,
        "player_ids": player_ids,
    }
    if name in existing_by_name:
        team = existing_by_name[name]
        updated = request("PUT", f"/teams/{team['id']}", payload)
        existing_by_name[name] = updated
        print(f"  ~ team updated: {name} (id {team['id']}, {len(player_ids)} players)")
        return updated
    created = request("POST", "/teams", payload)
    existing_by_name[name] = created
    print(f"  + team: {name} (id {created['id']}, {len(player_ids)} players)")
    return created


def upsert_preset(category: str, value: str, existing: set[tuple[str, str]]) -> None:
    key = (category, value)
    if key in existing:
        return
    request("POST", "/presets", {"category": category, "value": value})
    existing.add(key)
    print(f"  + preset: {category} = {value}")


def main() -> int:
    print(f"Seeding against {API_URL}…")

    # Sanity check
    try:
        health = request("GET", "/health")
    except SystemExit:
        raise
    if health.get("status") != "healthy":
        raise SystemExit(f"Backend unhealthy: {health}")

    # Fetch existing state for idempotency
    players = {p["display_name"]: p for p in request("GET", "/players") or []}
    teams = {t["name"]: t for t in request("GET", "/teams") or []}
    preset_rows = request("GET", "/presets") or []
    preset_keys: set[tuple[str, str]] = {
        (p["category"], p["value"]) for p in preset_rows
    }

    print("\nPresets:")
    upsert_preset("league", LEAGUE_NAME, preset_keys)
    upsert_preset("tournament", "Regular Season", preset_keys)
    upsert_preset("tournament", "Playoffs", preset_keys)
    upsert_preset("round", "Match Day", preset_keys)
    upsert_preset("round", "Semifinals", preset_keys)
    upsert_preset("round", "Championship", preset_keys)

    print("\nPlayers & Teams:")
    for t in TEAMS:
        print(f"\n[{t['name']}]")
        player_ids: list[int] = []
        for player_name in t["players"]:
            p = upsert_player(player_name, players)
            player_ids.append(p["id"])
        upsert_team(
            t["name"],
            t["short_name"],
            t["primary_color"],
            player_ids,
            teams,
        )

    # Final summary
    final_players = request("GET", "/players") or []
    final_teams = request("GET", "/teams") or []
    print(
        f"\nDone. Total players: {len(final_players)}  teams: {len(final_teams)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
