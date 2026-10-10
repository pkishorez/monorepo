import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import { Link } from '../location/index.js';
import { CounterView } from './counter/index.js';
import { PersonalBlog, pageFrom } from './personal-blog.js';
import type { Page } from './personal-blog.js';
import { ABOUT, POSTS, findPost } from './posts/index.js';
import { Prose } from './prose/index.js';

type Navigate = (path: string) => void;

const NAV = 'text-sm transition hover:text-foreground';

const Header = ({
  page,
  onNavigate,
}: {
  readonly page: Page;
  readonly onNavigate: Navigate;
}) => (
  <header className="border-b">
    <div className="mx-auto flex max-w-2xl items-baseline justify-between px-6 py-6">
      <Link to="/" onNavigate={onNavigate} className="font-semibold">
        Devin Jameson
      </Link>
      <nav className="flex gap-6">
        <Link
          to="/"
          onNavigate={onNavigate}
          current={page._tag === 'Home'}
          className={`${NAV} ${page._tag === 'Home' ? 'font-semibold' : 'text-muted-foreground'}`}
        >
          About
        </Link>
        <Link
          to="/posts"
          onNavigate={onNavigate}
          current={page._tag === 'Posts' || page._tag === 'Post'}
          className={`${NAV} ${page._tag === 'Posts' || page._tag === 'Post' ? 'font-semibold' : 'text-muted-foreground'}`}
        >
          Posts
        </Link>
      </nav>
    </div>
  </header>
);

const PostsPage = ({ onNavigate }: { readonly onNavigate: Navigate }) => (
  <div>
    <h1 className="mb-8 text-3xl font-bold">Posts</h1>
    <ul className="space-y-8">
      {POSTS.map((post) => (
        <li key={post.slug}>
          <Link
            to={`/posts/${post.slug}`}
            onNavigate={onNavigate}
            className="group block"
          >
            <h2 className="text-xl font-semibold group-hover:underline">
              {post.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {post.publishedOn}
            </p>
            <p className="mt-2 leading-relaxed text-foreground/80">
              {post.summary}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

const NotFound = ({
  title,
  text,
  onNavigate,
}: {
  readonly title: string;
  readonly text: string;
  readonly onNavigate: Navigate;
}) => (
  <div className="flex flex-col gap-4">
    <h1 className="text-3xl font-bold">{title}</h1>
    <p className="text-muted-foreground">{text}</p>
    <Link
      to="/"
      onNavigate={onNavigate}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      ← Go home
    </Link>
  </div>
);

export const PersonalBlogView = View.make(
  PersonalBlog,
  ({ model, children, frame, send }) => {
    const page = pageFrom(model.path);
    const go = (path: string) => send({ _tag: 'ClickedLink', path });
    /* Every `::Counter` in any post draws the one Counter Child. */
    const islands = {
      Counter: (attributes: Readonly<Record<string, string>>) => (
        <div className="flex flex-col items-center gap-3 rounded-xl border py-6">
          <span className="text-sm text-muted-foreground">
            {attributes.label ?? 'Counter'}
          </span>
          <CounterView node={children.counter} frame={frame} />
        </div>
      ),
      Note: (_: unknown, inner: ReactNode) => (
        <aside className="rounded-lg border bg-muted/50 p-4">{inner}</aside>
      ),
    };
    const content = (() => {
      switch (page._tag) {
        case 'Opening':
          return null;
        case 'Home':
          return <Prose source={ABOUT} islands={islands} />;
        case 'Posts':
          return <PostsPage onNavigate={go} />;
        case 'Post': {
          const post = findPost(page.slug);
          if (!post)
            return (
              <NotFound
                title="Post Not Found"
                text={`There is no post named “${page.slug}”.`}
                onNavigate={go}
              />
            );
          return (
            <article>
              <Link
                to="/posts"
                onNavigate={go}
                className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground"
              >
                ← All posts
              </Link>
              <h1 className="text-3xl font-bold">{post.title}</h1>
              <p className="mt-2 mb-8 text-sm text-muted-foreground">
                {post.publishedOn}
              </p>
              <Prose source={post.body} islands={islands} />
            </article>
          );
        }
        case 'NotFound':
          return (
            <NotFound
              title="404"
              text={`The path “${page.path}” was not found.`}
              onNavigate={go}
            />
          );
      }
    })();
    return (
      <div className="size-full overflow-y-auto">
        <Header page={page} onNavigate={go} />
        <main className="mx-auto max-w-2xl px-6 py-10">{content}</main>
      </div>
    );
  },
);
