import { Schema } from 'effect';
import { Runtime } from '@kestack/kabuki';
import type { Entry } from '@kestack/kabuki/types';
import { describe, expect, it } from 'vitest';
import {
  controlsOf,
  fieldsOf,
  FROM_BUBBLE,
  messageOf,
  sendTo,
  wordsOf,
} from '../controls.ts';
import type { Control } from '../controls.ts';
import { treeOf } from '../tree.ts';
import { CarFake, garage, GarageFake, weather, WeatherFake } from './fakes.ts';

/*
 * The bubble's forms, read from Blueprints alone: the Controls an Actor
 * takes, a field per Message field, and the Message a form makes; the
 * Instances it lists, and a Control Sent from it.
 */

const tagsOf = (controls: ReadonlyArray<Control>) =>
  controls.map(({ tag }) => tag);

const controlOf = (
  print: { readonly blueprint: Parameters<typeof controlsOf>[0] },
  tag: string,
) => controlsOf(print.blueprint, [tag])[0]!;

describe('controlsOf', () => {
  it('offers the Fake’s Controls its Actor takes, at its top or in any State, in the Fake’s order', () => {
    expect(tagsOf(controlsOf(WeatherFake.blueprint, weather.controls))).toEqual(
      ['StartRaining', 'StopRaining', 'SetTemperature', 'WarnOfAStorm'],
    );
    expect(
      tagsOf(controlsOf(WeatherFake.blueprint, ['StopRaining', 'Park'])),
    ).toEqual(['StopRaining']);
  });

  it('gives each Actor of a tree only its own', () => {
    expect(tagsOf(controlsOf(GarageFake.blueprint, garage.controls))).toEqual([
      'AddCar',
    ]);
    expect(tagsOf(controlsOf(CarFake.blueprint, garage.controls))).toEqual([
      'Park',
      'DriveAway',
    ]);
  });

  it('offers a Message only when the Fake lists it', () => {
    expect(tagsOf(controlsOf(WeatherFake.blueprint, ['Observed']))).toEqual([
      'Observed',
    ]);
    expect(
      tagsOf(controlsOf(WeatherFake.blueprint, weather.controls)),
    ).not.toContain('Observed');
  });
});

describe('fieldsOf', () => {
  it('reads text, numbers, switches and choices, optional or not', () => {
    expect(fieldsOf(controlOf(GarageFake, 'AddCar').schema)).toEqual([
      {
        name: 'name',
        optional: false,
        nullable: false,
        input: { kind: 'text' },
      },
      {
        name: 'color',
        optional: false,
        nullable: false,
        input: { kind: 'choice', options: ['red', 'blue', 'green'] },
      },
      {
        name: 'seats',
        optional: true,
        nullable: false,
        input: { kind: 'number' },
      },
    ]);
    expect(fieldsOf(controlOf(WeatherFake, 'StartRaining').schema)).toEqual([
      {
        name: 'heavy',
        optional: false,
        nullable: false,
        input: { kind: 'boolean' },
      },
    ]);
    expect(fieldsOf(controlOf(CarFake, 'Park').schema)).toEqual([]);
  });

  it('reads a field by its encoded side; a nullable one is blank for null; anything else is JSON', () => {
    const control: Control = {
      tag: 'Odd',
      schema: Schema.TaggedStruct('Odd', {
        when: Schema.DateFromString,
        version: Schema.NullOr(Schema.String),
        size: Schema.NullOr(Schema.Literals(['s', 'm'])),
        where: Schema.Struct({ x: Schema.Number }),
      }),
    };
    expect(
      fieldsOf(control.schema).map(({ name, nullable, input }) => ({
        name,
        nullable,
        kind: input.kind,
      })),
    ).toEqual([
      { name: 'when', nullable: false, kind: 'text' },
      { name: 'version', nullable: true, kind: 'text' },
      { name: 'size', nullable: true, kind: 'choice' },
      { name: 'where', nullable: false, kind: 'json' },
    ]);
    const made = messageOf(control, {
      when: '2026-01-02T00:00:00.000Z',
      version: '',
      size: '',
      where: '{"x": 2}',
    });
    expect(made).toEqual({
      ok: true,
      message: {
        _tag: 'Odd',
        when: new Date('2026-01-02T00:00:00.000Z'),
        version: '',
        size: null,
        where: { x: 2 },
      },
    });
  });
});

