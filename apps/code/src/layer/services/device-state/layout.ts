import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How Device State is laid out, as one StdTable: one row for the keyboard,
 * the user's own Bindings; one for whether Vim Mode is on, off until it is
 * turned on; one for whether the app floats as a window, off until it
 * is turned on; one for the text size, medium until chosen; one for the microphone a Dictation records
 * from; one each for whether the Touch Draft takes Smart Input and
 * Smart Displacement, off until turned on;
 * one for the Machine the sidebar shows; one for the sidebar's width; one row per Unseen mark, each the
 * end time of the last Turn of a Session of one Machine seen on this
 * device, whose Machine it is, and its Session's Project.
 *
 * The marks of before Machines (`UnseenMark`, by Session id alone) are no
 * longer read: no Machine can claim them; nor is how the Touch Draft was
 * written before Smart Input (`DeviceTouch`, text or voice).
 */

export const DEVICE_TABLE = 'device';

export const table = StdTable.make(DEVICE_TABLE).primary('pk', 'sk').build();

const KeyboardSchema = ESchema.make('DeviceKeyboard', {
  /** Each Action's own keys, by Action id, as people write them. */
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
}).build();

export const keyboard = table
  .singleEntity(KeyboardSchema)
  .default({ bindings: {} });

const VimSchema = ESchema.make('DeviceVim', {
  /** Whether Vim Mode is on: plain keys as shortcuts, and the Draft read until `i`. */
  on: Schema.Boolean,
}).build();

export const vim = table.singleEntity(VimSchema).default({ on: false });

const FloatingSchema = ESchema.make('DeviceFloating', {
  /** Whether the app floats as a window on a screen wider than it can be. */
  on: Schema.Boolean,
}).build();

export const floating = table
  .singleEntity(FloatingSchema)
  .default({ on: false });

const TextSizeSchema = ESchema.make('DeviceTextSize', {
  /** How big text and spacing are with a keyboard on a wide screen. */
  size: Schema.Literals(['small', 'medium', 'large']),
}).build();

export const textSize = table
  .singleEntity(TextSizeSchema)
  .default({ size: 'medium' });

const MicrophoneSchema = ESchema.make('DeviceMicrophone', {
  /** The audio input chosen, by the browser's `deviceId`; null for the system default. */
  deviceId: Schema.NullOr(Schema.String),
}).build();

export const microphone = table
  .singleEntity(MicrophoneSchema)
  .default({ deviceId: null });

const SmartInputSchema = ESchema.make('DeviceSmartInput', {
  /** Whether the Touch Draft takes Smart Input: opened by a tap, typed in only from Edit. */
  on: Schema.Boolean,
}).build();

export const smartInput = table
  .singleEntity(SmartInputSchema)
  .default({ on: false });

const SmartDisplacementSchema = ESchema.make('DeviceSmartDisplacement', {
  /** Whether a caret or a selection's end dragged in the Touch Draft sits above the finger. */
  on: Schema.Boolean,
}).build();

export const smartDisplacement = table
  .singleEntity(SmartDisplacementSchema)
  .default({ on: false });

const SidebarSchema = ESchema.make('DeviceSidebar', {
  /** The Machine whose Projects the sidebar lists; null for every Machine. */
  machineId: Schema.NullOr(Schema.String),
}).build();

export const sidebar = table
  .singleEntity(SidebarSchema)
  .default({ machineId: null });

const SidebarWidthSchema = ESchema.make('DeviceSidebarWidth', {
  /** The sidebar's width on a wide screen, in px, as last dragged. */
  width: Schema.Finite,
}).build();

export const sidebarWidth = table
  .singleEntity(SidebarWidthSchema)
  .default({ width: 260 });

const MarkSchema = EntityESchema.make('MachineUnseenMark', 'mark', {
  machineId: Schema.String,
  sessionId: Schema.String,
  /** When the last Turn seen ended, in ms since the epoch; 0 before any. */
  seen: Schema.Finite,
})
  // Whose Machine it is, so it goes with the Account; null for a mark made
  // before, until its Session is seen again.
  .evolve('v2', { accountId: Schema.NullOr(Schema.String) }, (v1) => ({
    ...v1,
    accountId: null,
  }))
  // Its Session's Project, so it goes with the Project; null for a mark made
  // before, until its Session is seen again.
  .evolve('v3', { projectId: Schema.NullOr(Schema.String) }, (v2) => ({
    ...v2,
    projectId: null,
  }))
  .build();

export type Mark = typeof MarkSchema.Type;

export const marks = table.entity(MarkSchema).primary().build();
