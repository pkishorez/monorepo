import { createMachine } from 'xstate';

export const trafficLightMachine = createMachine({
  id: 'traffic-light',
  initial: 'red',
  states: {
    red: {
      description: 'Traffic is stopped.',
      on: { TIMER: 'green' },
    },
    green: {
      description: 'Traffic may proceed.',
      on: { TIMER: 'yellow' },
    },
    yellow: {
      description: 'The signal is about to change.',
      on: { TIMER: 'red' },
    },
  },
});

export const orderMachine = createMachine({
  id: 'order-processing',
  initial: 'draft',
  states: {
    draft: {
      description: 'An order is being assembled.',
      on: {
        SUBMIT: 'validating',
        CANCEL: 'cancelled',
      },
    },
    validating: {
      description: 'The order is checked before payment.',
      on: {
        VALID: 'charging',
        INVALID: 'draft',
      },
    },
    charging: {
      description: 'Payment is being authorized.',
      on: {
        APPROVED: 'fulfilling',
        DECLINED: 'paymentFailed',
      },
    },
    paymentFailed: {
      description: 'Payment needs attention.',
      on: {
        RETRY: 'charging',
        CANCEL: 'cancelled',
      },
    },
    fulfilling: {
      description: 'The order is being prepared.',
      on: { SHIPPED: 'complete' },
    },
    complete: {
      description: 'The order was delivered to the carrier.',
      type: 'final',
    },
    cancelled: {
      description: 'The order was cancelled.',
      type: 'final',
    },
  },
});

export const uploadMachine = createMachine({
  id: 'file-upload',
  initial: 'idle',
  states: {
    idle: {
      description: 'Waiting for a file.',
      on: { SELECT: 'validating' },
    },
    validating: {
      description: 'Checking file type and size.',
      on: {
        VALID: 'uploading',
        INVALID: 'rejected',
      },
    },
    uploading: {
      description: 'Sending chunks to storage.',
      on: {
        PROGRESS: 'uploading',
        COMPLETE: 'processing',
        NETWORK_ERROR: 'retrying',
        CANCEL: 'cancelled',
      },
    },
    retrying: {
      description: 'Waiting before another attempt.',
      on: {
        RETRY: 'uploading',
        GIVE_UP: 'failed',
      },
    },
    processing: {
      description: 'Creating previews and metadata.',
      on: {
        READY: 'complete',
        ERROR: 'failed',
      },
    },
    rejected: {
      description: 'The selected file is not accepted.',
      on: { SELECT: 'validating' },
    },
    complete: { type: 'final' },
    failed: { type: 'final' },
    cancelled: { type: 'final' },
  },
});

export const mediaPlayerMachine = createMachine({
  id: 'media-player',
  initial: 'off',
  states: {
    off: {
      description: 'The player is powered down.',
      on: { POWER: 'on' },
    },
    on: {
      initial: 'loading',
      states: {
        loading: {
          description: 'Buffering the selected media.',
          on: { READY: 'ready', ERROR: 'error' },
        },
        ready: {
          description: 'Media is ready to play.',
          on: { PLAY: 'playing' },
        },
        playing: {
          description: 'Playback is active.',
          on: { PAUSE: 'paused', END: 'ready' },
        },
        paused: {
          description: 'Playback position is preserved.',
          on: { PLAY: 'playing', STOP: 'ready' },
        },
        error: {
          description: 'The media could not be loaded.',
          on: { RETRY: 'loading' },
        },
      },
      on: { POWER: 'off' },
    },
  },
});

export const documentReviewMachine = createMachine({
  id: 'document-review',
  initial: 'editing',
  states: {
    editing: {
      description: 'The author prepares a new revision.',
      on: { SUBMIT: 'review' },
    },
    review: {
      type: 'parallel',
      states: {
        legal: {
          initial: 'pending',
          states: {
            pending: { on: { LEGAL_APPROVE: 'approved' } },
            approved: { type: 'final' },
          },
        },
        security: {
          initial: 'pending',
          states: {
            pending: { on: { SECURITY_APPROVE: 'approved' } },
            approved: { type: 'final' },
          },
        },
        editorial: {
          initial: 'pending',
          states: {
            pending: { on: { EDITORIAL_APPROVE: 'approved' } },
            approved: { type: 'final' },
          },
        },
      },
      onDone: 'approved',
      on: { REQUEST_CHANGES: 'editing' },
    },
    approved: {
      description: 'Every review track has approved the document.',
      type: 'final',
    },
  },
});

export const releaseMachine = createMachine({
  id: 'software-release',
  initial: 'planning',
  states: {
    planning: {
      description: 'Scope and release notes are prepared.',
      on: { START: 'delivery' },
    },
    delivery: {
      type: 'parallel',
      states: {
        application: {
          initial: 'building',
          states: {
            building: { on: { BUILD_READY: 'deploying' } },
            deploying: {
              on: {
                DEPLOYED: 'healthy',
                DEPLOY_FAILED: 'rollingBack',
              },
            },
            rollingBack: { on: { ROLLED_BACK: 'building' } },
            healthy: { type: 'final' },
          },
        },
        documentation: {
          initial: 'drafting',
          states: {
            drafting: { on: { DOCS_READY: 'publishing' } },
            publishing: { on: { PUBLISHED: 'live' } },
            live: { type: 'final' },
          },
        },
      },
      onDone: 'monitoring',
      on: { ABORT: 'cancelled' },
    },
    monitoring: {
      description: 'Metrics are watched after rollout.',
      on: {
        STABLE: 'complete',
        REGRESSION: 'hotfix',
      },
    },
    hotfix: {
      description: 'A corrective release is being prepared.',
      on: { READY: 'delivery', CANCEL: 'cancelled' },
    },
    complete: { type: 'final' },
    cancelled: { type: 'final' },
  },
});
