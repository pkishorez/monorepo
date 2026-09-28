import { Badge } from '@kstackz/ui-toolkit/components/ui/badge';
import { Check, Clock } from '@kstackz/ui-toolkit/lucide';
import {
  At,
  Canvas,
  DrawnPath,
  FadeThrough,
  Region,
  Zoom,
  camera,
  ease,
  fps,
  glide,
  mix,
  visible,
} from '../../foundation/canvas/index.ts';
import {
  defineCanvasExplainer,
  type Cue,
} from '../../foundation/explainer/index.ts';
import {
  CodeCard,
  LayerCard,
  LintAlert,
  ReviewCard,
  configLines,
  layers,
  sourceLines,
} from './props.tsx';
import { voiceover } from './voiceover.ts';

// The plan, the config, the code and the review are regions of one board.
// The camera travels to where the next idea is drawn, and the recap pulls back
// to show the map it all made.

const cardY = [-190, 0, 190];
const config = { x: 1300, y: 0 };
const source = { x: 2620, y: 0 };
const review = { x: 1300, y: 960 };
const lineY = (i: number) => -190 + 36 * i;

// Highlights land first; the camera follows a beat later.
const after = 0.25;

function Drawing({ frame, cue }: { frame: number; cue: Cue }) {
  const mechanism = cue('mechanism', 'into one');
  const discovery = cue('discovery');
  const consequence = cue('consequence');
  const recap = cue('recap');
  const cut = consequence - 0.1 * fps;

  const shot = camera(frame, [
    { at: 0, x: 0, y: -190, scale: 2.2 },
    { at: cue('hook', 'And almost', -0.4), x: 0, y: -40, scale: 1.25 },
    { at: cue('familiar-world', 'The interface'), x: 0, y: 0, scale: 1.3 },
    {
      at: cue('disruption', 'One quiet', after),
      x: -180,
      y: 0,
      scale: 1.6,
    },
    { at: cue('disruption', 'Nobody'), x: 0, y: -20, scale: 1.2 },
    {
      at: cue('mechanism', 'moves', -0.2),
      x: 650,
      y: 0,
      scale: 0.8,
      seconds: 1.3,
    },
    {
      at: cue('mechanism', 'Layers own', after),
      x: 1300,
      y: -120,
      scale: 1.3,
    },
    {
      at: cue('mechanism', 'Modules draw', after),
      x: 1300,
      y: 20,
      scale: 1.3,
    },
    { at: cue('mechanism', 'Rules say', after), x: 1300, y: 150, scale: 1.3 },
    { at: discovery - 0.2 * fps, x: 1960, y: 30, scale: 0.72, seconds: 1.3 },
    { at: cue('discovery', 'crosses', after), x: 2500, y: -10, scale: 1.4 },
    {
      at: cue('discovery', 'lint fails', after),
      x: 2620,
      y: 120,
      scale: 1.1,
    },
    // The calm change hides the jump.
    { at: cut, x: review.x, y: review.y, scale: 1.4, seconds: 0.05 },
    { at: recap - 0.2 * fps, x: 1250, y: 330, scale: 0.46, seconds: 1.5 },
  ]);

  const stray = ease(frame, cue('disruption', 'One quiet'), 1, glide);
  const crossed = frame >= cue('discovery', 'crosses');
  const inRecap = frame >= recap;
  const focus =
    frame >= discovery - 0.2 * fps
      ? null
      : frame >= cue('mechanism', 'Rules say')
        ? 'rules'
        : frame >= cue('mechanism', 'Modules draw')
          ? 'modules'
          : frame >= cue('mechanism', 'Layers own')
            ? 'layers'
            : null;

  // In the recap each region lights up as the narrator names it.
  const lit = (region: 'plan' | 'config' | 'code' | 'review') => {
    if (!inRecap) return 1;
    const order = {
      config: cue('recap', 'Declare'),
      code: cue('recap', 'Let laymos'),
      plan: cue('recap', 'Keep'),
      review: Infinity,
    };
    const next = {
      config: order.code,
      code: order.plan,
      plan: Infinity,
      review: Infinity,
    };
    const on =
      ease(frame, order[region], 0.5) *
      (1 - ease(frame, next[region], 0.5) * 0.6);
    return mix(0.3, 1, Math.max(on, ease(frame, cue('recap', 'honest'), 0.6)));
  };

  return (
    <>
      <Canvas shot={shot}>
        {/* The plan */}
        <Region
          x={0}
          y={-400}
          title="The plan"
          frame={frame}
          enter={0}
          opacity={lit('plan')}
        >
          <Badge
            variant="destructive"
            className="h-12 px-5 text-2xl"
            style={{
              opacity: ease(frame, cue('hook', 'lying', -0.2), 0.4),
              transform: `scale(${mix(1.5, 1, ease(frame, cue('hook', 'lying', -0.2), 0.5))}) rotate(-4deg)`,
            }}
          >
            outdated
          </Badge>
        </Region>
        <div style={{ opacity: lit('plan') }}>
          {layers.map((layer, i) => (
            <At
              key={layer.id}
              x={0}
              y={cardY[i]!}
              style={{ opacity: ease(frame, i * 0.25 * fps, 0.6) }}
            >
              <Zoom by={1.5}>
                <LayerCard
                  name={layer.name}
                  path={layer.path}
                  badge={
                    i === 0 ? (
                      <Badge
                        variant="outline"
                        style={{
                          opacity: ease(
                            frame,
                            cue('disruption', 'the diagram'),
                          ),
                        }}
                      >
                        <Check className="text-positive" /> up to date
                      </Badge>
                    ) : undefined
                  }
                />
              </Zoom>
            </At>
          ))}
          <div className="text-foreground/40">
            <DrawnPath
              d="M 0 -128 L 0 -62"
              progress={ease(frame, cue('familiar-world', 'talks to'), 0.6)}
              arrow
            />
            <DrawnPath
              d="M 0 62 L 0 128"
              progress={ease(
                frame,
                cue('familiar-world', 'talk to services'),
                0.6,
              )}
              arrow
            />
          </div>
          <div
            className="text-destructive"
            style={{
              opacity: mix(
                1,
                0.3,
                ease(frame, cue('disruption', 'Nobody'), 0.9),
              ),
            }}
          >
            <DrawnPath
              d="M -196 -190 C -360 -190, -360 190, -196 190"
              progress={stray}
              dashed
              arrow
            />
          </div>
          <At
            x={-330}
            y={0}
            style={{
              opacity: visible(
                frame,
                cue('disruption', 'Friday'),
                cue('disruption', 'Nobody'),
              ),
            }}
          >
            <Zoom by={1.5}>
              <Badge variant="secondary">
                <Clock /> Fri 17:42
              </Badge>
            </Zoom>
          </At>
        </div>

        {/* The plan flows into the config: one thread per layer */}
        <div
          className="text-chart-6"
          style={{ opacity: inRecap ? lit('config') * 0.8 : 0.8 }}
        >
          {cardY.map((y, i) => (
            <DrawnPath
              key={i}
              d={`M 196 ${y} C 600 ${y}, 640 ${lineY(i + 2)}, 1050 ${lineY(i + 2)}`}
              progress={ease(frame, mechanism + i * 0.15 * fps, 1, glide)}
              width={2}
            />
          ))}
        </div>

        {/* The config */}
        <Region
          x={config.x}
          y={-420}
          title="The config"
          frame={frame}
          enter={mechanism}
          opacity={lit('config')}
        />
        <At
          x={config.x}
          y={config.y}
          style={{
            opacity: ease(frame, mechanism + 0.3 * fps) * lit('config'),
            transform: `translate(-50%, -50%) scale(${mix(0.96, 1, ease(frame, mechanism + 0.3 * fps))})`,
          }}
        >
          <Zoom by={1.5}>
            <CodeCard
              title="laymos.config.json"
              lines={configLines}
              focus={focus}
              marks={crossed ? { 11: 'focus' } : {}}
              className="w-[22rem]"
            />
          </Zoom>
        </At>

        {/* The rule the code breaks */}
        <div
          className="text-destructive"
          style={{ opacity: inRecap ? lit('code') : 1 }}
        >
          <DrawnPath
            d={`M 1566 ${lineY(11)} C 1900 ${lineY(11)}, 1880 -18, 2214 -18`}
            progress={ease(frame, cue('discovery', 'crosses'), 0.9, glide)}
            width={2.5}
            dashed
          />
        </div>

        {/* The code */}
        <Region
          x={source.x}
          y={-330}
          title="The code"
          frame={frame}
          enter={discovery}
          opacity={lit('code')}
        />
        <At
          x={source.x}
          y={source.y}
          style={{ opacity: ease(frame, discovery) * lit('code') }}
        >
          <Zoom by={1.5}>
            <CodeCard
              title="src/ui/checkout.tsx"
              lines={sourceLines}
              marks={crossed ? { 2: 'bad' } : {}}
              reveal={ease(frame, cue('discovery', 'reads'), 1, glide)}
              className="w-[34rem]"
            />
          </Zoom>
        </At>
        <At
          x={source.x}
          y={320}
          style={{
            opacity:
              ease(frame, cue('discovery', 'lint fails'), 0.5) * lit('code'),
            transform: `translate(-50%, -50%) translateY(${(1 - ease(frame, cue('discovery', 'lint fails'), 0.6)) * 20}px)`,
          }}
        >
          <Zoom by={1.5}>
            <LintAlert />
          </Zoom>
        </At>

        {/* The review */}
        <Region
          x={review.x}
          y={review.y - 260}
          title="The review"
          frame={frame}
          enter={cut}
          opacity={lit('review')}
        />
        <At
          x={review.x}
          y={review.y}
          style={{ opacity: (frame >= cut ? 1 : 0) * lit('review') }}
        >
          <Zoom by={1.5}>
            <ReviewCard frame={frame} enter={cut + 0.4 * fps} />
          </Zoom>
        </At>
      </Canvas>
      <FadeThrough frame={frame} at={cut} />
    </>
  );
}

export const laymos = defineCanvasExplainer({
  id: 'laymos',
  voiceover,
  canvas: Drawing,
});
