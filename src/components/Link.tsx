import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * App-wide Link with automatic prefetching off by default.
 * Every page here is dynamic (live job data), so prefetching gains little, and
 * in-flight prefetches could race with server-action refreshes on slow phones.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
