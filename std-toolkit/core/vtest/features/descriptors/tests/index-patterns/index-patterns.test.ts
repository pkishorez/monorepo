import type { StdDescriptor, DescriptorSource } from '@std-toolkit/core';
import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'a StdDescriptor states a table backend-agnostically',
  'name, id field, version, and the pattern/deps of each index key',
  () => {
    vtest(
      'an index pattern names the fields its key is built from',
      'pattern is legible; deps lists the entity fields that drive it',
      () => {
        const descriptor: StdDescriptor = {
          name: 'User',
          idField: 'userId',
          version: 'v1',
          primaryIndex: {
            name: 'primary',
            pk: { deps: ['tenantId'], pattern: 'Tenant#{tenantId}' },
            sk: { deps: ['userId'], pattern: 'User#{userId}' },
          },
          secondaryIndexes: [
            {
              name: 'byEmail',
              pk: { deps: ['email'], pattern: '{email}' },
              sk: { deps: ['_u'], pattern: '{_u}' },
            },
          ],
          schema: { type: 'object' } as StdDescriptor['schema'],
        };

        if (descriptor.primaryIndex.pk.deps[0] !== 'tenantId') {
          throw new Error('pk should depend on tenantId');
        }
        if (descriptor.secondaryIndexes[0]!.name !== 'byEmail') {
          throw new Error('expected a byEmail secondary index');
        }
      },
    );

    vtest(
      'a DescriptorSource hands back its own descriptor',
      'this is the contract DynamoEntity and SQLiteTable both satisfy',
      () => {
        const source: DescriptorSource = {
          getDescriptor: () => ({
            name: 'Settings',
            idField: 'id',
            version: 'v1',
            primaryIndex: {
              name: 'primary',
              pk: { deps: [], pattern: 'Settings' },
              sk: { deps: ['id'], pattern: '{id}' },
            },
            secondaryIndexes: [],
            schema: { type: 'object' } as StdDescriptor['schema'],
          }),
        };

        if (source.getDescriptor().name !== 'Settings') {
          throw new Error('source did not return its descriptor');
        }
      },
    );
  },
);
