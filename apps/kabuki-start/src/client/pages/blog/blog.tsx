import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { PageFrame, Provenance, link, tile } from '../../components/index.ts';
import { Routes } from '../../../shared/index.ts';
import { Post } from './post/index.ts';

/*
 * The blog: the list of posts, loaded once for every page under /blog, and
 * the post the URL names. Both are static: drawn once per deploy. The index
 * is the list, so the blog's own View draws it, from its own Input.
 */

const posts = Routes.Blog.outlet({
  Index: () => null,
  Post,
});

const BlogActor = Actor.make('Blog', {
  input: Routes.Blog.input,
  props: Routes.Blog.props,
  model: Routes.Blog.input,
}).build({
  init: (list) => ({ model: list }),
  children: posts.children,
  invoke: posts.invoke,
});

const BlogView = View.make(BlogActor, (self) => (
  <div {...self.root} className="space-y-10">
    {self.props.page._tag === 'Index' ? (
      <PageFrame
        place="Blog.Index"
        title="Blog"
        intro="The list is the blog's own Input. Opening a post keeps it: only the post is loaded."
      >
        <ul className="grid max-w-2xl gap-3">
          {self.model.posts.map((post) => (
            <li key={post.slug}>
              <Router.Link
                to={Routes.Blog.Post({ slug: post.slug })}
                className={tile}
              >
                <Card size="sm">
                  <CardHeader>
                    <p className="font-mono text-xs text-muted-foreground">
                      {post.date}
                    </p>
                    <CardTitle>{post.title}</CardTitle>
                    <CardDescription>{post.summary}</CardDescription>
                  </CardHeader>
                </Card>
              </Router.Link>
            </li>
          ))}
        </ul>
        <Router.Link
          to={Routes.Blog.Post({ slug: 'missing' })}
          className={`${link} text-sm text-muted-foreground`}
        >
          A post that is not there
        </Router.Link>
      </PageFrame>
    ) : (
      <posts.View of={self} />
    )}
    <Provenance place="Blog" loadedAt={self.model.loadedAt} />
  </div>
));

export const Blog = { actor: BlogActor, view: BlogView };
