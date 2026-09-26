export interface RouteData {
  readonly generatedAt: string;
  readonly items: ReadonlyArray<{
    readonly id: number;
    readonly label: string;
  }>;
}

export const makeData = (): RouteData => ({
  generatedAt: new Date().toISOString(),
  items: Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    label: `Item ${i + 1} (${Math.floor(Math.random() * 1000)})`,
  })),
});