describe('messageOf', () => {
  const addCar = controlOf(GarageFake, 'AddCar');

  it('makes the Message from the form, a blank optional field left out', () => {
    expect(messageOf(addCar, { name: 'mini', color: '1', seats: '' })).toEqual({
      ok: true,
      message: { _tag: 'AddCar', name: 'mini', color: 'blue' },
    });
    expect(messageOf(addCar, { name: 'van', color: '2', seats: '7' })).toEqual({
      ok: true,
      message: { _tag: 'AddCar', name: 'van', color: 'green', seats: 7 },
    });
    expect(
      messageOf(controlOf(WeatherFake, 'StartRaining'), { heavy: true }),
    ).toEqual({ ok: true, message: { _tag: 'StartRaining', heavy: true } });
  });

  it('says why a form makes no Message', () => {
    expect(messageOf(addCar, { name: 'van', color: '0', seats: 'x' })).toEqual({
      ok: false,
      error: 'seats is not a number',
    });
    expect(
      messageOf(controlOf(WeatherFake, 'SetTemperature'), { degrees: '' }),
    ).toEqual({ ok: false, error: 'degrees is not a number' });
    const half = messageOf(addCar, { name: 'van', color: '0', seats: '2.5' });
    expect(half.ok).toBe(false);
  });
});

describe('wordsOf', () => {
  it('writes a Message tag in words', () => {
    expect(wordsOf('AddSampleProject')).toBe('Add sample project');
    expect(wordsOf('PutCloudOutOfReach')).toBe('Put cloud out of reach');
    expect(wordsOf('OpenURL')).toBe('Open URL');
    expect(wordsOf('Park')).toBe('Park');
  });
});

describe('treeOf and sendTo', () => {
  it('lists every Instance, a keyed Child by its key, with its State, Model and Controls', () => {
    const runtime = Runtime.make(GarageFake);
    runtime.root.send({ _tag: 'AddCar', name: 'mini', color: 'red' });
    runtime.root.send({ _tag: 'AddCar', name: 'van', color: 'blue' });
    const root = treeOf(garage, runtime.snapshot);
    expect(root).toMatchObject({
      address: 'Garage',
      actor: 'Garage',
      tag: 'Single',
      model: { cars: [{ name: 'mini' }, { name: 'van' }] },
    });
    expect(tagsOf(root.controls)).toEqual(['AddCar']);
    expect(
      root.children.map(({ slot, key, actor, model }) => ({
        slot,
        key,
        actor,
        model,
      })),
    ).toEqual([
      {
        slot: 'cars',
        key: 'mini',
        actor: 'Car',
        model: { name: 'mini', color: 'red', parked: true },
      },
      {
        slot: 'cars',
        key: 'van',
        actor: 'Car',
        model: { name: 'van', color: 'blue', parked: true },
      },
    ]);
    expect(tagsOf(root.children[0]!.controls)).toEqual(['Park', 'DriveAway']);
    void runtime.dispose();
  });

  it('Sends a Control to an Instance from the bubble, and says what became of it', () => {
    const runtime = Runtime.make(WeatherFake);
    const played: Array<Entry> = [];
    runtime.subscribe((entries) => played.push(...entries));
    expect(
      sendTo(runtime, 'Weather', { _tag: 'StartRaining', heavy: false }),
    ).toBe('handled');
    expect(
      sendTo(runtime, 'Weather', { _tag: 'StartRaining', heavy: true }),
    ).toBe('ignored');
    expect(sendTo(runtime, 'Weather/nowhere', { _tag: 'StopRaining' })).toBe(
      'refused',
    );
    expect(played.map(({ to, from }) => ({ to, from }))).toEqual([
      { to: 'Weather', from: FROM_BUBBLE },
      { to: 'Weather', from: FROM_BUBBLE },
    ]);
    expect(treeOf(weather, runtime.snapshot).tag).toBe('Raining');
    void runtime.dispose();
  });
});
