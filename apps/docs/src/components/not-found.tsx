import { Link } from '@tanstack/react-router';

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-6 py-16">
      <div>
        <h1 className="text-3xl font-medium tracking-tight">
          Not found<span className="text-primary">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist.{' '}
          <Link
            to="/"
            className="rounded-sm underline underline-offset-4 transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Go home
          </Link>
        </p>
      </div>
    </main>
  );
}
