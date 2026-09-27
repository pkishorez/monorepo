import { Div, enter } from '../../../index';

/** The opening title card: a gradient heading with a one-line subtitle. */
export const quickTitle = ({
  text,
  subtitle,
}: {
  text: string;
  subtitle: string;
}) => (
  <Div
    className="flex flex-col items-center gap-[calc(1.1*var(--u))]"
    {...enter.pop}
  >
    <h2 className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-[calc(3.3*var(--u))] font-bold text-transparent">
      {text}
    </h2>
    <p className="text-[calc(1.3*var(--u))] text-muted-foreground">
      {subtitle}
    </p>
  </Div>
);
