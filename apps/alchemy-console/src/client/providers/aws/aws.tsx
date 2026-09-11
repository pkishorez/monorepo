/** What the AWS credential form asks for and how it turns answers into a secret. */
export const aws = {
  kind: 'aws' as const,
  label: 'AWS',
  description:
    'An IAM access key. Console uses it to delete DynamoDB tables; the region is chosen per stage.',
  namePlaceholder: 'Work AWS',
  fields: [
    {
      key: 'accessKeyId',
      label: 'Access key ID',
      type: 'text' as const,
      placeholder: 'AKIA…',
      validate: (value: string) =>
        value.trim() ? null : 'Enter your AWS access key ID.',
    },
    {
      key: 'secretAccessKey',
      label: 'Secret access key',
      type: 'password' as const,
      validate: (value: string) =>
        value.trim() ? null : 'Enter your AWS secret access key.',
    },
  ],
  toSecret: (values: Record<string, string>) => ({
    provider: 'aws' as const,
    accessKeyId: (values.accessKeyId ?? '').trim(),
    secretAccessKey: (values.secretAccessKey ?? '').trim(),
  }),
  formatAccount: (account: string) => account,
};
