const escape = (component: string) =>
  component.replaceAll('\\', '\\\\').replaceAll('#', '\\#');

export const encodeCompositeKey = (components: readonly string[]): string =>
  components.map(escape).join('#');
