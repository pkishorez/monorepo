import { useId } from 'react';
import { Flight } from './flight.js';

/** A rocket on its pad that takes fuel when clicked: the first chapter's whole drawing. */
export const Ship = ({
  fuel,
  onClick,
}: {
  fuel: number;
  onClick?: () => void;
}) => <Flight id={useId()} tag="OnPad" fuel={fuel} onFuel={onClick} />;
