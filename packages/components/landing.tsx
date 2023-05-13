export const Landing = ({ children }: { children?: React.ReactNode }) => (
  <div className="h-screen w-screen bg-base flex items-center justify-center">
    <h1 className="text-h1">
      Hello World!
      <br />
      {children}
    </h1>
  </div>
);
