// Regenerates public/srd-monsters.json (which IS tracked in this repo —
// it's ~1 MB of text, not images) from the SRD 5.1 monster data in the
// github.com/5e-bits/5e-database repo. Run via npm run srd:fetch when a
// refresh is wanted; the output is committed so the app works offline and
// out of the box.
//
// The SRD 5.1 is licensed CC-BY-4.0 by Wizards of the Coast — the required
// attribution is shown in-app (SRD browser footer) and in the README.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'public', 'srd-monsters.json');
const SOURCES = [
  'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Monsters.json',
  // Older layouts of the same repo, in case the structure moves again.
  'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/5e-SRD-Monsters.json',
  'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/5e-SRD-Monsters.json',
];

async function download() {
  for (const url of SOURCES) {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`Fetched ${url}`);
      return res.json();
    }
    console.warn(`${res.status} from ${url}, trying next source...`);
  }
  throw new Error('No SRD monster source responded');
}

function crLabel(cr) {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

function speedText(speed) {
  if (!speed) return undefined;
  const parts = Object.entries(speed)
    .filter(([, v]) => v && v !== false)
    .map(([k, v]) => (k === 'walk' ? String(v) : `${k} ${v}`));
  return parts.length ? parts.join(', ') : undefined;
}

function sensesText(senses) {
  if (!senses) return '';
  return Object.entries(senses)
    .map(([k, v]) => (k === 'passive_perception' ? `passive Perception ${v}` : `${k.replaceAll('_', ' ')} ${v}`))
    .join(', ');
}

function armorClass(m) {
  const ac = m.armor_class;
  if (typeof ac === 'number') return ac;
  if (Array.isArray(ac) && ac.length > 0) return ac[0].value;
  return undefined;
}

function proficiencyLines(m) {
  const saves = [];
  const skills = [];
  for (const p of m.proficiencies ?? []) {
    const label = p.proficiency?.name ?? '';
    const signed = p.value >= 0 ? `+${p.value}` : `${p.value}`;
    if (label.startsWith('Saving Throw:')) saves.push(`${label.slice(13).trim()} ${signed}`);
    else if (label.startsWith('Skill:')) skills.push(`${label.slice(6).trim()} ${signed}`);
  }
  const out = [];
  if (saves.length) out.push(`Saves ${saves.join(', ')}`);
  if (skills.length) out.push(`Skills ${skills.join(', ')}`);
  return out;
}

function section(title, entries) {
  if (!entries || entries.length === 0) return '';
  const body = entries.map((a) => `${a.name}. ${a.desc ?? ''}`.trim()).join('\n');
  return `\n${title}:\n${body}`;
}

function buildNotes(m) {
  const typeLine = `${m.size ?? ''} ${m.type ?? ''}${m.subtype ? ` (${m.subtype})` : ''}`.trim();
  const head = [`CR ${crLabel(m.challenge_rating)}${m.xp ? ` (${m.xp} XP)` : ''} · ${typeLine}`];
  if (m.hit_points_roll || m.hit_dice) head.push(`Hit dice ${m.hit_points_roll ?? m.hit_dice}`);

  const lines = [];
  const senses = sensesText(m.senses);
  if (senses) lines.push(`Senses ${senses}`);
  if (m.languages) lines.push(`Languages ${m.languages}`);
  lines.push(...proficiencyLines(m));
  if (m.damage_resistances?.length) lines.push(`Resistances ${m.damage_resistances.join(', ')}`);
  if (m.damage_immunities?.length) lines.push(`Damage immunities ${m.damage_immunities.join(', ')}`);
  if (m.damage_vulnerabilities?.length) lines.push(`Vulnerabilities ${m.damage_vulnerabilities.join(', ')}`);
  if (m.condition_immunities?.length) {
    lines.push(`Condition immunities ${m.condition_immunities.map((c) => c.name).join(', ')}`);
  }

  return (
    head.join(' · ') +
    (lines.length ? `\n${lines.join('\n')}` : '') +
    section('Traits', m.special_abilities) +
    section('Actions', m.actions) +
    section('Reactions', m.reactions) +
    section('Legendary Actions', m.legendary_actions)
  ).trim();
}

const raw = await download();
const monsters = raw
  .map((m) => {
    const out = {
      name: m.name,
      type: `${m.size ?? ''} ${m.type ?? ''}${m.subtype ? ` (${m.subtype})` : ''}`.trim(),
      cr: crLabel(m.challenge_rating),
      crValue: m.challenge_rating ?? 0,
      ac: armorClass(m),
      hp: m.hit_points,
      speed: speedText(m.speed),
      str: m.strength,
      dex: m.dexterity,
      con: m.constitution,
      int: m.intelligence,
      wis: m.wisdom,
      cha: m.charisma,
      notes: buildNotes(m),
    };
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

await writeFile(OUT_FILE, JSON.stringify(monsters));
const kb = Math.round(JSON.stringify(monsters).length / 1024);
console.log(`Wrote ${monsters.length} monsters (${kb} KB) to ${path.relative(ROOT, OUT_FILE)}`);
