#!/usr/bin/env python3
"""
Migracion puntual: separa 'Central' en 'Central derecho'/'Central izquierdo'
y 'Volante central'/'Volante defensivo' en 'Volante derecho'/'Volante izquierdo',
segun el orden en que aparecen en el XI de cada partido (para que queden dos
posiciones distintas y comparables en las estadisticas de rotacion). Tambien
limpia 'Delantero' -> 'Delantero centro', y borra las coordenadas x/y viejas
(estaban pensadas para una cancha horizontal; el campograma pasa a ser
vertical, asi que se recalculan solas la proxima vez que se muestren).
"""
import json

PATH = "/Users/matiascruz/Documents/rival-scout/server/data/db.json"

CENTRAL_SPLIT = {"Central"}
VOLANTE_SPLIT = {"Volante central", "Volante defensivo"}


def split_label(base, index):
    if base in CENTRAL_SPLIT:
        return "Central izquierdo" if index % 2 == 0 else "Central derecho"
    if base in VOLANTE_SPLIT:
        return "Volante izquierdo" if index % 2 == 0 else "Volante derecho"
    if base == "Delantero":
        return "Delantero centro"
    return base


def migrate():
    with open(PATH, encoding="utf-8") as f:
        db = json.load(f)

    profile_counts = {}  # playerId -> {label: count}

    for match in db["matches"]:
        lineup_label_by_player = {}
        counters = {}
        new_lineup = []
        for entry in match["lineup"]:
            base = entry["posicion"]
            if base in CENTRAL_SPLIT or base in VOLANTE_SPLIT:
                idx = counters.get(base, 0)
                counters[base] = idx + 1
                new_label = split_label(base, idx)
            else:
                new_label = split_label(base, 0)
            new_entry = {"playerId": entry["playerId"], "posicion": new_label}
            new_lineup.append(new_entry)
            lineup_label_by_player[entry["playerId"]] = new_label
            profile_counts.setdefault(entry["playerId"], {}).setdefault(new_label, 0)
            profile_counts[entry["playerId"]][new_label] += 1
        match["lineup"] = new_lineup

        for sub in match["substitutions"]:
            sale_id = sub.get("jugadorSaleId")
            resolved = lineup_label_by_player.get(sale_id)
            if resolved is None:
                base = sub.get("posicionSale", "")
                resolved = split_label(base, 0)
            if sub.get("posicionSale") in CENTRAL_SPLIT | VOLANTE_SPLIT or sub.get("posicionSale") == "Delantero":
                sub["posicionSale"] = resolved
            if sub.get("posicionEntra") in CENTRAL_SPLIT | VOLANTE_SPLIT or sub.get("posicionEntra") == "Delantero":
                sub["posicionEntra"] = resolved
            lr = sub.get("layoutResultante")
            if lr:
                new_lr = []
                for e in lr:
                    base = e["posicion"]
                    if base in CENTRAL_SPLIT | VOLANTE_SPLIT or base == "Delantero":
                        resolved_e = lineup_label_by_player.get(e["playerId"], split_label(base, 0))
                    else:
                        resolved_e = base
                    new_lr.append({"playerId": e["playerId"], "posicion": resolved_e})
                sub["layoutResultante"] = new_lr

    for player in db["players"]:
        counts = profile_counts.get(player["id"])
        if counts:
            best_label = max(counts.items(), key=lambda kv: kv[1])[0]
            player["posicion"] = best_label
        elif player["posicion"] == "Delantero":
            player["posicion"] = "Delantero centro"

    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

    print("Migracion completa.")


if __name__ == "__main__":
    migrate()
