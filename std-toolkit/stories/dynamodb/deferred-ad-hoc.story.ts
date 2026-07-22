import { Effect } from 'effect';
import { dynamodbDeferredStories } from './support/story-groups.js';

dynamodbDeferredStories
  .story('Ad hoc scenarios', {
    description:
      'Documents useful checks that do not yet form one coherent user flow and remain skipped until Laymos supports ad hoc scenario collections.',
  })
  .execute(() => Effect.void)
  .skip('condition expression compilation', {
    description:
      'Pure builder inspection is useful but is not a user flow through one public DynamoDB operation.',
  })
  .skip('filter expression compilation', {
    description:
      'Pure builder inspection is useful but is not a user flow through one public DynamoDB operation.',
  })
  .skip('update expression compilation', {
    description:
      'Pure builder inspection is useful but is not a user flow through one public DynamoDB operation.',
  })
  .skip('standalone expression helper compilation', {
    description:
      'Several unrelated helper calls need an ad hoc example abstraction rather than one Story executor.',
  })
  .skip('generated table schema inspection', {
    description:
      'Synchronous builder output is a useful structural check but is not an executed DynamoDB flow.',
  })
  .skip('missing-table get failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table put failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table update failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table delete failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table query failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table scan failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table describe failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table batch-write failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('missing-table transaction failure', {
    description:
      'Missing-table failures span separate public methods and await an ad hoc scenario collection.',
  })
  .skip('singleton deferred update transaction', {
    description:
      'Combining update-operation construction, transaction commit, and a follow-up read is an ad hoc composite rather than one fixed flow.',
  });
