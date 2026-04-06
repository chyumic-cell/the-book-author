"use client";

import { useMemo, useState } from "react";

import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { CharacterRecord, RelationshipRecord } from "@/types/storyforge";

const RELATIONSHIP_COLORS: Record<string, string> = {
  ALLY: "#2f6f53",
  FAMILY: "#8a5a24",
  MENTOR: "#3f4f7a",
  ROMANTIC: "#8a2d52",
  RIVAL: "#9a4a1e",
  ENEMY: "#9d2f2f",
  POLITICAL: "#5d517d",
  MYSTERY: "#576168",
};

function polarPoint(index: number, total: number, radius: number, centerX: number, centerY: number) {
  const angle = (-Math.PI / 2) + ((Math.PI * 2) / Math.max(total, 1)) * index;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

export function CharacterRelationshipWeb({
  characters,
  relationships,
}: {
  characters: CharacterRecord[];
  relationships: RelationshipRecord[];
}) {
  const [focusedCharacterId, setFocusedCharacterId] = useState<string | null>(characters[0]?.id ?? null);

  const layout = useMemo(() => {
    const visibleCharacters = focusedCharacterId
      ? characters.filter(
          (character) =>
            character.id === focusedCharacterId ||
            relationships.some(
              (relationship) =>
                (relationship.sourceCharacterId === focusedCharacterId && relationship.targetCharacterId === character.id) ||
                (relationship.targetCharacterId === focusedCharacterId && relationship.sourceCharacterId === character.id),
            ),
        )
      : characters;

    const centerCharacter = visibleCharacters.find((character) => character.id === focusedCharacterId) ?? visibleCharacters[0] ?? null;
    const orbitingCharacters = visibleCharacters.filter((character) => character.id !== centerCharacter?.id);
    const positionMap = new Map<string, { x: number; y: number }>();

    if (centerCharacter) {
      positionMap.set(centerCharacter.id, { x: 330, y: 210 });
    }

    orbitingCharacters.forEach((character, index) => {
      positionMap.set(character.id, polarPoint(index, orbitingCharacters.length, 145, 330, 210));
    });

    return {
      centerCharacter,
      orbitingCharacters,
      positionMap,
      visibleRelationships: relationships.filter(
        (relationship) =>
          positionMap.has(relationship.sourceCharacterId) && positionMap.has(relationship.targetCharacterId),
      ),
    };
  }, [characters, focusedCharacterId, relationships]);

  const focusedCharacter = characters.find((character) => character.id === focusedCharacterId) ?? null;

  if (characters.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-[color:var(--line)] px-4 py-6 text-sm text-[var(--muted)]">
          Add characters first, then {APP_NAME} can draw the relationship web.
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]" data-testid="character-relationship-web">
      <div className="grid gap-3">
        <div>
          <h4 className="text-xl">Character web</h4>
          <p className="text-sm text-[var(--muted)]">
            Focus one character to see their allies, rivals, mentors, enemies, and emotional pressure lines.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(RELATIONSHIP_COLORS).map(([label, color]) => (
            <Chip key={label} className="gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </Chip>
          ))}
        </div>
        <div className="grid gap-2" data-testid="character-relationship-web-buttons">
          {characters.map((character) => (
            <button
              key={character.id}
              className={cn(
                "rounded-[20px] border px-4 py-3 text-left transition",
                focusedCharacterId === character.id
                  ? "border-[color:var(--line-strong)] bg-[color:var(--panel-soft)]"
                  : "border-[color:var(--line)] bg-white/60 hover:bg-white",
              )}
              onClick={() => setFocusedCharacterId(character.id)}
              type="button"
            >
              <strong className="block text-[var(--text)]">{character.name}</strong>
              <span className="mt-1 block text-sm text-[var(--muted)]">{character.role || character.summary}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--line)] bg-white/55 p-4">
        <svg
          aria-label="Character relationship web"
          className="h-auto w-full"
          viewBox="0 0 660 420"
        >
          <defs>
            <filter id="storyforgeRelationshipGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" floodColor="rgba(59, 40, 18, 0.15)" stdDeviation="8" />
            </filter>
          </defs>

          {layout.visibleRelationships.map((relationship) => {
            const source = layout.positionMap.get(relationship.sourceCharacterId);
            const target = layout.positionMap.get(relationship.targetCharacterId);
            if (!source || !target) {
              return null;
            }

            const stroke = RELATIONSHIP_COLORS[relationship.kind] ?? "#756657";
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const curve = source.x < target.x ? -26 : 26;

            return (
              <g key={relationship.id}>
                <path
                  d={`M ${source.x} ${source.y} Q ${midX} ${midY + curve} ${target.x} ${target.y}`}
                  fill="none"
                  stroke={stroke}
                  strokeOpacity="0.82"
                  strokeWidth={focusedCharacterId &&
                    relationship.sourceCharacterId !== focusedCharacterId &&
                    relationship.targetCharacterId !== focusedCharacterId
                    ? 2
                    : 4}
                />
                <text
                  fill="#756657"
                  fontFamily="Libre Baskerville, Georgia, serif"
                  fontSize="11"
                  textAnchor="middle"
                  x={midX}
                  y={midY + curve - 6}
                >
                  {relationship.kind.toLowerCase()}
                </text>
              </g>
            );
          })}

          {characters
            .filter((character) => layout.positionMap.has(character.id))
            .map((character) => {
              const point = layout.positionMap.get(character.id);
              if (!point) {
                return null;
              }

              const isFocused = character.id === focusedCharacterId;
              const connected = relationships.some(
                (relationship) =>
                  relationship.sourceCharacterId === character.id || relationship.targetCharacterId === character.id,
              );

              return (
                <g key={character.id} filter="url(#storyforgeRelationshipGlow)">
                  <circle
                    cx={point.x}
                    cy={point.y}
                    fill={isFocused ? "#7a1024" : connected ? "#f2e8d8" : "#fbf6ee"}
                    r={isFocused ? 36 : 30}
                    stroke={isFocused ? "#7a1024" : "#bba68a"}
                    strokeWidth={isFocused ? 3 : 2}
                  />
                  <text
                    fill={isFocused ? "#fff5ee" : "#2c241d"}
                    fontFamily="Libre Baskerville, Georgia, serif"
                    fontSize={isFocused ? "15" : "13"}
                    fontWeight={isFocused ? "700" : "600"}
                    textAnchor="middle"
                    x={point.x}
                    y={point.y + 5}
                  >
                    {character.name.length > 12 ? `${character.name.slice(0, 12)}...` : character.name}
                  </text>
                </g>
              );
            })}
        </svg>

        {focusedCharacter ? (
          <div className="mt-4 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong className="text-lg">{focusedCharacter.name}</strong>
              <Chip>{focusedCharacter.role || "Character"}</Chip>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{focusedCharacter.summary}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {layout.visibleRelationships
                .filter(
                  (relationship) =>
                    relationship.sourceCharacterId === focusedCharacter.id ||
                    relationship.targetCharacterId === focusedCharacter.id,
                )
                .map((relationship) => {
                  const counterpart =
                    relationship.sourceCharacterId === focusedCharacter.id
                      ? relationship.targetCharacterName
                      : relationship.sourceCharacterName;

                  return (
                    <div
                      key={relationship.id}
                      className="rounded-[18px] border border-[color:var(--line)] bg-white/75 px-3 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong>{counterpart}</strong>
                        <Chip>{relationship.kind}</Chip>
                      </div>
                      <p className="mt-2 text-[var(--muted)]">{relationship.description}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Tension: {relationship.tension || "None"} | Status: {relationship.status || "Open"}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
