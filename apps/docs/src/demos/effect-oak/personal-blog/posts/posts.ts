/*
 * The blog's writing, as markdown-subset text kept in the code. Foldkit
 * compiles `.md` files at build time with `@foldkit/markdown`; here the text
 * is read when drawn by the Prose drawing.
 */

type Post = {
  readonly slug: string;
  readonly title: string;
  readonly publishedOn: string;
  readonly summary: string;
  readonly body: string;
};

export const ABOUT = `
I’m a human man living in Boston, Massachusetts. I created and maintain [Foldkit](https://foldkit.dev), a frontend framework built on Effect. I like functional programming and building systems that are as beautiful on the inside as they are on the outside.

I routinely produce mechanical tension in my muscles to make them stronger. I also run around outdoors because it feels so good to go fast for a long time.

I play guitar, sing, and cover songs by The Weakerthans, Death Cab for Cutie, Stars, and the like.

I’m currently making my way through _Blindsight_ by Peter Watts and _Masters of Atlantis_ by Charles Portis.

I take photographs on 35mm film and am considering acquiring a medium-format camera.
`;

const MAKING_THIS_BLOG = `
The words you are reading are markdown kept as text in the code. A tiny formatter reads them into blocks, and the blog's View draws each block as React. No markdown library ships with it.

## Why bother

I wanted three things at once:

- Writing in plain markdown, with nothing between me and the words
- Real Effect Oak Views, so the timeline and the Message Log keep working
- Space in a post for something live from the app

## The fold

Drawing is one function from text to elements. Islands are drawn by the caller:

\`\`\`tsx
<Prose
  source={post.body}
  islands={{ Counter: () => <CounterView node={children.counter} /> }}
/>
\`\`\`

## Proof that it is alive

This counter is a Child Actor of the blog, drawn between two paragraphs:

::Counter{label="Clicks while reading this post"}

Navigate away, come back, and the count survives: the Counter lives as long as the blog does, not as long as this page. Pause and scrub the timeline, and you can watch every click replay.

:::Note
Containers can wrap markdown too. This callout is a container directive, and _this_ emphasis is drawn by the same fold as everything else.
:::

> A blog post that can hold live components is an app wearing prose.

That is the whole trick.
`;

const SHOOTING_FILM = `
Every frame of 35mm costs real money. That constraint is the entire appeal. My phone will happily take two hundred photographs of the same sandwich, and I will feel nothing. On film, you get 36 chances per roll.

## The rotation

1. Portra 400 for people
2. Ektar 100 for daylight and saturated color
3. HP5 pushed to 1600 when the light gives up

I took thousands of photos on digital cameras throughout college and I never look at them, because I don't like the way they look. Film is pleasing.

---

I am considering purchasing a medium-format camera.
`;

export const POSTS: ReadonlyArray<Post> = [
  {
    slug: 'making-this-blog',
    title: 'Making This Blog',
    publishedOn: 'July 12, 2026',
    summary:
      'Markdown drawn as React Views, with a live counter nestled between paragraphs.',
    body: MAKING_THIS_BLOG,
  },
  {
    slug: 'shooting-film',
    title: 'Shooting Film',
    publishedOn: 'June 28, 2026',
    summary: 'Thirty-six chances per roll, and why film is pleasing.',
    body: SHOOTING_FILM,
  },
];

export const findPost = (slug: string) =>
  POSTS.find((post) => post.slug === slug);
