import { createMachine } from "xstate";

export const timeTimerMachine = createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBcCWBbMBaNmBOW6AhgMYAWqAdmAMQBKAogMoMAqA2gAwC6ioADgHtYqNIMp8QAD0RYAjAA4AdAGYVAFgBsAJgCsnOQE5tmwwHY5AGhABPWXLOalZzroW7t2s2YXfdZgF8A61xsUIJiciowJSpRVCIAGxoABQAZAEEATS5eJBAhETEJfJkEbXVOJVdFD051OW0FbRVrOwR5TjNnB3UzQ0aFQ0NdXXUgkIwwqYjSCmpYynikmlzJQvjxSTLK3SV1BU0VOTczXU0jTV022S19wwVG9T0tOU0FCZBQnBnCOeilHgAK6UJaUKCpDIAVRYa3yG2K20QFSqpgcnBMZhUD0UNw6x26XgUx2JlS65l0n2+4T+UQW-CIQNgkFSmRyPHWwk2JVAZQqe1JxmeZgqmnUKm0eKw2jk6mqIzJ9RGchOQWCIEogggcEk1N+kXmYE5RVQW1Ksk0TjUWj0BmMpgsUsqcs0Bk8PmVLUtVKmP3wtMNi2WiWN3KRCDknBU+08B3qQ3UbhUZilkeUrldsaGsp8ch9mD9YFmdJiwNBVCgocR5oQKkOShlSqF2Nq11sshlcvF2LrOl0ssUH3Vev9BoBDKZkCrpp50kQjW0DYOKiOemOBmxUq8csjkZFCgx27zaqAA */
  initial: "initial",
  tsTypes: {} as import("./machine.typegen").Typegen0,
  schema: {
    context: {} as { until: string },
  },

  states: {
    initial: {
      on: {
        PLAY: "running",
      },
    },
    running: {
      on: {
        PAUSE: "paused",
      },
    },
    paused: {
      on: {
        PLAY: "running",
      },
    },
  },
  on: {
    RESET: ".initial",
  },
  id: "time-timer-machine",
});
