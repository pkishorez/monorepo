/** The cards Foldkit's example starts with. */
export const DEFAULT_COLUMNS = [
  {
    id: 'todo',
    name: 'To Do',
    cards: [
      {
        id: 'card-1',
        title: 'Research drag-and-drop patterns',
        description: 'Review dnd-kit, elm-draggable, and annaghi/dnd-list.',
      },
      {
        id: 'card-2',
        title: 'Design the data model',
        description: 'Card, Column, and Board schemas.',
      },
      {
        id: 'card-3',
        title: 'Write collision detection',
        description: 'elementsFromPoint + getBoundingClientRect.',
      },
      {
        id: 'card-4',
        title: 'Add keyboard accessibility',
        description: 'Space to pick up, arrows to move, Escape to cancel.',
      },
    ],
  },
  {
    id: 'in-progress',
    name: 'In Progress',
    cards: [
      {
        id: 'card-7',
        title: 'Build the DragAndDrop component',
        description: 'A state machine with collision detection.',
      },
      {
        id: 'card-8',
        title: 'Create kanban example',
        description: 'Responsive grid layout with localStorage persistence.',
      },
      {
        id: 'card-9',
        title: 'Live reorder preview',
        description: 'Cards shift to make room for the dragged item.',
      },
    ],
  },
  {
    id: 'done',
    name: 'Done',
    cards: [
      {
        id: 'card-12',
        title: 'Set up the monorepo',
        description: 'Core, website, and examples.',
      },
      {
        id: 'card-14',
        title: 'Publish to npm',
        description: 'Changesets, CI/CD pipeline, and automated releases.',
      },
      {
        id: 'card-16',
        title: 'Ship DevTools',
        description: 'Message inspector, Model viewer, time travel.',
      },
    ],
  },
];
