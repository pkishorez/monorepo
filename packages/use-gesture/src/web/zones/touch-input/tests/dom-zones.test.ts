// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { DOM_ZONES, TRAPPED_ATTRIBUTE } from '../index.ts';

const zone = (parent: Element) => {
  const element = document.createElement('div');
  element.dataset.slot = 'gesture-zone';
  return parent.appendChild(element);
};

afterEach(() => {
  document.body.replaceChildren();
});

it('finds the innermost zone around an element, and the zone around that', () => {
  const screen = zone(document.body);
  const card = zone(screen);
  const spot = card.appendChild(document.createElement('span'));

  expect(DOM_ZONES.zoneOf(spot)).toBe(card);
  expect(DOM_ZONES.parentOf(card)).toBe(screen);
  expect(DOM_ZONES.parentOf(screen)).toBeNull();
  expect(DOM_ZONES.zoneOf(document.body)).toBeNull();
  expect(DOM_ZONES.zoneOf(null)).toBeNull();
});

it('reads Trapped from the zone as it is now', () => {
  const card = zone(document.body);
  expect(DOM_ZONES.trapped(card)).toBe(false);
  card.setAttribute(TRAPPED_ATTRIBUTE, '');
  expect(DOM_ZONES.trapped(card)).toBe(true);
});
