export const capabilityDocumentation = (
  introduction: string,
  mentalModel: string,
  example: string,
  boundaries: string,
) => `
${introduction}

${mentalModel}

\`\`\`ts
${example.trim()}
\`\`\`

${boundaries}
`;
