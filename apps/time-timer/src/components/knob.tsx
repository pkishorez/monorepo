const knobDims = {
  width: 900,
  height: 900,
};

export const Knob = ({
  x,
  y,
  rotation = 0,
  applyTransition = true,
}: {
  x: number;
  y: number;
  applyTransition: boolean;
  rotation?: number;
}) => {
  return (
    <g
      style={{
        transform: `translate(${x - knobDims.width / 2}px, ${
          y - knobDims.height / 2
        }px) rotate(${(rotation - 90 * 3) * -1}deg)`,
        transformOrigin: `${knobDims.width / 2}px ${knobDims.height / 2}px`,
        transition: applyTransition ? "transform linear 0.3s" : "none",
      }}
    >
      <g clipPath="url(#clip0_10_148)">
        <g filter="url(#filter0_d_10_148)">
          <g filter="url(#filter1_f_10_148)">
            <path
              d="M561.1 487C548.145 487 536.858 495.126 529.407 505.724C511.856 530.687 482.833 547 450 547C396.428 547 353 503.572 353 450C353 396.428 396.428 353 450 353C483.418 353 512.89 369.9 530.334 395.619C537.753 406.556 549.205 415 562.422 415H725C744.882 415 761 431.118 761 451C761 470.882 744.882 487 725 487H561.1Z"
              fill="#2F3134"
            />
          </g>
          <g filter="url(#filter2_i_10_148)">
            <path
              d="M561.1 487C548.145 487 536.858 495.126 529.407 505.724C511.856 530.687 482.833 547 450 547C396.428 547 353 503.572 353 450C392.198 450 525.603 450.904 538.663 450.993C539.413 450.998 540.069 450.976 540.818 450.929L734.961 438.584H756.988L761 451C761 470.882 744.882 487 725 487H561.1Z"
              fill="#4B4648"
            />
          </g>
          <g filter="url(#filter3_f_10_148)">
            <path
              d="M557.731 462.999C542.451 462.999 529.862 474.255 522.299 487.531C508.188 512.299 481.544 528.999 451 528.999C405.713 528.999 369 492.287 369 447C369 401.712 405.713 365 451 365C480.551 365 506.452 380.632 520.883 404.078C528.576 416.577 540.836 427 555.513 427H723C732.941 427 741 435.058 741 445C741 454.941 732.941 462.999 723 462.999H557.731Z"
              fill="#38383D"
            />
          </g>
          <g filter="url(#filter4_f_10_148)">
            <path
              d="M440 528C355.641 525.72 353 450 353 450C353 450 363.415 449.921 369 450C370 473 387 520 440 528Z"
              fill="#2F3134"
            />
          </g>
          <g filter="url(#filter5_f_10_148)">
            <path
              d="M373.457 419.472C376.372 371.207 458.974 328.448 507.239 387.403C468.044 353.715 400.991 354.362 373.457 419.472Z"
              fill="url(#paint0_linear_10_148)"
            />
          </g>
          <g filter="url(#filter6_f_10_148)">
            <path
              d="M513.003 392.852C519.631 413.841 533.153 423.684 556.476 426.923L723.947 426.923L736.256 426.923C736.475 418.926 731.347 419.833 728.348 419.751C678.321 420.05 573.674 420.321 555.303 419.018C536.932 417.715 519.448 401.031 513.003 392.852Z"
              fill="url(#paint1_linear_10_148)"
            />
          </g>
          <path
            d="M739.82 451.54C744.915 436.639 731.398 428.541 722.652 419.795C759.256 417.851 761.007 444.999 761.007 451.54C759.929 459.9 759.58 461.582 759.58 461.258C759.58 460.934 739.82 451.54 739.82 451.54Z"
            fill="url(#paint2_linear_10_148)"
          />
        </g>
      </g>
      <defs>
        <filter
          id="filter0_d_10_148"
          x="241"
          y="247"
          width="664.007"
          height="450"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="16" dy="22" />
          <feGaussianBlur stdDeviation="64" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_10_148"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_10_148"
            result="shape"
          />
        </filter>
        <filter
          id="filter1_f_10_148"
          x="351.704"
          y="351.704"
          width="410.591"
          height="196.591"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="0.647856"
            result="effect1_foregroundBlur_10_148"
          />
        </filter>
        <filter
          id="filter2_i_10_148"
          x="353"
          y="438.584"
          width="408"
          height="111.007"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="2.59143" />
          <feGaussianBlur stdDeviation="6.47856" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0"
          />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect1_innerShadow_10_148"
          />
        </filter>
        <filter
          id="filter3_f_10_148"
          x="367.704"
          y="363.704"
          width="374.591"
          height="166.591"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="0.647856"
            result="effect1_foregroundBlur_10_148"
          />
        </filter>
        <filter
          id="filter4_f_10_148"
          x="351.704"
          y="448.669"
          width="89.5914"
          height="80.6263"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="0.647856"
            result="effect1_foregroundBlur_10_148"
          />
        </filter>
        <filter
          id="filter5_f_10_148"
          x="372.161"
          y="357.457"
          width="136.374"
          height="63.3104"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="0.647856"
            result="effect1_foregroundBlur_10_148"
          />
        </filter>
        <filter
          id="filter6_f_10_148"
          x="511.707"
          y="391.556"
          width="225.852"
          height="36.6629"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="0.647856"
            result="effect1_foregroundBlur_10_148"
          />
        </filter>
        <linearGradient
          id="paint0_linear_10_148"
          x1="495.254"
          y1="367.32"
          x2="384.056"
          y2="381.817"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#43434A" stopOpacity="0" />
          <stop offset="0.522102" stopColor="#64646F" />
          <stop offset="1" stopColor="#43434A" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_10_148"
          x1="743.707"
          y1="418.825"
          x2="580.667"
          y2="521.952"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#43434A" stopOpacity="0" />
          <stop offset="0.261052" stopColor="#64646F" />
          <stop offset="0.695274" stopColor="#64646F" />
          <stop offset="1" stopColor="#43434A" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="paint2_linear_10_148"
          x1="741.764"
          y1="451.54"
          x2="740.144"
          y2="426.274"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4B4648" />
          <stop offset="1" stopColor="#4B4648" stopOpacity="0" />
        </linearGradient>
        <clipPath id="clip0_10_148">
          <rect width="900" height="900" fill="white" />
        </clipPath>
      </defs>
    </g>
  );
};
