/** What a press injects in this demo: a label for the chip, text for the copy. */
export interface ContextPayload {
  readonly label: string;
  readonly text: string;
}

export interface ContextButton {
  readonly key: string;
  readonly payload: ContextPayload;
}

const booking = {
  reservation: 'NUM-48213',
  property: 'Berlin Mitte',
  unit: '4B',
  checkIn: '2026-10-02',
  nights: 3,
  status: 'payment_failed',
};

export const contextButtons: ReadonlyArray<ContextButton> = [
  {
    key: '1',
    payload: {
      label: 'This screen',
      text: 'Screenshot: checkout, step 2 of 3, with the red "Payment failed" banner under the card form.',
    },
  },
  {
    key: '2',
    payload: {
      label: 'Booking JSON',
      text: JSON.stringify(booking, null, 2),
    },
  },
  {
    key: '3',
    payload: {
      label: 'Runbook link',
      text: 'https://stt.kishore.app/runbooks/payment-failed#retry-window',
    },
  },
];
