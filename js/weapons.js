// The arsenal. Every weapon is just numbers + flags; game.js interprets them.

export const WEAPONS = [
  {
    id: 'shell',
    name: 'SHELL',
    icon: '●',
    desc: 'A classic. Big hole, no nonsense.',
    ammo: Infinity,
    radius: 32,
    power: 1.35,
    damage: 34,
    gravity: 1,
    windFactor: 1,
    shot: 'shell',
    explodes: false,
    cluster: 0,
  },
  {
    id: 'heavy',
    name: 'HEAVY',
    icon: '💣',
    desc: 'Three shots. Twice the crater.',
    ammo: 3,
    radius: 54,
    power: 1.15,
    damage: 52,
    gravity: 1.25,
    windFactor: 1.15,
    shot: 'bomb',
    explodes: false,
  },
  {
    id: 'cluster',
    name: 'CLUSTER',
    icon: '✸',
    desc: 'Splits into 5 bomblets. Geographically imprecise.',
    ammo: 3,
    radius: 26,
    power: 1.3,
    damage: 24,
    gravity: 1,
    windFactor: 1.35,
    shot: 'cluster',
    explodes: true,
    cluster: 5,
    clusterRadius: 24,
    clusterDamage: 17,
  },
  {
    id: 'goop',
    name: 'GOOP',
    icon: '🟢',
    desc: 'Splashes goo that sticks and burns each turn.',
    ammo: 3,
    radius: 26,
    power: 1.2,
    damage: 12,
    gravity: 1.05,
    windFactor: 1.1,
    shot: 'goo',
    explodes: true,
    gooPools: 3,
  },
  {
    id: 'duck',
    name: 'DUCK',
    icon: '🦆',
    desc: 'Absolute chaos. Nobody controls the duck.',
    ammo: 1,
    radius: 38,
    power: 1.45,
    damage: 40,
    gravity: 1.05,
    windFactor: 1.7,
    shot: 'duck',
    explodes: true,
    bounces: 3,
  },
];

export const DEFAULT_WEAPON = 'shell';

export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];

export const START_AMMO = () => {
  const a = {};
  for (const w of WEAPONS) a[w.id] = w.ammo === Infinity ? Infinity : w.ammo;
  return a;
};
