export const Shadow = () => {
  const dims = {
    width: 1720,
    height: 1720,
  };

  return (
    <g transform={`translate(-${dims.width}, -${dims.height / 2})`}>
      <g filter="url(#a)">
        <path stroke="#000" strokeWidth={2} d="M859 860V34" />
      </g>
      <defs>
        <filter
          id="a"
          width={42}
          height={866}
          x={838}
          y={14}
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_1_138"
            stdDeviation={10}
          />
        </filter>
      </defs>
    </g>
  );
};
