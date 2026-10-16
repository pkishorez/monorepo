import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, link, pane } from '../../components/index.ts';

/*
 * One post, inside the blog. From the `lg` width its article scrolls on
 * its own, below it the window does. It is named for its post,
 * `data-scroll-restoration-id`, so a new post opens at its top and Back
 * finds the one before where it was read to. Each part has an id, for a
 * link to it: `/blog/scroll-entry#part-5`.
 */

export const PostView = View.make(Pages.PostLive, ({ props }) => (
  <PlaceFrame
    place="Blog.Post"
    title={
      props.status._tag === 'Ready'
        ? props.status.data.title
        : `/blog/${props.params.slug}`
    }
    status={props.status}
    fill
  >
    <div
      data-scroll-restoration-id={`post:${props.params.slug}`}
      className={pane}
    >
      <Loaded
        status={props.status}
        label={`Loading /blog/${props.params.slug}… (a second)`}
        lines={10}
      >
        {(post) => (
          <article className="max-w-prose space-y-4">
            <p className="flex flex-wrap gap-x-3 font-mono text-xs">
              {post.body.map((_, at) => (
                <a key={at} href={`#part-${at + 1}`} className={link}>
                  part {at + 1}
                </a>
              ))}
            </p>
            {post.body.map((paragraph, at) => (
              <section
                key={at}
                id={`part-${at + 1}`}
                className="space-y-1 text-sm leading-6"
              >
                <h2 className="font-mono text-xs text-muted-foreground">
                  part {at + 1}
                </h2>
                <p>{paragraph}</p>
              </section>
            ))}
          </article>
        )}
      </Loaded>
    </div>
  </PlaceFrame>
));
