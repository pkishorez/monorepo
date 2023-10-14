import { HTMLMotionProps, motion } from "framer-motion";

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

export const Image = ({ src = "", ...props }: HTMLMotionProps<"img">) => {
  return (
    <motion.img
      {...props}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      src={src}
      className="cursor-pointer"
      draggable="false"
      style={{
        margin: -12,
        width: 70,
        ...props.style,
      }}
    />
  );
};
