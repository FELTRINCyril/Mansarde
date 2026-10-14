import { describe, expect, it } from 'vitest';
import { autoExclusion, categoryOf, CEILING_HEIGHT, flagsOf, normalizeLicense, poseOf, type RuleItem } from '../../tools/models/lib/rules';

const item = (o: Partial<RuleItem>): RuleItem => ({ name: 'Thing', category: 'Living room', width: 50, depth: 50, height: 80, ...o });

describe('categoryOf', () => {
  it('maps the Sweet Home 3D categories', () => {
    expect(categoryOf(item({ category: 'Bedroom' }))).toBe('Chambre');
    expect(categoryOf(item({ category: 'Living room' }))).toBe('Séjour');
    expect(categoryOf(item({ category: 'Office' }))).toBe('Bureau et repas');
    expect(categoryOf(item({ category: 'Kitchen' }))).toBe('Cuisine');
    expect(categoryOf(item({ category: 'Bathroom' }))).toBe('Salle de bain');
    expect(categoryOf(item({ category: 'Lights' }))).toBe('Luminaires');
    expect(categoryOf(item({ category: 'Exterior' }))).toBe('Extérieur');
    expect(categoryOf(item({ category: 'Staircases' }))).toBe('Structure');
  });
  it('splits Miscellaneous between decoration and the rest', () => {
    expect(categoryOf(item({ category: 'Miscellaneous', nameFr: 'Vase bleu' }))).toBe('Décoration');
    expect(categoryOf(item({ category: 'Miscellaneous', name: 'Picture frame' }))).toBe('Décoration');
    expect(categoryOf(item({ category: 'Miscellaneous', name: 'Fire extinguisher' }))).toBe('Divers');
  });
  it('drops doors, windows, vehicles and characters', () => {
    expect(categoryOf(item({ category: 'Doors and windows' }))).toBeNull();
    expect(categoryOf(item({ category: 'Vehicles' }))).toBeNull();
    expect(categoryOf(item({ category: 'Characters' }))).toBeNull();
  });
});

describe('poseOf', () => {
  it('lays rugs on the floor as coverings', () => {
    expect(poseOf(item({ nameFr: 'Tapis persan', height: 1 }), 'Séjour')).toEqual({ pose: 'covering' });
    expect(poseOf(item({ name: 'Round rug', height: 1 }), 'Séjour')).toEqual({ pose: 'covering' });
  });
  it('tucks chairs and stools but not armchairs', () => {
    expect(poseOf(item({ nameFr: 'Chaise' }), 'Bureau et repas')).toEqual({ pose: 'tuckable' });
    expect(poseOf(item({ name: 'Bar stool' }), 'Cuisine')).toEqual({ pose: 'tuckable' });
    expect(poseOf(item({ nameFr: 'Fauteuil', name: 'Armchair' }), 'Séjour')).toEqual({ pose: 'floor' });
    expect(poseOf(item({ name: 'Deck chair' }), 'Extérieur')).toEqual({ pose: 'floor' });
  });
  it('hangs objects with a source elevation on the wall', () => {
    expect(poseOf(item({ nameFr: 'Meuble haut', elevation: 150 }), 'Cuisine')).toEqual({ pose: 'wall', elevation: 150 });
  });
  it('hangs ceiling lights under the default ceiling', () => {
    expect(poseOf(item({ nameFr: 'Plafonnier', category: 'Lights', height: 30, elevation: 220 }), 'Luminaires')).toEqual({ pose: 'floor', elevation: CEILING_HEIGHT - 30 });
    expect(poseOf(item({ name: 'Chandelier', category: 'Lights', height: 300 }), 'Luminaires')).toEqual({ pose: 'floor', elevation: 0 });
  });
  it('puts small objects on top of furniture', () => {
    expect(poseOf(item({ nameFr: 'Lampe de bureau', width: 20, depth: 20, height: 45 }), 'Bureau et repas')).toEqual({ pose: 'onTop' });
    expect(poseOf(item({ name: 'Microwave', width: 50, depth: 40, height: 30 }), 'Cuisine')).toEqual({ pose: 'onTop' });
    expect(poseOf(item({ name: 'Statuette', width: 15, depth: 15, height: 25 }), 'Décoration')).toEqual({ pose: 'onTop' });
  });
  it('keeps small furniture and bins on the floor', () => {
    expect(poseOf(item({ nameFr: 'Table de nuit', width: 45, depth: 40, height: 50 }), 'Chambre')).toEqual({ pose: 'floor' });
    expect(poseOf(item({ name: 'Dustbin', width: 30, depth: 30, height: 30 }), 'Cuisine')).toEqual({ pose: 'floor' });
    expect(poseOf(item({ name: 'Floor lamp', width: 30, depth: 30, height: 170 }), 'Luminaires')).toEqual({ pose: 'floor' });
  });
});

