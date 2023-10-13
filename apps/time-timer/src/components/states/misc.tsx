type TextProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLSpanElement>,
  HTMLSpanElement
>;
export const Text = ({ children, ...props }: TextProps) => {
  return (
    <span
      {...props}
      style={{
        fontSize: 32,
      }}
    >
      {children}
    </span>
  );
};

type ContainerProps = { children: React.ReactNode } & React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLDivElement>,
  HTMLDivElement
>;
export const ControlsWrapper = (props: ContainerProps) => {
  return (
    <div
      {...props}
      className={
        "w-[270px] m-auto flex flex-col justify-center items-stretch" +
        props.className
      }
    />
  );
};

interface ImageProps
  extends React.DetailedHTMLProps<
    React.ImgHTMLAttributes<HTMLImageElement>,
    HTMLImageElement
  > {
  src: string;
}
export const Image = ({ src = "", ...props }: ImageProps) => {
  return (
    <img
      {...props}
      src={src}
      className={
        "transition-transform duration-200 ease-in-out " +
        "hover:scale-110 cursor-pointer"
      }
      style={{
        margin: -12,
        width: 70,
        ...props.style,
      }}
    />
  );
};
