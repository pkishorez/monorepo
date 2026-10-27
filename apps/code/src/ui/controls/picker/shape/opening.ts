import { useState } from 'react';

/*
 * Which Picker was opened last. Every Picker is drawn on the one `picker`
 * Surface, so one opened while another is still drawn takes the Surface
 * over, and the old one, dropped by its owner after, must not leave it.
 * Each opening is counted as it happens, in the handler that enters the
 * Surface, and a Picker's List reads the count as it first draws: the
 * List of the latest opening is the one that may leave.
 */

let openings = 0;

/** Counts an opening: called just before the Surface is entered. */
export const opened = () => {
  openings += 1;
};

/** The opening this Picker was drawn for. */
export const useOpening = () => useState(() => openings)[0];

/** Whether no Picker has been opened since this one. */
export const isLatest = (opening: number) => opening === openings;