describe('flagsOf', () => {
  it('lets things stand under tables and desks', () => {
    expect(flagsOf(item({ nameFr: 'Table à manger' }), 'Bureau et repas', 'floor')).toEqual({ acceptsUnder: true });
    expect(flagsOf(item({ name: 'Desk' }), 'Bureau et repas', 'floor')).toEqual({ acceptsUnder: true });
    expect(flagsOf(item({ nameFr: 'Table de nuit' }), 'Chambre', 'floor')).toEqual({});
    expect(flagsOf(item({ nameFr: 'Lampe de table' }), 'Luminaires', 'onTop')).toEqual({});
  });
  it('makes wall shelves carry objects', () => {
    expect(flagsOf(item({ nameFr: 'Étagère murale' }), 'Séjour', 'wall')).toEqual({ carriesOnTop: true });
    expect(flagsOf(item({ nameFr: 'Étagère' }), 'Séjour', 'floor')).toEqual({});
  });
});

describe('autoExclusion', () => {
  it('rejects animals, food, weapons and out of scale objects', () => {
    expect(autoExclusion(item({ name: 'Chicken' }))).toMatch(/animal/);
    expect(autoExclusion(item({ name: 'Hot dog' }))).toMatch(/food/);
    expect(autoExclusion(item({ name: 'Ammo box' }))).toMatch(/weapon/);
    expect(autoExclusion(item({ width: 700 }))).toMatch(/scale/);
    expect(autoExclusion(item({ width: undefined }))).toMatch(/size/);
    expect(autoExclusion(item({ name: 'Sofa' }))).toBeNull();
  });
  it('keeps glass furniture, racks and pet furniture', () => {
    expect(autoExclusion(item({ name: 'Glass table', nameFr: 'Table en verre' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Glass door cabinet', nameFr: 'Meuble haut vitré' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Clothes horse', nameFr: 'Séchoir' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Cat tree', nameFr: 'Arbre à chat' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Bottles rack', nameFr: 'Casier à bouteilles' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Apple iMac 2004' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Glass', nameFr: 'Verre' }))).toMatch(/food/);
    expect(autoExclusion(item({ name: 'Perfume flacon', nameFr: 'Flacon de parfum' }))).toMatch(/trinket/);
  });

  it('does not mistake a cat tree or a bookcase for an animal', () => {
    expect(autoExclusion(item({ name: 'Bookcase', nameFr: 'Bibliothèque' }))).toBeNull();
    expect(autoExclusion(item({ name: 'Category' }))).toBeNull();
  });
});

describe('normalizeLicense', () => {
  it('names the licenses of the sources', () => {
    expect(normalizeLicense('CC-0')).toBe('CC0');
    expect(normalizeLicense('CC0')).toBe('CC0');
    expect(normalizeLicense('CC-BY')).toBe('CC-BY 3.0');
    expect(normalizeLicense('Free Art')).toBe('Free Art License 1.3');
    expect(normalizeLicense('Free Art / CC-BY')).toBe('Free Art License 1.3 / CC-BY 3.0');
    expect(normalizeLicense('CC-BY-NC')).toBeNull();
  });
});
